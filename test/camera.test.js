// camera.test.js
//
// Zero-dependency test runner for the camera math module. Run with:
//   node test/camera.test.js
//
// Each test throws on failure; failures are collected and reported with a
// non-zero exit code so this also works as a CI check.

import {
  computeCameraBasis,
  orbitFromDrag,
  zoomFromWheel,
  normalize3,
  cross3,
  dot3,
  clamp,
} from "../src/camera.js";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

function assertVecApprox(v, expected, eps = 1e-5) {
  for (let i = 0; i < 3; i++) {
    assert(
      approxEqual(v[i], expected[i], eps),
      `vector mismatch at index ${i}: got ${v[i]}, expected ${expected[i]}`
    );
  }
}

test("clamp bounds values", () => {
  assert(clamp(5, 0, 10) === 5);
  assert(clamp(-5, 0, 10) === 0);
  assert(clamp(50, 0, 10) === 10);
});

test("normalize3 produces a unit vector", () => {
  const n = normalize3([3, 4, 0]);
  const len = Math.hypot(n[0], n[1], n[2]);
  assert(approxEqual(len, 1), `expected unit length, got ${len}`);
  assertVecApprox(n, [0.6, 0.8, 0]);
});

test("normalize3 handles the zero vector without NaNs", () => {
  const n = normalize3([0, 0, 0]);
  assertVecApprox(n, [0, 0, 0]);
});

test("cross3 of orthogonal unit axes matches the right-hand rule", () => {
  const x = [1, 0, 0];
  const y = [0, 1, 0];
  assertVecApprox(cross3(x, y), [0, 0, 1]);
  assertVecApprox(cross3(y, x), [0, 0, -1]);
});

test("dot3 of orthogonal vectors is zero", () => {
  assert(dot3([1, 0, 0], [0, 1, 0]) === 0);
});

test("computeCameraBasis returns an orthonormal basis", () => {
  const { forward, right, up } = computeCameraBasis(0.7, 0.3, 5.0);
  const lenF = Math.hypot(...forward);
  const lenR = Math.hypot(...right);
  const lenU = Math.hypot(...up);
  assert(approxEqual(lenF, 1), `forward not unit length: ${lenF}`);
  assert(approxEqual(lenR, 1), `right not unit length: ${lenR}`);
  assert(approxEqual(lenU, 1), `up not unit length: ${lenU}`);
  assert(approxEqual(dot3(forward, right), 0, 1e-5), "forward/right not orthogonal");
  assert(approxEqual(dot3(forward, up), 0, 1e-5), "forward/up not orthogonal");
  assert(approxEqual(dot3(right, up), 0, 1e-5), "right/up not orthogonal");
});

test("computeCameraBasis places the eye at the requested distance from target", () => {
  const target = [1, 2, 3];
  const distance = 7.5;
  const { eye } = computeCameraBasis(1.1, -0.4, distance, target);
  const dx = eye[0] - target[0];
  const dy = eye[1] - target[1];
  const dz = eye[2] - target[2];
  const dist = Math.hypot(dx, dy, dz);
  assert(approxEqual(dist, distance, 1e-4), `expected distance ${distance}, got ${dist}`);
});

test("computeCameraBasis forward vector points from eye toward target", () => {
  const target = [0, 0, 0];
  const { eye, forward } = computeCameraBasis(0.2, 0.1, 4.0, target);
  const toTarget = normalize3([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  assertVecApprox(forward, toTarget, 1e-4);
});

test("computeCameraBasis clamps pitch near the poles without collapsing the basis", () => {
  const { forward, right, up } = computeCameraBasis(0, 100, 5.0);
  assert(Number.isFinite(forward[0]) && Number.isFinite(forward[1]) && Number.isFinite(forward[2]));
  const lenR = Math.hypot(...right);
  const lenU = Math.hypot(...up);
  assert(approxEqual(lenR, 1, 1e-4), "right degenerates near the pole");
  assert(approxEqual(lenU, 1, 1e-4), "up degenerates near the pole");
});

test("orbitFromDrag moves yaw/pitch in the expected directions", () => {
  const start = { yaw: 0, pitch: 0 };
  const afterDragRight = orbitFromDrag(start.yaw, start.pitch, 100, 0);
  assert(afterDragRight.yaw < start.yaw, "dragging right should decrease yaw under this convention");

  const afterDragDown = orbitFromDrag(start.yaw, start.pitch, 0, 100);
  assert(afterDragDown.pitch < start.pitch, "dragging down should decrease pitch");
});

test("orbitFromDrag clamps pitch to the pole limit", () => {
  const result = orbitFromDrag(0, 0, 0, 1_000_000);
  assert(result.pitch > -1.6 && result.pitch < 1.6, "pitch escaped the clamp range");
});

test("zoomFromWheel zooms out on positive deltaY and clamps to max", () => {
  const zoomedOut = zoomFromWheel(5, 100);
  assert(zoomedOut > 5, "positive wheel delta should increase distance");
  const clampedMax = zoomFromWheel(39.9, 1_000_000, 0.0015, 1.5, 40);
  assert(clampedMax <= 40, `expected clamp to max 40, got ${clampedMax}`);
});

test("zoomFromWheel zooms in on negative deltaY and clamps to min", () => {
  const zoomedIn = zoomFromWheel(5, -100);
  assert(zoomedIn < 5, "negative wheel delta should decrease distance");
  const clampedMin = zoomFromWheel(1.6, -1_000_000, 0.0015, 1.5, 40);
  assert(clampedMin >= 1.5, `expected clamp to min 1.5, got ${clampedMin}`);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL - ${name}`);
    console.error(`       ${err.message}`);
  }
}

console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
if (failures > 0) {
  process.exit(1);
}
