// main.js
//
// WebGL2 plumbing: compiles the ray marching shader, wires up an orbit
// camera driven by mouse drag + wheel, exposes a couple of sliders/toggles
// for the blend radius, soft shadows, and ambient occlusion, and drives
// the animation loop.

import { vertexShaderSource, fragmentShaderSource } from "./shaders.js";
import { computeCameraBasis, orbitFromDrag, zoomFromWheel } from "./camera.js";

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function linkProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

function main() {
  const canvas = document.getElementById("glcanvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    document.getElementById("status").textContent =
      "WebGL2 is not available in this browser.";
    return;
  }

  const program = linkProgram(gl, vertexShaderSource, fragmentShaderSource);
  gl.useProgram(program);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    eye: gl.getUniformLocation(program, "uEye"),
    forward: gl.getUniformLocation(program, "uForward"),
    right: gl.getUniformLocation(program, "uRight"),
    up: gl.getUniformLocation(program, "uUp"),
    time: gl.getUniformLocation(program, "uTime"),
    blendK: gl.getUniformLocation(program, "uBlendK"),
    shadowsOn: gl.getUniformLocation(program, "uShadowsOn"),
    aoOn: gl.getUniformLocation(program, "uAoOn"),
  };

  // Orbit camera state.
  let yaw = 0.6;
  let pitch = 0.35;
  let distance = 6.0;
  const target = [0, 0, 0];

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener("pointerup", () => (dragging = false));
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const next = orbitFromDrag(yaw, pitch, dx, dy);
    yaw = next.yaw;
    pitch = next.pitch;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      distance = zoomFromWheel(distance, e.deltaY);
    },
    { passive: false }
  );

  const blendSlider = document.getElementById("blendK");
  const shadowToggle = document.getElementById("shadowsOn");
  const aoToggle = document.getElementById("aoOn");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const startTime = performance.now();

  function frame() {
    resize();
    const t = (performance.now() - startTime) / 1000;

    const basis = computeCameraBasis(yaw, pitch, distance, target);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform3f(uniforms.eye, basis.eye[0], basis.eye[1], basis.eye[2]);
    gl.uniform3f(uniforms.forward, basis.forward[0], basis.forward[1], basis.forward[2]);
    gl.uniform3f(uniforms.right, basis.right[0], basis.right[1], basis.right[2]);
    gl.uniform3f(uniforms.up, basis.up[0], basis.up[1], basis.up[2]);
    gl.uniform1f(uniforms.time, t);
    gl.uniform1f(uniforms.blendK, parseFloat(blendSlider.value));
    gl.uniform1i(uniforms.shadowsOn, shadowToggle.checked ? 1 : 0);
    gl.uniform1i(uniforms.aoOn, aoToggle.checked ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
