// # vim: set shiftwidth=2 tabstop=2 softtabstop=2 expandtab:

var createTerrain = require('voxel-perlin-terrain');
var createTree = require('voxel-forest');


module.exports = function(game, opts) {
  return new Land(game, opts);
}

function Land(game, opts) {
  this.game = game;
  this.seed = opts.seed || 'foo';
  this.materials = opts.materials || {stone: 3, bark: 4, leaves:9};

  this.generateGround = createTerrain(this.seed, 0, 5, 20);

  this.bindEvents();
}

Land.prototype.bindEvents = function() {
  var self = this;

  this.game.voxels.on('missingChunk', this.missingChunk = function(p) {
    var width = self.game.chunkSize;
    var voxels;

    if (p[1] === 0) {
      // ground surface level
      voxels = self.generateGround(p, width); // TODO: configurable material (dirt)
      // TODO: fill voxels below with dirt

      // populate chunk with trees
      // TODO: populate later, so structures can cross chunks??
      createTree(self.game, {
        bark: self.materials.bark,
        leaves: self.materials.leaves,
        position: {x:width/2, y:0, z:width/2}, // TODO: position at top of surface
        treetype: 1,
        setBlock: function (pos, value) {
          idx = pos.x + pos.y * width + pos.z * width * width;
          voxels[idx] = value;
          return false;  // returning true stops tree
        }
      });
    } else if (p[1] > 0) {
      // empty space above ground
      voxels = new Int8Array(width * width * width);
    } else {
      // below ground
      // TODO: ores
      voxels = new Int8Array(width * width * width);
      for (var i = 0; i < width * width * width; ++i) {
        voxels[i] = self.materials.stone;  // stone
      }
    }

    var chunk = {
      position: p,
      dims: [self.game.chunkSize, self.game.chunkSize, self.game.chunkSize],
      voxels: voxels
    }

    self.game.showChunk(chunk);
  });
};

Land.prototype.unbindEvents = function() {
  this.game.removeListener('missingChunk', this.missingChunk);
};
