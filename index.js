// # vim: set shiftwidth=2 tabstop=2 softtabstop=2 expandtab:

var webworkify = require('webworkify');

module.exports = function(game, opts) {
  return new Land(game, opts);
};

module.exports.pluginInfo = {
  loadAfter: ['voxel-registry']
};

function Land(game, opts) {
  this.game = game;

  if (!game.plugins || !game.plugins.get('voxel-registry')) throw 'voxel-land requires voxel-registry';
  var registry = game.plugins.get('voxel-registry');

  opts = opts || {};
  opts.seed = opts.seed || 'foo';
  opts.materials = opts.materials || {  // TODO: how about getting directly instead of having this map here?
    grass: registry.getBlockID('grass'),
    dirt: registry.getBlockID('dirt'),
    stone: registry.getBlockID('stone'),
    bark: registry.getBlockID('logOak'),
    leaves: registry.getBlockID('leavesOak')};

  opts.crustLower = opts.crustLower === undefined ? 0 : opts.crustLower;
  opts.crustUpper = opts.crustUpper === undefined ? 2 : opts.crustUpper;
  opts.hillScale = opts.hillScale || 20;
  opts.roughnessScale = opts.roughnessScale || 200;
  opts.populateTrees = (opts.populateTrees !== undefined) ? opts.populateTrees : true;
  opts.chunkSize = game.chunkSize || 32;

  // can't clone types, so need to send size instead
  if (game.arrayType === Uint8Array || game.arrayType === Uint8ClampedArray)
    opts.arrayElementSize = 1;
  else if (game.arrayType === Uint16Array)
    opts.arrayElementSize = 2;
  else if (game.arrayType === Uint32Array)
    opts.arrayElementSize = 4;
  else
    throw 'voxel-land unknown game.arrayType: ' + game.arrayType

  this.opts = opts;

  this.worker = webworkify(require('./worker.js'));
  
  this.enable();
}

Land.prototype.enable = function() {
  this.bindEvents();
};

Land.prototype.disable = function() {
  this.unbindEvents();
};

Land.prototype.bindEvents = function() {
  var self = this;

  self.worker.postMessage({cmd: 'configure', opts:self.opts});

  this.game.voxels.on('missingChunk', this.missingChunk = function(pos) {
    self.worker.postMessage({cmd: 'generateChunk', pos:pos})
  });

  self.worker.addEventListener('message', function(ev) {
    if (ev.data.cmd === 'chunkGenerated') {
      var voxels = new self.game.arrayType(ev.data.voxelBuffer);
      var chunk = {
        position: ev.data.position,
        dims: [self.game.chunkSize, self.game.chunkSize, self.game.chunkSize],
        voxels: voxels}; 

      self.game.showChunk(chunk);
    } else if (ev.data.cmd === 'decorate') {
      var changes = ev.data.changes;
      for (var i = 0; i < changes.length; ++i) {
        var pos = changes[i][0];
        var value = changes[i][1];

        //console.log('set',pos,value);
        self.game.setBlock(pos, value); // TODO: faster mass edit?
      }
    }
  });
};

Land.prototype.unbindEvents = function() {
  this.game.voxels.removeListener('missingChunk', this.missingChunk);
};
