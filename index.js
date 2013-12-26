// # vim: set shiftwidth=2 tabstop=2 softtabstop=2 expandtab:

var webworkify = require('webworkify');

module.exports = function(game, opts) {
  return new Land(game, opts);
}

function Land(game, opts) {
  this.game = game;
  opts = opts || {};

  opts.seed = opts.seed || 'foo';
  opts.materials = opts.materials || {grass: 1, dirt: 2, stone: 3, bark: 4, leaves:9};
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
