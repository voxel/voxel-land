var ever = require('ever');
var createTree = require('voxel-trees');
var SimplexNoise = require('simplex-noise');
var Alea = require('alea');

function ChunkGenerator(worker, opts) {
  this.worker = worker;
  this.opts = opts;

  var random = this.random = new Alea(this.opts.seed);

  var randomHills = new Alea(random());
  var randomRoughness = new Alea(random());
  var randomTrees = new Alea(random());

  this.noiseHills = new SimplexNoise(function() { return randomHills(); });
  this.noiseRoughness = new SimplexNoise(function() { return randomRoughness(); });
  this.noiseTrees = new SimplexNoise(function() { return randomTrees(); });

  return this;
};

// calculate terrain height based on perlin noise 
// see @maxogden's voxel-perlin-terrain https://github.com/maxogden/voxel-perlin-terrain
ChunkGenerator.prototype.generateHeightMap = function(position, width) {
  var startX = position[0] * width;
  var startY = position[1] * width;
  var startZ = position[2] * width;
  var heightMap = new Int8Array(width * width);

  for (var x = startX; x < startX + width; x++) {
    for (var z = startZ; z < startZ + width; z++) {

      // large scale ruggedness of terrain
      var roughness = this.noiseRoughness.noise2D(x / this.opts.roughnessScale, z / this.opts.roughnessScale);
      roughnessTerm = Math.floor(Math.pow(scale(roughness, -1, 1, 0, 2), 5));

      // smaller scale local hills
      var n = this.noiseHills.noise2D(x / this.opts.hillScale, z / this.opts.hillScale);
      var y = ~~scale(n, -1, 1, this.opts.crustLower, this.opts.crustUpper + roughnessTerm);
      if (roughnessTerm < 1) y = this.opts.crustLower; // completely flat ("plains")
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

ChunkGenerator.prototype.populateChunk = function(x, height, z, voxels) {
  var width = this.opts.chunkSize;

  // populate chunk with trees TODO: customizable

  // TODO: populate later, so structures can cross chunks??
  if (this.opts.populateTrees) {
    var n = this.noiseTrees.noise2D(x, z); // [-1,1]
    if (n < 0) {
      createTree(null, { 
        bark: this.opts.materials.bark,
        leaves: this.opts.materials.leaves,
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

ChunkGenerator.prototype.generateChunk = function(pos) {
  var width = this.opts.chunkSize;
  var voxels = new Int8Array(width * width * width);

  /* to prove this code truly is running asynchronously
  var i=0;
  console.log('lag');
  while(i<1000000000)
    i++;
  console.log('lag done');
  */

  console.log('in generateChunk',pos);
  if (pos[1] === 0) {
    // ground surface level
    var heightMap = this.generateHeightMap(pos, width);

    for (var x = 0; x < width; ++x) {
      for (var z = 0; z < width; ++z) {
        var height = heightMap[x + z * width];
        var y = height;

        // dirt with grass on top
        voxels[x + y * width + z * width * width] = this.opts.materials.grass;
        while(y-- > 0)
          voxels[x + y * width + z * width * width] = this.opts.materials.dirt;

      }
    }
    // features
    this.populateChunk(x, y, z, voxels);
  } else if (pos[1] > 0) {
    // empty space above ground
  } else {
    // below ground
    // TODO: ores
    for (var i = 0; i < width * width * width; ++i) {
      voxels[i] = this.opts.materials.stone;
    }
  }

  var chunk = {
    position: pos,
    dims: [this.opts.chunkSize, this.opts.chunkSize, this.opts.chunkSize],
    voxels: voxels
  }

  console.log('about to send chunkGenerated');
  this.worker.postMessage({cmd: 'chunkGenerated', chunk:chunk});
};

module.exports = function() {
  var gen;
  ever(this).on('message', function(ev) {
    console.log('worker got '+JSON.stringify(ev.data));

    if (ev.data.cmd === 'configure') {
      console.log('configuring');
      gen = new ChunkGenerator(this, ev.data.opts);
      console.log('gen=',gen);
    } else if (ev.data.cmd === 'generateChunk') {
      if (gen === undefined) throw "voxel-land web worker error: received 'generateChunk' before 'configure'";
      gen.generateChunk(ev.data.pos);
    }
  });
};


