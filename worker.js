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
  var heightMap = new Uint8Array(width * width);

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

// Add per-chunk features
// Mutate voxels array
ChunkGenerator.prototype.populateChunk = function(random, chunkX, chunkY, chunkZ, chunkHeightMap, voxels) {
  // populate chunk with features that don't need to cross chunks TODO: customizable
  // ores?
};

// Add possibly-cross-chunk features, with global world coordinates (slower)
// Return list of changes to voxels to make
ChunkGenerator.prototype.decorate = function(random, chunkX, chunkY, chunkZ, chunkHeightMap) {
  var changes = [];
  var width = this.opts.chunkSize;
  var startX = chunkX * width;
  var startY = chunkY * width;
  var startZ = chunkZ * width;

  // TODO: iterate list of 'decorators'

  // "craters" (TODO: fill with water to make lakes)
  if (random() < 0.30) {
    var radius = ~~(random() * 10);
    for (var dx = -radius; dx <= radius; ++dx) {
      for (var dy = -radius; dy <= radius; ++dy) {
        for (var dz = -radius; dz <= radius; ++dz) {
          var distance = Math.sqrt(dx*dx + dy*dy + dz*dz); // TODO: better algorithm
          if (distance < radius)
            changes.push([[startX+dx, startY+dy, startZ+dz], 0]);
        }
      }
    }
    return changes; // don't generate trees on top TODO: smarter - update heightmap maybe
  }

  // trees
  if (!this.opts.populateTrees) 
    return;

  // TODO: large-scale biomes, with higher tree density? forests
  var treeCount = ~~scale(this.noiseTrees.noise2D(chunkX / this.opts.treesScale, chunkZ / this.opts.treesScale), -1, 1, 0, this.opts.treesMaxDensity);

  for (var i = 0; i < treeCount; ++i) {
    // scatter randomly around chunk
    var dx = ~~scale(random(), 0, 1, 0, width - 1);
    var dz = ~~scale(random(), 0, 1, 0, width - 1);

    // position at top of surface 
    var dy = chunkHeightMap[dx + dz * width] + 1;

    var n = random();
    var treeType;
    if (n < 0.05)
      treeType = 'guybrush';
    //else if (n < 0.20)
    //  treeType = 'fractal';  // too weird
    else
      treeType = 'subspace';

    createTree({ 
      random: random,
      bark: this.opts.materials.bark,
      leaves: this.opts.materials.leaves,
      position: {x:startX + dx, y:startY + dy, z:startZ + dz},
      treeType: treeType,
      setBlock: function (pos, value) {
        changes.push([[pos.x, pos.y, pos.z], value]);
        return false;  // returning true stops tree
      }
    });
  }


  return changes;
};

ChunkGenerator.prototype.generateChunk = function(pos) {
  var width = this.opts.chunkSize;
  var arrayType = {1:Uint8Array, 2:Uint16Array, 4:Uint32Array}[this.opts.arrayElementSize];
  var buffer = new ArrayBuffer(width * width * width * this.opts.arrayElementSize);
  var voxels = new arrayType(buffer);
  var changes = undefined;

  /* to prove this code truly is running asynchronously
  var i=0;
  console.log('lag');
  while(i<1000000000)
    i++;
  console.log('lag done');
  */

  /* to generate only specific chunks for testing
  var cstr = pos[0] + ',' + pos[2];
  var okc = [ 
"-1,-1",
"0,0"];
  if (okc.indexOf(cstr) == -1) return;
  */

  if (pos[1] === 0) {
    // ground surface level
    var heightMap = this.generateHeightMap(pos, width);

    for (var x = 0; x < width; ++x) {
      for (var z = 0; z < width; ++z) {
        var y = heightMap[x + z * width];

        // dirt with grass on top
        voxels[x + y * width + z * width * width] = this.opts.materials.grass;
        while(y-- > 0)
          voxels[x + y * width + z * width * width] = this.opts.materials.dirt;

      }
    }
    // features
    var random = new Alea(pos[0] + pos[1] * width + pos[2] * width * width); // TODO: sufficient?
    this.populateChunk(random, pos[0], pos[1], pos[2], heightMap, voxels);
    changes = this.decorate(random, pos[0], pos[1], pos[2], heightMap); // TODO: should run in another worker, to not block terrain gen?
  } else if (pos[1] > 0) {
    // empty space above ground
  } else {
    // below ground
    // TODO: ores
    for (var i = 0; i < width * width * width; ++i) {
      voxels[i] = this.opts.materials.stone;
    }
  }

  this.worker.postMessage({cmd: 'chunkGenerated', position: pos, voxelBuffer: buffer}, [buffer]);
  if (changes) this.worker.postMessage({cmd: 'decorate', changes:changes}); // TODO: use transferrable?
};

module.exports = function() {
  var gen;
  ever(this).on('message', function(ev) {

    if (ev.data.cmd === 'configure') {
      gen = new ChunkGenerator(this, ev.data.opts);
    } else if (ev.data.cmd === 'generateChunk') {
      if (gen === undefined) throw "voxel-land web worker error: received 'generateChunk' before 'configure'";
      gen.generateChunk(ev.data.pos);
    }
  });
};


