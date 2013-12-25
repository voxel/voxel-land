// # vim: set shiftwidth=2 tabstop=2 softtabstop=2 expandtab:

var createTree = require('voxel-trees');
var SimplexNoise = require('simplex-noise');
var Alea = require('alea');

module.exports = function(game, opts) {
  return new Land(game, opts);
}

function Land(game, opts) {
  this.game = game;
  this.seed = opts.seed || 'foo';
  this.materials = opts.materials || {grass: 1, dirt: 2, stone: 3, bark: 4, leaves:9};
  this.crustLower = opts.crustLower === undefined ? 0 : opts.crustLower;
  this.crustUpper = opts.crustUpper === undefined ? 2 : opts.crustUpper;
  this.hillScale = opts.hillScale || 20;
  this.roughnessScale = opts.roughnessScale || 200;
  this.populateTrees = (opts.populateTrees !== undefined) ? opts.populateTrees : true;

  var random = this.random = new Alea(this.seed);

  var randomHills = new Alea(random());
  var randomRoughness = new Alea(random());
  var randomTrees = new Alea(random());

  this.noiseHills = new SimplexNoise(function() { return randomHills(); });
  this.noiseRoughness = new SimplexNoise(function() { return randomRoughness(); });
  this.noiseTrees = new SimplexNoise(function() { return randomTrees(); });
  this.enable();
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

      // large scale ruggedness of terrain
      var roughness = this.noiseRoughness.noise2D(x / this.roughnessScale, z / this.roughnessScale);
      roughnessTerm = Math.floor(Math.pow(scale(roughness, -1, 1, 0, 2), 5));

      // smaller scale local hills
      var n = this.noiseHills.noise2D(x / this.hillScale, z / this.hillScale);
      var y = ~~scale(n, -1, 1, this.crustLower, this.crustUpper + roughnessTerm);
      if (roughnessTerm < 1) y = this.crustLower; // completely flat ("plains")
      //y = roughnessFactor; // to debug roughness map

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

Land.prototype.populateChunk = function(x, height, z, voxels) {
  var width = this.game.chunkSize;

  // populate chunk with trees TODO: customizable

  // TODO: populate later, so structures can cross chunks??
  if (this.populateTrees) {
    var n = this.noiseTrees.noise2D(x, z); // [-1,1]
    if (n < 0) {
      createTree(this.game, { 
        bark: this.materials.bark,
        leaves: this.materials.leaves,
        //position: {x:x, y:height + 1, z:z}, // position at top of surface
        position: {x:width/2, y:height + 1, z:width/2}, // position at top of surface
        treetype: 1,
        setBlock: function (pos, value) {
          idx = pos.x + pos.y * width + pos.z * width * width;
          voxels[idx] = value;
          return false;  // returning true stops tree
        }
      });
    }
  }
};


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

        }
      }
      // features
      self.populateChunk(x, y, z, voxels);
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
