// # vim: set shiftwidth=2 tabstop=2 softtabstop=2 expandtab:

var createTree = require('voxel-forest');
var perlin = require('perlin');

module.exports = function(game, opts) {
  return new Land(game, opts);
}

function Land(game, opts) {
  this.game = game;
  this.seed = opts.seed || 'foo';
  this.materials = opts.materials || {grass: 1, dirt: 2, stone: 3, bark: 4, leaves:9};
  this.crustLower = opts.crustLower || 0;
  this.crustUpper = opts.crustUpper || 5;
  this.perlinDivisor = opts.perlinDivisor || 20;
  this.populateTrees = (opts.populateTrees !== undefined) ? opts.populateTrees : true;

  this.noise = perlin.noise;
  this.noise.seed(opts.seed);
}

Land.prototype.enable = function() {
  this.bindEvents();
};

Land.prototype.disable = function() {
  this.unbindEvents();
};

// calculate terrain height based on perlin noise 
// see @maxogden's voxel-perlin-terrain https://github.com/maxogden/voxel-perlin-terrain
Land.prototype.generateHeightMap = function(position, width) {
  var startX = position[0] * width;
  var startY = position[1] * width;
  var startZ = position[2] * width;
  var heightMap = new Int8Array(width * width);

  for (var x = startX; x < startX + width; x++) {
    for (var z = startZ; z < startZ + width; z++) {
      var n = this.noise.simplex2(x / this.perlinDivisor, z / this.perlinDivisor);
      var y = ~~scale(n, -1, 1, this.crustLower, this.crustUpper);

      if (y === this.crustLower || startY < y && y < startY + width) {
        var xidx = Math.abs((width + x % width) % width);
        var yidx = Math.abs((width + y % width) % width);
        var zidx = Math.abs((width + z % width) % width);
        var idx = xidx + yidx * width + zidx * width * width;
        heightMap[xidx + zidx * width] = yidx;
      }
    }
  }

  return heightMap;
};

function scale( x, fromLow, fromHigh, toLow, toHigh ) {
  return ( x - fromLow ) * ( toHigh - toLow ) / ( fromHigh - fromLow ) + toLow;
}

Land.prototype.bindEvents = function() {
  var self = this;

  this.game.voxels.on('missingChunk', this.missingChunk = function(p) {
    var width = self.game.chunkSize;
    var voxels = new Int8Array(width * width * width);

    if (p[1] === 0) {
      // ground surface level
      var heightMap = self.generateHeightMap(p, width);

      for (var x = 0; x < width; ++x) {
        for (var z = 0; z < width; ++z) {
          var height = heightMap[x + z * width];
          var y = height;

          // dirt with grass on top
          voxels[x + y * width + z * width * width] = self.materials.grass;
          while(y-- > 0)
            voxels[x + y * width + z * width * width] = self.materials.dirt;

          // populate chunk with trees
          // TODO: populate later, so structures can cross chunks??
          if (self.populateTrees && x === width/2 && z === width/2)  // TODO: populate randomly based on seed
            createTree(self.game, { 
              bark: self.materials.bark,
              leaves: self.materials.leaves,
              position: {x:x, y:height + 1, z:z}, // position at top of surface
              treetype: 1,
              setBlock: function (pos, value) {
                idx = pos.x + pos.y * width + pos.z * width * width;
                voxels[idx] = value;
                return false;  // returning true stops tree
              }
            });
        }
      }
    } else if (p[1] > 0) {
      // empty space above ground
    } else {
      // below ground
      // TODO: ores
      for (var i = 0; i < width * width * width; ++i) {
        voxels[i] = self.materials.stone;
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
  this.game.voxels.removeListener('missingChunk', this.missingChunk);
};
