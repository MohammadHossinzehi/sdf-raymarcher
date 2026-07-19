// shaders.js
//
// GLSL source for the ray marcher. All rendering happens in the fragment
// shader: the vertex shader just draws a full-screen triangle, and every
// pixel of the fragment shader independently sphere-traces a ray through
// a scene described entirely as a signed distance field (SDF).
//
// Why ray marching instead of ray-object intersection (as in a classic
// ray tracer)? SDFs let you compose primitives with smooth blends
// (polynomial smooth-min) that have no closed-form intersection formula,
// which is what gives the metaball-like blobby merging seen in this demo.

export const vertexShaderSource = `#version 300 es
// Full-screen triangle: three vertices that cover the viewport without
// needing a vertex buffer, using the standard "big triangle" trick.
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec3 uEye;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTime;
uniform float uBlendK;      // smooth-min blend radius between scene objects
uniform int uShadowsOn;     // 0/1 toggle for soft shadows
uniform int uAoOn;          // 0/1 toggle for ambient occlusion

out vec4 fragColor;

const int MAX_STEPS = 128;
const float MAX_DIST = 60.0;
const float SURF_EPS = 0.0008;

// ---- primitive SDFs -------------------------------------------------

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float sdPlane(vec3 p, float y) {
  return p.y - y;
}

// Polynomial smooth minimum (Quilez). Blends two distances with radius k,
// producing the organic metaball-style merges between scene objects.
float smoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ---- scene ------------------------------------------------------------
// Returns distance to the nearest surface and writes a material id into
// matOut (0 = floor, 1 = blob group, 2 = orbiting torus).
float sceneSDF(vec3 p, float k, out int matOut) {
  float floorD = sdPlane(p, -1.0);

  vec3 p1 = p - vec3(sin(uTime * 0.7) * 1.2, 0.0, cos(uTime * 0.5) * 0.6);
  float s1 = sdSphere(p1, 0.9);

  vec3 p2 = p - vec3(-1.1, sin(uTime * 0.9) * 0.5, 0.4);
  float s2 = sdSphere(p2, 0.7);

  vec3 p3 = p - vec3(0.3, -0.2 + sin(uTime * 1.3) * 0.3, -1.0);
  float b3 = sdBox(p3, vec3(0.5));

  float blob = smoothMin(s1, s2, k);
  blob = smoothMin(blob, b3, k);

  vec3 pt = p - vec3(0.0, 0.9, 0.0);
  float ca = cos(uTime * 0.6);
  float sa = sin(uTime * 0.6);
  vec3 ptr = vec3(pt.x * ca - pt.z * sa, pt.y, pt.x * sa + pt.z * ca);
  float torus = sdTorus(ptr, vec2(1.6, 0.12));

  float d = min(floorD, min(blob, torus));
  if (d == floorD) matOut = 0;
  else if (d == torus) matOut = 2;
  else matOut = 1;
  return d;
}

float sceneSDF(vec3 p, float k) {
  int m;
  return sceneSDF(p, k, m);
}

// ---- shading helpers ---------------------------------------------------

vec3 estimateNormal(vec3 p, float k) {
  float e = 0.0015;
  vec2 h = vec2(1.0, -1.0);
  return normalize(
    h.xyy * sceneSDF(p + h.xyy * e, k) +
    h.yyx * sceneSDF(p + h.yyx * e, k) +
    h.yxy * sceneSDF(p + h.yxy * e, k) +
    h.xxx * sceneSDF(p + h.xxx * e, k)
  );
}

// Soft shadows via the classic "min penumbra factor along the ray" trick:
// march toward the light and track the minimum ratio of distance to
// travelled length, which approximates penumbra width from a near-miss.
float softShadow(vec3 ro, vec3 rd, float k, float mint, float maxt, float sharpness) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 64; i++) {
    if (t >= maxt) break;
    float h = sceneSDF(ro + rd * t, k);
    if (h < 0.0005) return 0.0;
    res = min(res, sharpness * h / t);
    t += clamp(h, 0.01, 0.5);
  }
  return clamp(res, 0.0, 1.0);
}

// Cheap ambient occlusion: sample the SDF a few steps along the normal and
// penalize occlusion where nearby geometry crowds the surface.
float ambientOcclusion(vec3 p, vec3 n, float k) {
  float occ = 0.0;
  float scale = 1.0;
  for (int i = 0; i < 5; i++) {
    float dist = 0.02 + 0.12 * float(i);
    float h = sceneSDF(p + n * dist, k);
    occ += (dist - h) * scale;
    scale *= 0.6;
  }
  return clamp(1.0 - occ, 0.0, 1.0);
}

vec3 materialColor(int mat) {
  if (mat == 0) {
    return vec3(0.32, 0.34, 0.38);
  } else if (mat == 2) {
    return vec3(0.85, 0.55, 0.15);
  }
  return vec3(0.2, 0.55, 0.85);
}

// ---- main ray march loop -----------------------------------------------

bool rayMarch(vec3 ro, vec3 rd, float k, out float outT, out int outMat) {
  float t = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    int mat;
    float d = sceneSDF(p, k, mat);
    if (d < SURF_EPS) {
      outT = t;
      outMat = mat;
      return true;
    }
    t += d;
    if (t > MAX_DIST) break;
  }
  return false;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  // Build the primary ray from the orbit camera basis.
  float fovScale = 1.0;
  vec3 rd = normalize(uForward + uv.x * fovScale * uRight + uv.y * fovScale * uUp);
  vec3 ro = uEye;

  vec3 lightDir = normalize(vec3(0.5, 0.85, 0.3));
  vec3 skyTop = vec3(0.55, 0.7, 0.95);
  vec3 skyBottom = vec3(0.9, 0.92, 0.95);
  vec3 skyColor = mix(skyBottom, skyTop, clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));

  float t;
  int mat;
  vec3 color;

  if (rayMarch(ro, rd, uBlendK, t, mat)) {
    vec3 p = ro + rd * t;
    vec3 n = estimateNormal(p, uBlendK);
    vec3 base = materialColor(mat);

    float diff = max(dot(n, lightDir), 0.0);
    float shadow = 1.0;
    if (uShadowsOn == 1) {
      shadow = softShadow(p + n * 0.002, lightDir, uBlendK, 0.02, 12.0, 16.0);
    }

    vec3 viewDir = normalize(ro - p);
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), 32.0) * 0.35;

    float ao = 1.0;
    if (uAoOn == 1) {
      ao = ambientOcclusion(p, n, uBlendK);
    }

    float ambient = 0.18 * ao;
    vec3 lit = base * (ambient + diff * shadow) + vec3(spec * shadow);

    float fog = 1.0 - exp(-0.0035 * t * t);
    color = mix(lit, skyColor, clamp(fog, 0.0, 1.0));
  } else {
    color = skyColor;
  }

  // Simple gamma correction for a less washed-out look.
  color = pow(color, vec3(1.0 / 2.2));
  fragColor = vec4(color, 1.0);
}
`;
