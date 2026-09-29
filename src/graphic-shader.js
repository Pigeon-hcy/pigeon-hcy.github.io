// Graphic-realism edition renderer. Real 3D forms (raymarched monuments,
// orbs, towers, gates, crystals) under a realistic key light, printed as
// graphic plates: posterized ink tones, halftone and hatching in the shadows,
// ink silhouettes and a flat poster sun. Scenes switch behind a full-screen
// ink band (page turns) or an iris (the reveal).

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const sceneSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_focus;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_energy;
uniform float u_calm;
uniform float u_dark;
uniform float u_dpr;
uniform float u_mode;
uniform vec3 u_inkA[5];
uniform vec3 u_inkB[5];
uniform vec4 u_sceneA;
uniform vec4 u_sceneB;
uniform vec4 u_wipe;
uniform vec2 u_wipeDir;

#define TAU 6.28318530718

float gLayout;
float gSeed;
float gTime;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float sdOcta(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

vec2 opU(vec2 a, vec2 b) {
  return a.x < b.x ? a : b;
}

// Floating crystal shards orbiting the subject.
vec2 shards(vec3 p, float count, float radius, float height) {
  vec2 res = vec2(1000.0, 1.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    if (fi >= count) break;
    float a = gSeed * TAU + fi * 1.2566 + gTime * 0.1;
    vec3 c = vec3(cos(a) * radius, height + sin(fi * 2.1 + gSeed * 5.0) * 0.8 + sin(gTime * 0.5 + fi) * 0.12, sin(a) * radius);
    vec3 q = p - c;
    q.xz = rot(gTime * 0.35 + fi) * q.xz;
    q.xy = rot(0.6 + fi) * q.xy;
    float s = 0.24 + 0.14 * hash11(fi + gSeed * 13.0);
    res = opU(res, vec2(sdOcta(q * vec3(1.0, 0.6, 1.0), s), mod(fi, 2.0) < 0.5 ? 1.0 : 2.0));
  }
  return res;
}

// Materials: 0 ground, 1 spot-ink object, 2 light object, 3 stone.
vec2 map(vec3 p) {
  vec2 res = vec2(p.y, 0.0);
  if (gLayout < 0.5) {
    float steps = min(min(
      sdBox(p - vec3(0.0, 0.15, 0.0), vec3(2.3, 0.15, 1.5)),
      sdBox(p - vec3(0.0, 0.45, 0.0), vec3(1.75, 0.15, 1.1))),
      sdBox(p - vec3(0.0, 0.75, 0.0), vec3(1.2, 0.15, 0.72)));
    res = opU(res, vec2(steps, 3.0));
    vec3 q = p - vec3(0.0, 2.4, 0.0);
    q.xz = rot(0.4 + gSeed * 0.8) * q.xz;
    q.xy = rot(0.06) * q.xy;
    res = opU(res, vec2(sdBox(q, vec3(0.85, 1.5, 0.08)), 1.0));
    vec3 h = p - vec3(0.0, 2.7, -1.3);
    res = opU(res, vec2(sdTorus(h.xzy, vec2(2.05, 0.08)), 2.0));
    res = opU(res, shards(p, 4.0, 2.7, 2.6));
  } else if (gLayout < 1.5) {
    res = opU(res, vec2(sdBox(p - vec3(0.0, 0.45, 0.0), vec3(0.75, 0.45, 0.75)), 3.0));
    res = opU(res, vec2(length(p - vec3(0.0, 2.15, 0.0)) - 1.2, 1.0));
    vec3 r = p - vec3(0.0, 2.15, 0.0);
    r.yz = rot(1.15 + gSeed * 0.4) * r.yz;
    r.xy = rot(0.35 + gTime * 0.05) * r.xy;
    res = opU(res, vec2(sdTorus(r, vec2(2.05, 0.07)), 2.0));
    res = opU(res, shards(p, 3.0, 3.0, 2.4));
  } else if (gLayout < 2.5) {
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float a = fi * 0.897 + gSeed * 6.0;
      float rad = 1.7 + 0.9 * hash11(fi * 3.7 + gSeed);
      vec3 c = vec3(cos(a) * rad, 0.0, sin(a) * rad * 0.8);
      float hgt = 0.5 + 1.7 * hash11(fi * 7.1 + gSeed * 3.0);
      float w = 0.28 + 0.2 * hash11(fi * 1.9 + 2.0);
      vec3 q = p - c - vec3(0.0, hgt, 0.0);
      q.xz = rot(a) * q.xz;
      res = opU(res, vec2(sdBox(q, vec3(w, hgt, w)), mod(fi, 3.0) < 1.0 ? 1.0 : 3.0));
    }
    vec3 m = p - vec3(0.0, 2.5, 0.0);
    m.xz = rot(0.5 + gSeed) * m.xz;
    res = opU(res, vec2(sdBox(m, vec3(0.5, 2.5, 0.5)), 2.0));
  } else if (gLayout < 3.5) {
    res = opU(res, vec2(sdBox(p - vec3(0.0, 0.2, 0.0), vec3(2.4, 0.2, 1.2)), 3.0));
    res = opU(res, vec2(sdBox(p - vec3(-1.45, 2.6, 0.0), vec3(0.32, 2.2, 0.55)), 1.0));
    res = opU(res, vec2(sdBox(p - vec3(1.45, 2.6, 0.0), vec3(0.32, 2.2, 0.55)), 1.0));
    res = opU(res, vec2(sdBox(p - vec3(0.0, 5.0, 0.0), vec3(1.95, 0.28, 0.62)), 3.0));
    res = opU(res, vec2(length(p - vec3(0.0, 2.5 + sin(gTime * 0.6) * 0.1, 0.0)) - 0.78, 2.0));
  } else {
    res = opU(res, vec2(sdBox(p - vec3(0.0, 0.3, 0.0), vec3(1.1, 0.3, 1.1)), 3.0));
    vec3 q = p - vec3(0.0, 2.35, 0.0);
    q.xz = rot(gTime * 0.08 + gSeed * 3.0) * q.xz;
    res = opU(res, vec2(sdOcta(q * vec3(1.0, 0.5, 1.0), 0.95), 1.0));
    res = opU(res, shards(p, 5.0, 1.9, 2.2));
  }
  return res;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * map(p + e.xyy).x +
    e.yyx * map(p + e.yyx).x +
    e.yxy * map(p + e.yxy).x +
    e.xxx * map(p + e.xxx).x
  );
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.03;
  for (int i = 0; i < 24; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.03, 0.5);
    if (res < 0.01 || t > 12.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float halftone(vec2 frag, float amount, float cell) {
  vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / cell;
  vec2 f = fract(p) - 0.5;
  float radius = sqrt(clamp(amount, 0.0, 1.0)) * 0.7;
  return 1.0 - smoothstep(radius - 0.08, radius + 0.08, length(f));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 fragTop = vec2(frag.x, u_resolution.y - frag.y);
  float cell = 6.0 * u_dpr;

  // Which plate does this pixel show? (diagonal band wipe or iris)
  bool useB = false;
  float irisEdge = 1000.0;
  if (u_wipe.y != 0.0) {
    if (u_wipe.z < 0.5) {
      float w = dot(fragTop, u_wipeDir);
      useB = u_wipe.y > 0.0 ? w < u_wipe.x : w > u_wipe.x;
    } else {
      float r = length(fragTop - vec2(u_focus.x, u_resolution.y - u_focus.y));
      useB = r < u_wipe.x;
      irisEdge = abs(r - u_wipe.x);
    }
  }

  vec3 ink = useB ? u_inkB[0] : u_inkA[0];
  vec3 shade = useB ? u_inkB[1] : u_inkA[1];
  vec3 spot = useB ? u_inkB[2] : u_inkA[2];
  vec3 light = useB ? u_inkB[3] : u_inkA[3];
  vec3 sky = useB ? u_inkB[4] : u_inkA[4];
  vec4 scene = useB ? u_sceneB : u_sceneA;
  gLayout = scene.x;
  gSeed = scene.y;
  gTime = u_time * (1.0 + u_energy * 2.0);

  // Low, heroic camera looking up at the subject placed on the focus point.
  vec2 center = u_mode > 0.5 ? 0.5 * u_resolution : u_focus;
  vec2 uv = (frag - center) / u_resolution.y;
  vec3 target = vec3(0.0, 2.1, 0.0);
  float yaw = scene.z + u_pointer.x * 0.14 + sin(u_time * 0.05) * 0.07;
  float dist = scene.w;
  vec3 ro = target + vec3(sin(yaw) * dist, -1.15 + u_pointer.y * 0.3, cos(yaw) * dist);
  vec3 fw = normalize(target + vec3(0.0, 0.4, 0.0) - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  float zoom = 1.75;
  vec3 rd = normalize(uv.x * rt + uv.y * up + zoom * fw);
  vec3 lightDir = normalize(vec3(-0.62 + u_pointer.x * 0.35, 0.62, 0.48));
  vec3 backDir = normalize(vec3(0.7, 0.35, -0.6));

  // March, remembering near misses for ink silhouettes.
  float t = 0.0;
  vec2 h = vec2(0.0);
  bool hit = false;
  float edge = 1000.0;
  float prev = 1000.0;
  float prevT = 0.0;
  bool closing = true;
  for (int i = 0; i < 90; i++) {
    h = map(ro + rd * t);
    if (h.x < 0.0008 * t) {
      hit = true;
      break;
    }
    if (h.x > prev && closing) {
      edge = min(edge, prev / prevT);
      closing = false;
    } else if (h.x < prev) {
      closing = true;
    }
    prev = h.x;
    prevT = t;
    t += h.x * 0.92;
    if (t > 45.0) break;
  }

  vec3 col;
  float lineW = 1.5 * u_dpr / (u_resolution.y * zoom);
  vec3 lineCol = mix(ink, light, u_dark * 0.7);

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    float mat = h.y;
    float sh = softShadow(p + n * 0.01, lightDir);
    float diff = max(dot(n, lightDir), 0.0) * sh;
    float tone = diff * 0.9 + 0.08 + u_energy * 0.2;
    float rim = max(dot(n, backDir), 0.0) * (1.0 - max(dot(n, -rd), 0.0));
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 36.0) * sh;

    if (mat < 0.5) {
      // Ground: paper, cast shadows hatched in ink, a halftone horizon.
      vec3 ground = mix(sky, mix(light, shade, u_dark * 0.4), 0.18);
      col = ground;
      float hatch = step(0.55, fract((fragTop.x + fragTop.y) / (5.0 * u_dpr)));
      float shadow = 1.0 - sh;
      col = mix(col, mix(ink, shade, u_dark * 0.8), step(0.5, shadow) * hatch * 0.85);
      float far = smoothstep(9.0, 30.0, t);
      col = mix(col, sky, far);
    } else {
      vec3 c0 = ink;
      vec3 c1 = shade;
      vec3 c2 = spot;
      vec3 c3 = light;
      if (mat > 1.5 && mat < 2.5) {
        c0 = shade;
        c1 = spot;
        c2 = light;
        c3 = light;
      } else if (mat > 2.5) {
        c1 = mix(shade, sky, 0.35);
        c2 = mix(sky, light, 0.4);
      }
      if (tone > 0.7) {
        col = c3;
      } else if (tone > 0.38) {
        col = c2;
      } else if (tone > 0.14) {
        col = mix(c1, c0, halftone(fragTop, (0.38 - tone) / 0.24 * 0.55, cell));
      } else {
        col = c0;
      }
      if (spec > 0.55 && mat < 2.5) col = light;
      if (rim > 0.42 && tone < 0.38) col = mat < 1.5 ? spot : light;
      // Contour where the surface turns away from the eye.
      float facing = dot(n, -rd);
      col = mix(col, lineCol, 1.0 - smoothstep(0.1, 0.16, facing));
      // Aerial perspective in stepped layers.
      float fog = floor(smoothstep(12.0, 34.0, t) * 3.0) / 3.0;
      col = mix(col, sky, fog * 0.75);
    }
  } else {
    // Sky: stepped horizon bands, halftone haze and a flat poster sun.
    float horizon = clamp(rd.y * 2.2 + 0.1, 0.0, 1.0);
    float band = floor((1.0 - horizon) * 4.0) / 4.0;
    col = mix(sky, mix(sky, spot, 0.28), band * 0.7);
    col = mix(col, mix(sky, shade, 0.4), halftone(fragTop, (1.0 - horizon) * 0.35, cell) * 0.55);
    vec3 sunDir = normalize(fw + up * 0.1 + rt * 0.06);
    float sunDot = dot(rd, sunDir);
    float sunR = 0.9905;
    float sunAa = 0.0012;
    float disc = smoothstep(sunR - sunAa, sunR + sunAa, sunDot);
    col = mix(col, spot, disc);
    col = mix(col, light, smoothstep(0.9962, 0.9968, sunDot));
    float ring = 1.0 - smoothstep(0.0, 0.0009, abs(sunDot - 0.9855));
    col = mix(col, lineCol, ring * 0.9);
  }

  // Ink silhouettes from near misses.
  col = mix(col, lineCol, 1.0 - smoothstep(lineW * 0.6, lineW * 1.3, edge));

  if (u_mode < 0.5) {
    // Keep the headline side quiet and calm the plate behind the binder.
    float copyZone = smoothstep(0.55, 0.05, v_uv.x) * (1.0 - u_calm);
    col = mix(col, sky, copyZone * 0.3);
    col = mix(col, sky, u_calm * 0.12);
    // Iris edge: an ink ring with a spot-colour echo.
    if (u_wipe.y != 0.0 && u_wipe.z > 0.5) {
      col = mix(col, ink, 1.0 - smoothstep(3.0 * u_dpr, 4.5 * u_dpr, irisEdge));
      col = mix(col, spot, (1.0 - smoothstep(0.0, 2.0 * u_dpr, abs(irisEdge - 9.0 * u_dpr))));
    }
  }

  // Paper tooth and a little registration grain.
  float tooth = hash21(floor(fragTop / u_dpr)) - 0.5;
  col += tooth * 0.035;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, sceneSource);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

function setupRenderer(gl) {
  const program = createProgram(gl);
  if (!program) return null;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const names = [
    "u_resolution",
    "u_focus",
    "u_pointer",
    "u_time",
    "u_energy",
    "u_calm",
    "u_dark",
    "u_dpr",
    "u_mode",
    "u_inkA",
    "u_inkB",
    "u_sceneA",
    "u_sceneB",
    "u_wipe",
    "u_wipeDir",
  ];
  const locations = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  const position = gl.getAttribLocation(program, "a_position");
  return {
    program,
    locations,
    draw(uniforms) {
      gl.useProgram(program);
      gl.enableVertexAttribArray(position);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(locations.u_resolution, uniforms.width, uniforms.height);
      gl.uniform2f(locations.u_focus, uniforms.focusX ?? 0, uniforms.focusY ?? 0);
      gl.uniform2f(locations.u_pointer, uniforms.pointerX ?? 0, uniforms.pointerY ?? 0);
      gl.uniform1f(locations.u_time, uniforms.time ?? 0);
      gl.uniform1f(locations.u_energy, uniforms.energy ?? 0);
      gl.uniform1f(locations.u_calm, uniforms.calm ?? 0);
      gl.uniform1f(locations.u_dark, uniforms.dark ?? 0);
      gl.uniform1f(locations.u_dpr, uniforms.dpr ?? 1);
      gl.uniform1f(locations.u_mode, uniforms.mode ?? 0);
      gl.uniform3fv(locations.u_inkA, uniforms.inkA);
      gl.uniform3fv(locations.u_inkB, uniforms.inkB ?? uniforms.inkA);
      gl.uniform4fv(locations.u_sceneA, uniforms.sceneA);
      gl.uniform4fv(locations.u_sceneB, uniforms.sceneB ?? uniforms.sceneA);
      gl.uniform4fv(locations.u_wipe, uniforms.wipe ?? [0, 0, 0, 0]);
      gl.uniform2fv(locations.u_wipeDir, uniforms.wipeDir ?? [1, 0]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}

// Five ink sets per theme: [ink, shade, spot, light, sky].
export const INK_SETS = {
  light: {
    vermilion: ["#16120e", "#7d2116", "#e5452d", "#f7efdd", "#ece2c8"],
    cobalt: ["#12131c", "#1d3480", "#3563e0", "#f4e7c0", "#e9e1cb"],
    teal: ["#10150f", "#0c544d", "#159d8d", "#f2ecd8", "#e6e0c8"],
    mustard: ["#17120a", "#7c4f06", "#e1a119", "#f8f0dc", "#ebe1c6"],
    magenta: ["#160f14", "#6e1447", "#d9357d", "#f7eadf", "#eee1d2"],
    mono: ["#141210", "#4a453d", "#8f877a", "#f5eee0", "#e9e2d2"],
  },
  dark: {
    vermilion: ["#050404", "#5e170f", "#e8492f", "#f3e5c9", "#17130f"],
    cobalt: ["#04050a", "#152660", "#3a6cf0", "#f0e2bb", "#12131b"],
    teal: ["#030605", "#0a3f3a", "#1bb3a1", "#eee8d2", "#101512"],
    mustard: ["#060503", "#5e3c05", "#eaa91d", "#f5ecd5", "#17130c"],
    magenta: ["#060305", "#521036", "#e33d86", "#f3e4d8", "#161015"],
    mono: ["#050505", "#35312b", "#8f877a", "#efe8d8", "#141312"],
  },
};

const SECTION_INKS = ["teal", "vermilion", "mustard", "magenta", "cobalt", "mono"];
const LAYOUT_DISTANCE = [9.6, 8.8, 10.6, 10.8, 8.4];

export function inkValues(colors) {
  const values = new Float32Array(15);
  colors.forEach((hex, index) => {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    values[index * 3] = ((value >> 16) & 255) / 255;
    values[index * 3 + 1] = ((value >> 8) & 255) / 255;
    values[index * 3 + 2] = (value & 255) / 255;
  });
  return values;
}

// A plate = one printed scene: layout, seed, camera yaw/distance and ink set.
export function binderPlate(section, page) {
  return {
    layout: (section * 2 + page + 2) % 5,
    seed: (0.13 + section * 0.31 + page * 0.17) % 1,
    yaw: -0.9 + ((section + page) % 4) * 0.55,
    dist: 10.4,
    inks: SECTION_INKS[(section + page) % SECTION_INKS.length],
  };
}

const PLATES = {
  sealed: { layout: 0, seed: 0.21, yaw: 0.5, dist: 9.4, inks: "vermilion" },
  revealed: { layout: 1, seed: 0.62, yaw: -0.55, dist: 9.2, inks: "cobalt" },
};

function sceneValues(plate) {
  return new Float32Array([plate.layout, plate.seed, plate.yaw, plate.dist]);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const emptyController = {
  setTheme() {},
  setMood() {},
  setFocus() {},
  setCalm() {},
  burst() {},
  wipeTo(plate, options = {}) {
    options.onCover?.();
    options.onDone?.();
  },
  dispose() {},
};

export function startFoilCanvas(canvas, { band = null } = {}) {
  if (!canvas) return emptyController;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  const renderer = gl && setupRenderer(gl);
  if (!renderer) return emptyController;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const focus = { x: window.innerWidth * 0.6, y: window.innerHeight / 2 };
  const focusTarget = { ...focus };
  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  let themeName = "light";
  let current = PLATES.sealed;
  let next = null;
  let wipe = null;
  let energy = 0;
  let calm = 0;
  let calmTarget = 0;
  let quality = 1;
  let slowFrames = 0;
  let frameId = 0;
  let last = performance.now();
  const start = last;

  const onPointerMove = (event) => {
    pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = 1 - (event.clientY / window.innerHeight) * 2;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const inksFor = (plate) => inkValues(INK_SETS[themeName][plate.inks]);

  // The band is wider than the screen's diagonal extent, so at the midpoint
  // its opaque core covers everything; that is when content and plates swap.
  function placeBand(progress, direction) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const angle = (16 * Math.PI) / 180;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([x, y]) => x * dir.x + y * dir.y);
    const extent = Math.max(...corners) - Math.min(...corners);
    const bandWidth = extent * 1.5;
    const min = Math.min(...corners) - bandWidth / 2;
    const max = Math.max(...corners) + bandWidth / 2;
    const center = direction > 0 ? min + (max - min) * progress : max - (max - min) * progress;
    if (band) {
      const cx = width / 2;
      const cy = height / 2;
      const offset = center - (cx * dir.x + cy * dir.y);
      const px = cx + offset * dir.x;
      const py = cy + offset * dir.y;
      const length = Math.hypot(width, height) * 1.4;
      band.style.width = `${bandWidth}px`;
      band.style.height = `${length}px`;
      band.style.transform = `translate(${px - bandWidth / 2}px, ${py - length / 2}px) rotate(${angle}rad)`;
    }
    return { dir, trailing: center };
  }

  function finishWipe() {
    if (!wipe) return;
    const done = wipe;
    current = done.plate;
    next = null;
    wipe = null;
    if (band) band.classList.remove("is-active");
    done.onCover?.();
    done.onDone?.();
  }

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25) * quality;
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    return pixelRatio;
  }

  const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

  function render(now) {
    frameId = requestAnimationFrame(render);
    const rawDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, rawDt);
    last = now;

    if (rawDt > 0.03 && rawDt < 0.2) slowFrames += 1;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 36 && quality > 0.5) {
      quality -= 0.12;
      slowFrames = 0;
    }

    energy *= Math.exp(-dt * 1.4);
    calm = approach(calm, calmTarget, 2.5, dt);
    focus.x = approach(focus.x, focusTarget.x, 2.6, dt);
    focus.y = approach(focus.y, focusTarget.y, 2.6, dt);
    pointer.x = approach(pointer.x, pointerTarget.x, 1.8, dt);
    pointer.y = approach(pointer.y, pointerTarget.y, 1.8, dt);

    let wipeUniform = [0, 0, 0, 0];
    let wipeDir = [1, 0];
    if (wipe) {
      const progress = Math.min(1, (now - wipe.start) / wipe.duration);
      const eased = easeInOut(progress);
      if (wipe.kind === "iris") {
        const radius = eased * Math.hypot(window.innerWidth, window.innerHeight) * 1.1;
        wipeUniform = [radius * canvas.width / window.innerWidth, 1, 1, 0];
      } else {
        const placed = placeBand(eased, wipe.direction);
        const scale = canvas.width / window.innerWidth;
        wipeUniform = [placed.trailing * scale, wipe.direction, 0, 0];
        wipeDir = [placed.dir.x, placed.dir.y];
        if (!wipe.covered && eased >= 0.5) {
          wipe.covered = true;
          const onCover = wipe.onCover;
          wipe.onCover = null;
          onCover?.();
        }
      }
      if (progress >= 1) finishWipe();
    }

    const pixelRatio = resize();
    renderer.draw({
      width: canvas.width,
      height: canvas.height,
      focusX: focus.x * pixelRatio,
      focusY: canvas.height - focus.y * pixelRatio,
      pointerX: reduceMotion ? 0 : pointer.x,
      pointerY: reduceMotion ? 0 : pointer.y,
      time: reduceMotion ? 20 : (now - start) / 1000,
      energy,
      calm,
      dark: themeName === "dark" ? 1 : 0,
      dpr: pixelRatio,
      mode: 0,
      inkA: inksFor(current),
      inkB: next ? inksFor(next) : null,
      sceneA: sceneValues(current),
      sceneB: next ? sceneValues(next) : null,
      wipe: wipeUniform,
      wipeDir,
    });
  }

  frameId = requestAnimationFrame(render);

  const controller = {
    setTheme(nextTheme) {
      themeName = nextTheme === "dark" ? "dark" : "light";
    },
    setMood(mood) {
      if (mood === "revealed" && current !== PLATES.revealed && next !== PLATES.revealed) {
        controller.wipeTo(PLATES.revealed, { kind: "iris" });
      } else if (mood === "sealed" && !wipe) {
        current = PLATES.sealed;
      }
    },
    setFocus(x, y, _size, immediate = false) {
      focusTarget.x = x;
      focusTarget.y = y;
      if (immediate) Object.assign(focus, focusTarget);
    },
    setCalm(value) {
      calmTarget = value;
    },
    burst(strength = 1) {
      energy = Math.min(1.2, energy + strength);
    },
    get isWiping() {
      return Boolean(wipe);
    },
    // Switch plates behind a full-screen ink band (or an iris for the reveal).
    // A null plate keeps the current scene: the band only covers the screen.
    wipeTo(nextPlate, { kind = "band", direction = 1, number = "", title = "", onCover, onDone, duration } = {}) {
      if (wipe) finishWipe();
      const plate = nextPlate ?? current;
      if (reduceMotion) {
        current = plate;
        onCover?.();
        onDone?.();
        return;
      }
      next = plate;
      wipe = {
        plate,
        kind,
        direction: direction < 0 ? -1 : 1,
        start: performance.now(),
        duration: duration ?? (kind === "iris" ? 1300 : 1050),
        covered: false,
        onCover,
        onDone,
      };
      if (kind === "band" && band) {
        band.style.setProperty("--wipe-spot", INK_SETS[themeName][plate.inks][2]);
        band.style.setProperty("--wipe-shade", INK_SETS[themeName][plate.inks][1]);
        band.querySelector(".wipe-number").textContent = number;
        band.querySelector(".wipe-title").textContent = title;
        band.dataset.direction = wipe.direction > 0 ? "next" : "prev";
        band.classList.add("is-active");
        placeBand(0, wipe.direction);
      } else if (kind === "iris") {
        wipe.onCover = null;
        onCover?.();
      }
    },
    dispose() {
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", onPointerMove);
    },
  };
  return controller;
}

// The booster wrapper's print: a live plate whose key light follows the tilt.
export function attachPaintShader(canvas, { layout = 1, seed = 0.4, palette } = {}) {
  if (!canvas) return null;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  const renderer = gl && setupRenderer(gl);
  if (!renderer) return null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inks = inkValues(palette);
  const scene = new Float32Array([layout, seed, 0.3, LAYOUT_DISTANCE[layout] ?? 9]);
  const tilt = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const start = performance.now();
  let frameId = 0;
  let disposed = false;

  function drawFrame(now) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    tilt.x += (target.x - tilt.x) * 0.12;
    tilt.y += (target.y - tilt.y) * 0.12;
    renderer.draw({
      width,
      height,
      pointerX: tilt.x,
      pointerY: tilt.y,
      time: reduceMotion ? 6 : (now - start) / 1000,
      dpr: pixelRatio,
      mode: 1,
      inkA: inks,
      sceneA: scene,
    });
  }

  function loop(now) {
    if (disposed) return;
    drawFrame(now);
    frameId = requestAnimationFrame(loop);
  }

  frameId = requestAnimationFrame(reduceMotion ? drawFrame : loop);
  return {
    setPointer(x, y) {
      target.x = (x - 0.5) * 3;
      target.y = (0.5 - y) * 3;
      if (reduceMotion) requestAnimationFrame(drawFrame);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

// One shared offscreen context prints still plates into 2D canvases.
let artRenderer = null;

export function paintArt(target, { layout = 0, seed = 0.5, palette, time = 4 } = {}) {
  if (artRenderer === null) {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    const renderer = gl && setupRenderer(gl);
    artRenderer = renderer ? { canvas, gl, renderer } : false;
  }
  const context = target?.getContext?.("2d");
  if (!artRenderer || !context || artRenderer.gl.isContextLost()) return false;
  const { canvas, gl, renderer } = artRenderer;
  canvas.width = target.width;
  canvas.height = target.height;
  gl.viewport(0, 0, canvas.width, canvas.height);
  renderer.draw({
    width: canvas.width,
    height: canvas.height,
    pointerX: (seed - 0.5) * 1.6,
    pointerY: 0.2,
    time,
    dpr: Math.max(1, canvas.height / 360),
    mode: 1,
    inkA: inkValues(palette),
    sceneA: new Float32Array([layout, seed, (seed - 0.5) * 2.4, LAYOUT_DISTANCE[layout] ?? 9.5]),
  });
  context.drawImage(canvas, 0, 0);
  return true;
}
