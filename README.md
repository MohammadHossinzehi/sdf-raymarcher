# SDF Ray Marcher

A from-scratch WebGL2 ray marcher: every pixel sphere-traces a signed
distance field (SDF) scene directly in a fragment shader, no mesh data
and no external rendering library. It renders three primitives (two
spheres and a box) merged with a polynomial smooth-min so they blend
into each other like metaballs, plus an independently orbiting torus,
a ground plane, raymarched soft shadows, and cheap ambient occlusion.
An orbit camera lets you fly around the scene with the mouse.

## Why ray marching instead of ray tracing

A classic ray tracer intersects rays against primitives with closed-form
formulas (ray-sphere, ray-plane, ...). That works well for hard-edged
scenes but has no good answer for "blend these two shapes into one
organic surface." A signed distance field only needs a function that
returns the distance to the nearest surface from any point in space, so
combining shapes is just combining distance functions. Sphere tracing
(the ray marching algorithm) walks a ray forward by exactly that
distance at each step, which is guaranteed not to overshoot the surface
since the SDF is a safe lower bound on how far you can travel.
Everything else in this project (normals, shadows, ambient occlusion)
falls out of sampling the same distance function a few extra times per
pixel, which is what makes SDFs a favorite technique in the demoscene
and in tools like Shadertoy.

## What's in the scene

- Two spheres and a box, combined with a polynomial smooth-min so they
  melt into a single blobby surface as they drift past each other.
- A torus that spins around the blob group on its own orbit.
- A ground plane that grounds the scene and catches shadows.
- Soft shadows, computed by marching a second ray toward the light and
  tracking the tightest pinch between the ray and the surface along the
  way (this is what gives the shadow a soft penumbra instead of a hard
  edge).
- Ambient occlusion, approximated by sampling the SDF a few steps along
  the surface normal and darkening spots where nearby geometry crowds
  the surface.

## Running it

This is a static site with no build step. From the project root:

```bash
npx --yes serve . -l 8080
# or: npm run serve
```

Then open `http://localhost:8080` in a browser with WebGL2 support
(any current Chrome, Firefox, Edge, or Safari). Opening `index.html`
directly via `file://` also works in most browsers since the shader is
loaded as an inline JS string, not a separate fetch.

Controls:

- Drag to orbit the camera.
- Scroll to zoom in and out.
- The panel in the top-left lets you adjust the smooth-min blend radius
  and toggle soft shadows / ambient occlusion on and off, so you can see
  their effect directly.

## Design decisions

- **Everything lives in the fragment shader.** There's no vertex buffer
  beyond a full-screen triangle (`src/shaders.js`, vertex stage); the
  entire scene, camera projection, and shading model are evaluated per
  pixel in GLSL. This keeps the renderer to a single draw call.
- **Camera math is factored out of the shader pipeline.** `src/camera.js`
  is a small, dependency-free ES module of pure functions (orthonormal
  basis construction, drag-to-orbit, wheel-to-zoom). It has no DOM or
  WebGL calls, which is what makes it possible to unit test with plain
  Node instead of needing a headless browser or a WebGL mock.
- **Smooth-min blending (`smoothMin` in `src/shaders.js`)** uses Inigo
  Quilez's polynomial smooth minimum, which is cheap (no branching, no
  trig) and gives a tunable blend radius (`uBlendK`) exposed directly to
  the UI slider.
- **Soft shadows and ambient occlusion are both optional toggles**, left
  in the UI on purpose: turning them off makes it easy to see exactly
  what each technique contributes to the final image, which is useful
  both for demoing the project and for debugging it.

## Testing

`src/camera.js` has a full unit test suite in `test/camera.test.js`,
runnable with zero dependencies:

```bash
node test/camera.test.js
# or: npm test
```

It checks that the camera basis stays orthonormal, that the eye lands at
the requested orbit distance and looks at the target, that pitch is
clamped near the poles without the basis degenerating, and that drag/zoom
input maps to the expected yaw/pitch/distance changes. The GLSL side
(scene SDF, shading, shadows, AO) isn't unit tested since it has no
meaningful Node-side equivalent to run it against; it's instead
verified visually through the interactive demo and by toggling each
shading term independently via the UI.
