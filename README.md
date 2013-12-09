# voxel-land

A terrain generator combining several landform features. Grass, dirt, stone, trees.

Trees are provided by [voxel-forest](https://github.com/deathcap/voxel-forest),
and the overall grass surface by Perlin noise (similar to [voxel-perlin-terrain](https://github.com/maxogden/voxel-perlin-terrain):

![screenshot](http://i.imgur.com/ZzVFUAj.png "Screenshot overview")

Beneath the grass is dirt, and then all chunks below are stone:

![screenshot](http://i.imgur.com/D918dUX.png "Screenshot both")

![screenshot](http://i.imgur.com/XB8k8XP.png "Screenshot mined")

## Usage

    var createLand = require('voxel-land');
    var land = createLand(game, opts);
    land.enable();

or with [voxel-plugins](https://github.com/deathcap/voxel-plugins):

    plugins.load('land', opts);

The voxel-engine game options should have `generateChunks: false`. voxel-land
will listen on `game.voxel` for the `missingChunk` event and generate the new
chunks. The listener can be unregistered with `land.disable()`.

## License

MIT

