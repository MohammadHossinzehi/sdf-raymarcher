// camera.js
//
// Pure math for an orbit camera used by the ray marcher. Kept free of any
// WebGL or DOM calls so it can be unit tested with plain Node and reused
// verbatim inside the fragment shader's JS-side uniform setup.
//
// Convention: yaw rotates around the world Y axis, pitch tilts up/down and
// is clamped to avoid gimbal flip at the poles. Distance is measured from
// the orbit target along the camera's backward direction.

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

export function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale3(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

const PITCH_LIMIT = 1.5533430342749535; // ~89 degrees in radians

/**
 * Compute an orthonormal camera basis (eye, forward, right, up) for an
 * orbit camera looking at `target` from `distance` away, oriented by
 * `yaw`/`pitch` (radians).
 */
export function computeCameraBasis(yaw, pitch, distance, target = [0, 0, 0]) {
  const p = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);

  // Spherical -> cartesian offset from the target, pitch measured from the
  // horizontal plane so pitch = 0 looks straight at the target's height.
  const cosP = Math.cos(p);
  const offset = [
    distance * cosP * Math.sin(yaw),
    distance * Math.sin(p),
    distance * cosP * Math.cos(yaw),
  ];

  const eye = add3(target, offset);
  const forward = normalize3([
    target[0] - eye[0],
    target[1] - eye[1],
    target[2] - eye[2],
  ]);

  const worldUp = [0, 1, 0];
  let right = cross3(forward, worldUp);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) {
    // forward is parallel to worldUp; pick an arbitrary stable right vector
    right = [1, 0, 0];
  } else {
    right = normalize3(right);
  }
  const up = normalize3(cross3(right, forward));

  return { eye, forward, right, up };
}

/**
 * Advance an orbit yaw/pitch pair from a mouse-drag delta (in pixels),
 * returning the new {yaw, pitch}. Kept separate from event handling so it
 * is trivially testable.
 */
export function orbitFromDrag(yaw, pitch, dx, dy, sensitivity = 0.005) {
  const newYaw = yaw - dx * sensitivity;
  const newPitch = clamp(pitch - dy * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
  return { yaw: newYaw, pitch: newPitch };
}

/**
 * Zoom (change orbit distance) from a wheel delta, clamped to a sane range.
 */
export function zoomFromWheel(distance, deltaY, sensitivity = 0.0015, min = 1.5, max = 40) {
  const factor = Math.exp(deltaY * sensitivity);
  return clamp(distance * factor, min, max);
}
