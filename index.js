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
      var chunk = ev.data.chunk;

      self.game.showChunk(chunk);
    }
  });
};

Land.prototype.unbindEvents = function() {
  this.game.voxels.removeListener('missingChunk', this.missingChunk);
};
