# BugZapper

A 3D browser game built from scratch in WebGL with custom GLSL shaders, no external 3D libraries. Zap bacteria off a rotating sphere before two of them grow past the critical size.

**[Play it live](https://prashaantm.github.io/BugZapper/)**

## How to play

- Drag to rotate the sphere.
- Hover over a bacterium, then click, press Space, or hit the Zap button to eliminate it.
- Bacteria grow over time; if two reach critical size before you clear 50 total, it's game over.
- New bacteria spawn faster and grow quicker the longer the round runs.

## Tech

- Raw WebGL1 + GLSL (vertex/fragment shaders defined inline in `index.html`)
- Custom sphere, bacterium-cap, and grid-dot geometry generated procedurally each frame (`bug.js`)
- Color-based GPU pixel picking for hover/click detection instead of ray casting
- `MV.js` / `webgl-utils.js` / `initShaders.js`: the standard matrix/vector and WebGL setup helpers this course track uses

## Running locally

Just open `index.html` in a browser, or serve the folder with any static file server:

```
python3 -m http.server
```
