// # vim: set shiftwidth=2 tabstop=2 softtabstop=2 expandtab:

var webworkify = require('webworkify');

module.exports = function(game, opts) {
  return new Land(game, opts);
};

module.exports.pluginInfo = {
  loadAfter: ['voxel-registry', 'craftingrecipes']
};

function Land(game, opts) {
  this.game = game;

  if (!game.plugins || !game.plugins.get('voxel-registry')) throw 'voxel-land requires voxel-registry';
  this.registry = game.plugins.get('voxel-registry');

  opts = opts || {};
  opts.seed = opts.seed || 'foo';
  opts.materials = opts.materials || undefined;

  opts.crustLower = opts.crustLower === undefined ? 0 : opts.crustLower;
  opts.crustUpper = opts.crustUpper === undefined ? 2 : opts.crustUpper;
  opts.hillScale = opts.hillScale || 20;
  opts.roughnessScale = opts.roughnessScale || 200;
  opts.populateTrees = (opts.populateTrees !== undefined) ? opts.populateTrees : true;
  opts.treesScale = opts.treesScale || 200;
  opts.treesMaxDensity = (opts.treesMaxDensity !== undefined) ? opts.treesMaxDensity : 5;
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

  this.enable();
}

Land.prototype.enable = function() {
  this.registerBlocks();
  this.worker = webworkify(require('./worker.js'));
  this.bindEvents();
};

Land.prototype.disable = function() {
  this.unbindEvents();
  // TODO: unregister blocks?
};

Land.prototype.registerBlocks = function()  {
  if (this.opts.materials) return; // only register blocks once TODO: remove after adding unregister

  this.registry.registerBlock('grass', {texture: ['grass_top', 'dirt', 'grass_side'], hardness:5, itemDrop: 'dirt'});
  this.registry.registerBlock('dirt', {texture: 'dirt', hardness:4});
  this.registry.registerBlock('stone', {texture: 'stone', hardness:90, itemDrop: 'cobblestone'});
  this.registry.registerBlock('logOak', {texture: ['log_oak_top', 'log_oak_top', 'log_oak'], hardness:8});
  this.registry.registerBlock('cobblestone', {texture: 'cobblestone', hardness:80});
  this.registry.registerBlock('oreCoal', {texture: 'coal_ore'});
  this.registry.registerBlock('brick', {texture: 'brick'}); // some of the these blocks don't really belong here..do they?
  this.registry.registerBlock('obsidian', {texture: 'obsidian', hardness: 900});
  this.registry.registerBlock('leavesOak', {texture: 'leaves_oak_opaque', hardness: 2, itemDrop: null});
  this.registry.registerBlock('glass', {texture: 'glass'});

  this.registry.registerBlock('logBirch', {texture: ['log_birch_top', 'log_birch_top', 'log_birch'], hardness:8}); // TODO: generate

  var recipes = this.game.plugins.get('craftingrecipes');
  if (recipes) { // TODO: should these be properties on voxel-registry, instead?
    recipes.thesaurus.registerName('wood.log', 'logOak');
    recipes.thesaurus.registerName('wood.log', 'logBirch');
    recipes.thesaurus.registerName('tree.leaves', 'leavesOak');
  }

  // for passing to worker
  this.opts.materials = this.opts.materials || {
    grass: this.registry.getBlockID('grass'),
    dirt: this.registry.getBlockID('dirt'),
    stone: this.registry.getBlockID('stone'),
    bark: this.registry.getBlockID('logOak'),
    leaves: this.registry.getBlockID('leavesOak')};
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
        // TODO: what if pos is out of loaded chunk range? doesn't automatically load chunk; change will be lost
      }
    }
  });
};

Land.prototype.unbindEvents = function() {
  this.game.voxels.removeListener('missingChunk', this.missingChunk);
};
