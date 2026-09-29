// Opening: one cube carries the whole show, drawn by a small WebGL2 renderer
// with a post pass on top. The words are built into the scene, not laid on it.
//   1. Shaders – the cube floats down and SHADER pushes out of its face in
//      relief; lines sweep down the screen, each swapping the post effect:
//      jitter, pixel art, text art, stylized print, then back to clean.
//   2. Level design – the camera pulls back: the cube stands in a whitebox
//      level whose buildings are the letters of LEVEL DESIGN.
//   3. Combat design – the camera orbits, the letters sink away, and a paper
//      strip carrying the words slices the cube: hit-stop, impact frame,
//      sparks and debris.
//   4. Games – from straight above, the cube's top reads the line about game
//      experience, and the seven favourite genres from the 小黑盒 profile are
//      dealt out around it as capsules in a Steam-style library grid.
// app.js then sweeps the opening away downward.

const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const mix = (a, b, t) => a + (b - a) * t;
const phase = (t, start, length) => clamp((t - start) / length);
const easeOut = (value) => 1 - Math.pow(1 - value, 3);
const easeIn = (value) => value * value * value;
const easeInOut = (value) => (value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2);
const easeOutQuint = (value) => 1 - Math.pow(1 - value, 5);
// A gentle overshoot for things settling into place.
const easeOutBack = (value) => 1 + 1.9 * Math.pow(value - 1, 3) + 0.9 * Math.pow(value - 1, 2);

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => scale3(a, 1 / Math.hypot(a[0], a[1], a[2]));
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/* ---------- Timeline (seconds of scene time) ---------- */

const FREEZE = 0.14; // hit-stop, in real seconds: scene time stands still
const T = {
  land: 0.75,
  printStart: 0.3,
  printLength: 0.4,
  embossStart: 0.3,
  passes: [0.8, 1.15, 1.5, 1.85, 2.2],
  passLength: 0.32,
  riseStart: 2.45,
  riseLength: 0.5,
  sinkStart: 3.85,
  sinkLength: 0.45,
  strike: 4.62,
  contact: 4.72,
  splitLength: 0.28,
  stripRest: 0.35,
  rejoinStart: 5.35,
  rejoinLength: 0.35,
  stripOutStart: 5.3,
  stripOutLength: 0.3,
  shrinkStart: 5.55,
  shrinkLength: 0.7,
  topText: 6.05,
  tilesStart: 6.2,
  dealLength: 0.55,
  end: 7.5,
};
// Post effect each sweep switches to: jitter, pixel art, text art, stylized, clean.
const PASS_FX = [1, 2, 3, 4, 0];
const PASS_TAGS = ["pass.jitter()", "pass.pixelate(10)", "pass.ascii()", "pass.stylize()", "pass.reset()"];
const sceneTime = (t) => (t < T.contact ? t : t < T.contact + FREEZE ? T.contact : t - FREEZE);

/* ---------- Words (they follow the page language) ---------- */

const WORDS = {
  en: {
    shader: "SHADER",
    shaderNote: "fragment.glsl",
    level: ["LEVEL", "DESIGN"],
    combat: "COMBAT DESIGN",
    combatNote: "",
    games: ["RICH GAME", "EXPERIENCE"],
    // Genre preference, ranked, from the 小黑盒 (Xiaoheihe) profile.
    preferences: ["Action", "RPG", "Multiplayer", "Co-op", "Adventure", "Strategy", "Open World"],
    topLabel: "TOP GENRE",
    topShare: "12%",
  },
  zh: {
    shader: "着色器",
    shaderNote: "SHADER · fragment.glsl",
    level: ["关卡设计"],
    combat: "战斗设计",
    combatNote: "COMBAT DESIGN",
    games: ["游戏经历", "丰富"],
    preferences: ["动作", "角色扮演", "多人", "合作", "冒险", "策略", "开放世界"],
    topLabel: "偏好第一",
    topShare: "12%",
  },
};
const SHADER_CODE = [
  "vec3 n = normalize(p);",
  "float d = dot(n, l);",
  "d = floor(d * 4.) / 4.;",
  "col = mix(ink, spot, d);",
  "return col;",
];

/* ---------- Scene layout (world units, y up, cube edge 2) ---------- */

const FOV = (32 * Math.PI) / 180;
const LIGHT = norm3([-0.5, 0.85, 0.4]);
const HERO = 2;
const HERO_GAMES = 1.7;
const TILE = [1.3, 0.3, 1.95];
const PITCH = [1.55, 2.2];
const STRIP = { length: 36, width: 0.62, angle: 0.42 };
// The library around the cube, as seen from straight above (screen left is
// +x, screen up is +z): seven genre capsules in rank order, the top genre on
// a double-wide capsule.
const LIBRARY = [
  { x: PITCH[0] / 2, z: PITCH[1], wide: true },
  { x: -PITCH[0], z: PITCH[1] },
  { x: PITCH[0], z: 0 },
  { x: -PITCH[0], z: 0 },
  { x: PITCH[0], z: -PITCH[1] },
  { x: 0, z: -PITCH[1] },
  { x: -PITCH[0], z: -PITCH[1] },
];
const LIBRARY_SIZE = [PITCH[0] * 3, PITCH[1] * 3];
const WIDE_TILE = TILE[0] + PITCH[0];
// Genre inks follow the preference chart: action teal, RPG red, multiplayer
// blue, co-op orange, adventure violet, strategy yellow, open world magenta.
const GENRE_INKS = ["teal", "spot", "blue", "orange", "violet", "gold", "magenta"];
// The letter buildings stand behind the cube, their front edge at this z.
const LEVEL_FRONT = -2.2;
// Level props in front: [x, z, width, depth, height, base, ink].
const PROPS = [
  [7.2, 1.4, 2.4, 2.4, 0.5, 0, "stock"],
  [7.2, 1.4, 0.6, 0.6, 1.8, 0.5, "blue"],
  [3.4, 0.4, 2.2, 0.5, 0.8, 0, "stock"],
  [-7, 1, 0.9, 0.9, 0.9, 0, "gold"],
  [-6.1, 1.9, 0.7, 0.7, 0.7, 0, "gold"],
];
// Letter ids in the height table: level letters first, relief letters after.
const RELIEF_IDS = 16;
const CJK = /[\u3400-\u9fff]/;
const HEIGHT_SLOTS = 24;

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let k = value;
    k = Math.imul(k ^ (k >>> 15), k | 1);
    k ^= k + Math.imul(k ^ (k >>> 7), k | 61);
    return ((k ^ (k >>> 14)) >>> 0) / 4294967296;
  };
}

// A monotone cubic through (times, values), Steffen's method: smooth, never
// overshooting a key, and at rest at both ends.
function monotone(times, values) {
  const last = times.length - 1;
  const h = [];
  const d = [];
  for (let i = 0; i < last; i += 1) {
    h.push(times[i + 1] - times[i]);
    d.push((values[i + 1] - values[i]) / h[i]);
  }
  const m = values.map((value, i) => {
    if (i === 0 || i === last) return 0;
    const p = (d[i - 1] * h[i] + d[i] * h[i - 1]) / (h[i - 1] + h[i]);
    return (Math.sign(d[i - 1]) + Math.sign(d[i])) * Math.min(Math.abs(d[i - 1]), Math.abs(d[i]), 0.5 * Math.abs(p));
  });
  return (t) => {
    if (t <= times[0]) return values[0];
    if (t >= times[last]) return values[last];
    let i = 0;
    while (t > times[i + 1]) i += 1;
    const s = (t - times[i]) / h[i];
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * values[i] +
      (s3 - 2 * s2 + s) * h[i] * m[i] +
      (3 * s2 - 2 * s3) * values[i + 1] +
      (s3 - s2) * h[i] * m[i + 1]
    );
  };
}

/* ---------- Matrices (column-major) ---------- */

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(eye, target) {
  const z = norm3(sub3(eye, target));
  const x = norm3(cross3([0, 1, 0], z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

// A model matrix from three (already scaled) axes and a position.
const basis = (x, y, z, position) => new Float32Array([...x, 0, ...y, 0, ...z, 0, ...position, 1]);
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function axisAngle(axis, angle) {
  const [x, y, z] = norm3(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    [c + x * x * t, y * x * t + z * s, z * x * t - y * s],
    [x * y * t - z * s, c + y * y * t, z * y * t + x * s],
    [x * z * t + y * s, y * z * t - x * s, c + z * z * t],
  ];
}

const boxModel = (center, size, rotation = IDENTITY) =>
  basis(scale3(rotation[0], size[0]), scale3(rotation[1], size[1]), scale3(rotation[2], size[2]), center);

// Projects geometry flat onto the floor along the light (printed shadows).
const SHADOW = new Float32Array([1, 0, 0, 0, -LIGHT[0] / LIGHT[1], 0, -LIGHT[2] / LIGHT[1], 0, 0, 0, 1, 0, 0, 0.015, 0, 1]);

/* ---------- Meshes ---------- */

// Vertex layout: position 3, normal 3, uv 2, face 1, outlined edges 4
// (u = 0, u = 1, v = 0, v = 1), letter 1 (-1 for anything that is not one).
const STRIDE = 14;
const ALL_EDGES = [1, 1, 1, 1];

// Face ids: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z; each with its texture axes.
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

function boxGeometry() {
  const data = [];
  const index = [];
  FACES.forEach(([normal, u, v], face) => {
    CORNERS.forEach(([a, b]) => {
      const position = [0, 1, 2].map((k) => normal[k] * 0.5 + u[k] * (a - 0.5) + v[k] * (b - 0.5));
      data.push(...position, ...normal, a, b, face, ...ALL_EDGES, -1);
    });
    const base = face * 4;
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { data: new Float32Array(data), index: new Uint16Array(index) };
}

// A unit quad on the floor, textured like a box's top face.
function planeGeometry() {
  const data = [];
  CORNERS.forEach(([a, b]) => data.push(a - 0.5, 0, 0.5 - b, 0, 1, 0, a, b, 2, ...ALL_EDGES, -1));
  return { data: new Float32Array(data), index: new Uint16Array([0, 1, 2, 0, 2, 3]) };
}

// Rasterizes lines of text into a grid of cells, each holding the index of
// the letter that covers it (or -1), cropped to the letters.
function letterGrid(lines, { size, cell }) {
  const cjk = CJK.test(lines.join(""));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const setFont = () => {
    if (cjk) context.font = `900 ${size}px "Noto Sans SC", ${DISPLAY}`;
    else setDisplayFont(context, 900, size);
  };
  setFont();
  const tracking = size * (cjk ? 0.06 : 0.1);
  const lineHeight = size * (cjk ? 1.06 : 0.92);
  const widths = lines.map((line) => [...line].reduce((sum, glyph) => sum + context.measureText(glyph).width + tracking, -tracking));
  canvas.width = Math.ceil(Math.max(...widths) + cell * 4);
  canvas.height = Math.ceil(lines.length * lineHeight + cell * 4);
  setFont();
  context.textBaseline = "middle";
  context.fillStyle = "#000";

  const cols = Math.ceil(canvas.width / cell);
  const rows = Math.ceil(canvas.height / cell);
  const grid = new Int16Array(cols * rows).fill(-1);
  let letters = 0;
  lines.forEach((line, lineIndex) => {
    let x = (canvas.width - widths[lineIndex]) / 2;
    const y = cell * 2 + lineHeight * (lineIndex + 0.5);
    for (const glyph of line) {
      const width = context.measureText(glyph).width;
      if (glyph.trim()) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillText(glyph, x, y);
        const c0 = Math.max(0, Math.floor(x / cell) - 1);
        const c1 = Math.min(cols, Math.ceil((x + width) / cell) + 1);
        const r0 = Math.max(0, Math.floor((y - lineHeight / 2) / cell) - 1);
        const r1 = Math.min(rows, Math.ceil((y + lineHeight / 2) / cell) + 1);
        const regionWidth = (c1 - c0) * cell;
        const pixels = context.getImageData(c0 * cell, r0 * cell, regionWidth, (r1 - r0) * cell).data;
        for (let r = r0; r < r1; r += 1) {
          for (let c = c0; c < c1; c += 1) {
            let coverage = 0;
            for (let py = 0; py < cell; py += 1) {
              for (let px = 0; px < cell; px += 1) {
                coverage += pixels[(((r - r0) * cell + py) * regionWidth + (c - c0) * cell + px) * 4 + 3];
              }
            }
            if (coverage / (cell * cell * 255) > 0.45 && grid[r * cols + c] < 0) grid[r * cols + c] = letters;
          }
        }
        letters += 1;
      }
      x += width + tracking;
    }
  });

  let top = rows;
  let bottom = -1;
  let left = cols;
  let right = -1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (grid[r * cols + c] < 0) continue;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
      left = Math.min(left, c);
      right = Math.max(right, c);
    }
  }
  const croppedCols = right - left + 1;
  const croppedRows = bottom - top + 1;
  const cropped = new Int16Array(croppedCols * croppedRows);
  for (let r = 0; r < croppedRows; r += 1) {
    for (let c = 0; c < croppedCols; c += 1) cropped[r * croppedCols + c] = grid[(r + top) * cols + c + left];
  }
  return { grid: cropped, cols: croppedCols, rows: croppedRows, letters };
}

// Extrudes a letter grid into one unit-tall mesh (x across, z down the page,
// y up). Only real edges are outlined: letter rims, wall tops and bottoms,
// and the wall seams where a wall turns a corner.
function letterGeometry({ grid, cols, rows }, idOffset) {
  const data = [];
  const index = [];
  const at = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols ? -1 : grid[r * cols + c]);
  const quad = (corners, normal, face, edges, letter) => {
    const base = data.length / STRIDE;
    corners.forEach((corner, k) => data.push(...corner, ...normal, ...CORNERS[k], face, ...edges, letter));
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const seam = (continues) => (continues ? 0 : 1);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const letter = at(r, c);
      if (letter < 0) continue;
      const own = (dr, dc) => at(r + dr, c + dc) === letter;
      const id = letter + idOffset;
      const [x0, x1, z0, z1] = [c, c + 1, r, r + 1];
      quad([[x0, 1, z1], [x1, 1, z1], [x1, 1, z0], [x0, 1, z0]], [0, 1, 0], 2,
        [own(0, -1) ? 0 : 1, own(0, 1) ? 0 : 1, own(1, 0) ? 0 : 1, own(-1, 0) ? 0 : 1], id);
      if (!own(0, 1)) {
        quad([[x1, 0, z1], [x1, 0, z0], [x1, 1, z0], [x1, 1, z1]], [1, 0, 0], 0,
          [seam(own(1, 0) && !own(1, 1)), seam(own(-1, 0) && !own(-1, 1)), 1, 1], id);
      }
      if (!own(0, -1)) {
        quad([[x0, 0, z0], [x0, 0, z1], [x0, 1, z1], [x0, 1, z0]], [-1, 0, 0], 1,
          [seam(own(-1, 0) && !own(-1, -1)), seam(own(1, 0) && !own(1, -1)), 1, 1], id);
      }
      if (!own(1, 0)) {
        quad([[x0, 0, z1], [x1, 0, z1], [x1, 1, z1], [x0, 1, z1]], [0, 0, 1], 4,
          [seam(own(0, -1) && !own(1, -1)), seam(own(0, 1) && !own(1, 1)), 1, 1], id);
      }
      if (!own(-1, 0)) {
        quad([[x1, 0, z0], [x0, 0, z0], [x0, 1, z0], [x1, 1, z0]], [0, 0, -1], 5,
          [seam(own(0, 1) && !own(-1, 1)), seam(own(0, -1) && !own(-1, -1)), 1, 1], id);
      }
    }
  }
  return { data: new Float32Array(data), index: new Uint32Array(index) };
}

/* ---------- Shaders ---------- */

const SCENE_VERTEX = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in float a_face;
layout(location = 4) in vec4 a_edges;
layout(location = 5) in float a_letter;
uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform float u_heights[${HEIGHT_SLOTS}];
out vec3 v_world;
out vec3 v_normal;
out vec2 v_uv;
flat out int v_face;
flat out vec4 v_edges;
void main() {
  vec3 position = a_position;
  // Letter meshes are one unit tall: each letter takes its own height, and
  // collapses to nothing (no shadow either) while it has none.
  if (a_letter > -0.5) {
    float height = u_heights[int(a_letter + 0.5)];
    position = height > 0.02 ? vec3(position.x, position.y * height, position.z) : vec3(0.0);
  }
  vec4 world = u_model * vec4(position, 1.0);
  v_world = world.xyz;
  v_normal = mat3(u_model) * a_normal;
  v_uv = a_uv;
  v_face = int(a_face + 0.5);
  v_edges = a_edges;
  gl_Position = u_viewProj * world;
}`;

const SCENE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_world;
in vec3 v_normal;
in vec2 v_uv;
flat in int v_face;
flat in vec4 v_edges;
out vec4 outColor;
uniform int u_mode;          // 0 shaded solid, 1 flat, 3 paper strip
uniform vec3 u_color;
uniform vec3 u_ink;
uniform vec3 u_cap;
uniform vec3 u_light;
uniform float u_outline;     // ink outline width in pixels
uniform float u_grid;        // whitebox prototype grid
uniform vec3 u_gridColor;
uniform sampler2D u_tex;
uniform vec4 u_faceRect[6];
uniform float u_faceReveal[6]; // printed up to this u; negative runs from the other side
uniform vec4 u_clip;
uniform float u_clipOn;
uniform vec2 u_repeat;

// How much of a print is down: a feathered wipe along u, run from the other
// side when the reveal is negative.
float printed(float u, float reveal) {
  float x = reveal < 0.0 ? 1.0 - u : u;
  float edge = abs(reveal) * 1.08;
  return 1.0 - smoothstep(edge - 0.08, edge, x);
}

float gridLines(vec2 p) {
  vec2 width = max(fwidth(p), vec2(1e-4));
  vec2 g = abs(fract(p - 0.5) - 0.5) / width;
  return 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
}

void main() {
  if (u_clipOn > 0.5 && dot(vec4(v_world, 1.0), u_clip) < 0.0) discard;
  if (u_mode == 1) {
    outColor = vec4(u_color, 1.0);
    return;
  }
  if (u_mode == 3) {
    outColor = vec4(texture(u_tex, vec2(v_uv.x * u_repeat.x + u_repeat.y, v_uv.y)).rgb, 1.0);
    return;
  }
  // Seen through a cut: the inside reads as a solid cut face.
  if (!gl_FrontFacing) {
    outColor = vec4(u_cap, 1.0);
    return;
  }

  vec3 n = normalize(v_normal);
  vec3 albedo = u_color;
  vec4 rect = u_faceRect[v_face];
  if (rect.z > 0.0) {
    vec4 art = texture(u_tex, rect.xy + v_uv * rect.zw);
    albedo = mix(albedo, art.rgb, art.a * printed(v_uv.x, u_faceReveal[v_face]));
  }
  // Three printed tones, with a halftone screen in the shade.
  float ndl = dot(n, u_light);
  float tone = ndl > 0.6 ? 1.0 : ndl > 0.15 ? 0.84 : 0.66;
  vec3 col = albedo * tone;
  if (tone < 0.7) {
    vec2 h = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 5.0;
    float dotMask = 1.0 - smoothstep(0.2, 0.27, length(fract(h) - 0.5));
    col = mix(col, u_ink, dotMask * 0.35);
  }
  if (u_grid > 0.0) {
    vec3 an = abs(n);
    vec2 p = an.x > 0.5 ? v_world.zy : an.y > 0.5 ? v_world.xz : v_world.xy;
    float fade = 1.0 - smoothstep(10.0, 26.0, length(v_world.xz));
    col = mix(col, u_gridColor, gridLines(p) * u_grid * fade);
  }
  float edgeDistance = 1.0;
  if (v_edges.x > 0.5) edgeDistance = min(edgeDistance, v_uv.x);
  if (v_edges.y > 0.5) edgeDistance = min(edgeDistance, 1.0 - v_uv.x);
  if (v_edges.z > 0.5) edgeDistance = min(edgeDistance, v_uv.y);
  if (v_edges.w > 0.5) edgeDistance = min(edgeDistance, 1.0 - v_uv.y);
  float width = max(fwidth(edgeDistance) * u_outline, 1e-5);
  float edge = (1.0 - smoothstep(width * 0.5, width * 1.2, edgeDistance)) * step(0.01, u_outline);
  if (u_clipOn > 0.5) {
    float side = dot(vec4(v_world, 1.0), u_clip);
    float seam = max(fwidth(side) * 2.5, 1e-5);
    edge = max(edge, 1.0 - smoothstep(seam * 0.5, seam, side));
  }
  outColor = vec4(mix(col, u_ink, edge), 1.0);
}`;

const POST_VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const POST_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_scene;
uniform sampler2D u_glyphs;
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_time;
uniform float u_line;        // sweep line, 0 top to 1 bottom; negative when idle
uniform int u_fxFrom;        // effect below the line (and when idle)
uniform int u_fxTo;          // effect above the line
uniform float u_flash;
uniform vec3 u_pal[6];       // paper, print ink, spot, spot shade, stock, theme ink
uniform vec3 u_dots;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 scene(vec2 uv) { return texture(u_scene, uv).rgb; }

vec3 nearestInk(vec3 c) {
  vec3 best = u_pal[0];
  float bestDistance = 1e9;
  for (int i = 0; i < 5; i++) {
    float d = distance(c, u_pal[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = u_pal[i];
    }
  }
  return best;
}

// Rows tear sideways and the three plates slip out of register.
vec3 jitter(vec2 uv) {
  float row = floor(gl_FragCoord.y / (5.0 * u_dpr));
  float tick = floor(u_time * 20.0);
  float n = hash(row * 12.9898 + tick * 78.233);
  vec2 q = uv + vec2(n > 0.78 ? (hash(row + tick) - 0.5) * 0.09 : 0.0, 0.0);
  float split = 3.0 * u_dpr / u_res.x;
  return vec3(scene(q + vec2(split, 0.0)).r, scene(q).g, scene(q - vec2(split, 0.0)).b);
}

// Pixel art: big pixels snapped to the print palette.
vec3 pixelate(vec2 uv) {
  float size = 10.0 * u_dpr;
  vec2 cell = floor(uv * u_res / size);
  vec3 c = nearestInk(scene((cell + 0.5) * size / u_res));
  vec2 f = fract(uv * u_res / size);
  float seam = max(step(f.x, 1.0 / size), step(f.y, 1.0 / size));
  return mix(c, c * 0.86, seam * 0.6);
}

// Text art: each cell becomes a glyph, denser where it stands out more.
vec3 textArt(vec2 uv) {
  vec2 size = vec2(8.0, 13.0) * u_dpr;
  vec2 cell = floor(uv * u_res / size);
  vec3 c = scene((cell + 0.5) * size / u_res);
  float cover = clamp(abs(luma(c) - luma(u_pal[0])) / 0.75, 0.0, 1.0);
  float glyph = floor(cover * 9.99);
  vec2 f = fract(uv * u_res / size);
  float a = texture(u_glyphs, vec2((glyph + f.x) / 10.0, f.y)).a;
  return mix(u_pal[0], cover > 0.08 ? c : u_pal[5], a);
}

// Stylized print: posterized inks, halftone shade and a heavy ink outline.
vec3 stylize(vec2 uv) {
  vec2 px = 1.5 * u_dpr / u_res;
  float tl = luma(scene(uv + px * vec2(-1.0, 1.0)));
  float tc = luma(scene(uv + px * vec2(0.0, 1.0)));
  float tr = luma(scene(uv + px * vec2(1.0, 1.0)));
  float ml = luma(scene(uv + px * vec2(-1.0, 0.0)));
  float mr = luma(scene(uv + px * vec2(1.0, 0.0)));
  float bl = luma(scene(uv + px * vec2(-1.0, -1.0)));
  float bc = luma(scene(uv + px * vec2(0.0, -1.0)));
  float br = luma(scene(uv + px * vec2(1.0, -1.0)));
  float gx = tr + 2.0 * mr + br - tl - 2.0 * ml - bl;
  float gy = tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
  float edge = smoothstep(0.1, 0.3, length(vec2(gx, gy)));
  vec3 p = nearestInk(scene(uv));
  vec2 h = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / (6.0 * u_dpr);
  float dotMask = 1.0 - smoothstep(0.26, 0.32, length(fract(h) - 0.5));
  float shade = 1.0 - step(0.02, distance(p, u_pal[3]));
  p = mix(p, mix(u_pal[1], u_pal[2], dotMask), shade);
  return mix(p, u_pal[1], edge);
}

vec3 effect(int fx, vec2 uv) {
  if (fx == 1) return jitter(uv);
  if (fx == 2) return pixelate(uv);
  if (fx == 3) return textArt(uv);
  if (fx == 4) return stylize(uv);
  return scene(uv);
}

void main() {
  vec2 uv = v_uv;
  float y = 1.0 - v_uv.y;
  float gap = 1e4;
  if (u_line > -0.5) {
    // Distance to the sweep line in CSS pixels (negative above it).
    gap = (y - u_line) * u_res.y / u_dpr;
    float band = exp(-gap * gap / 1600.0);
    float row = floor(gl_FragCoord.y / (4.0 * u_dpr));
    uv.x += (hash(row * 3.17 + floor(u_time * 30.0)) - 0.5) * 0.07 * band;
  }
  vec3 col = effect(u_line > -0.5 && y < u_line ? u_fxTo : u_fxFrom, uv);
  if (u_line > -0.5) {
    float lead = 1.0 - smoothstep(1.2, 2.4, abs(gap));
    float trail = max(1.0 - smoothstep(0.3, 1.0, abs(gap + 9.0)), 1.0 - smoothstep(0.3, 1.0, abs(gap + 20.0)));
    trail = max(trail, (1.0 - smoothstep(0.3, 1.0, abs(gap + 38.0))) * 0.6);
    col = mix(col, u_pal[5], trail * 0.85);
    col = mix(col, u_pal[2], lead);
  }
  vec2 grain = fract(gl_FragCoord.xy / (6.0 * u_dpr)) - 0.5;
  col = mix(col, u_dots, (1.0 - smoothstep(0.1, 0.17, length(grain))) * 0.14);
  col = mix(col, vec3(1.0) - col, u_flash);
  outColor = vec4(col, 1.0);
}`;

/* ---------- Printed textures (drawn with canvas 2D) ---------- */

const DISPLAY = '"Archivo", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const css = (color, alpha = 1) => `rgba(${color.map((value) => Math.round(value * 255)).join(",")},${alpha})`;
const luma = (color) => color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;

function setDisplayFont(context, weight, size) {
  context.font = `${weight} ${size}px ${DISPLAY}`;
  if ("fontStretch" in context) context.fontStretch = "condensed";
}

// The largest size (up to `size`) at which every line fits in `width`.
function fitDisplay(context, lines, width, size, weight = 900) {
  let fitted = size;
  setDisplayFont(context, weight, fitted);
  const widest = () => Math.max(...lines.map((line) => context.measureText(line).width));
  while (fitted > 10 && widest() > width) {
    fitted -= 2;
    setDisplayFont(context, weight, fitted);
  }
  return fitted;
}

function readPalette(element) {
  const style = getComputedStyle(element);
  const probe = document.createElement("canvas").getContext("2d");
  const read = (name, fallback) => {
    probe.fillStyle = fallback;
    probe.fillStyle = style.getPropertyValue(name).trim() || fallback;
    const value = probe.fillStyle;
    if (value.startsWith("#")) return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
    return value.match(/[\d.]+/g).slice(0, 3).map((part) => Number(part) / 255);
  };
  const palette = {
    paper: read("--bg", "#13110e"),
    ink: read("--ink", "#f1e7d0"),
    spot: read("--hot", "#ff5a3d"),
    blue: read("--blue", "#4a78f0"),
    gold: read("--gold", "#eaa91d"),
    teal: read("--teal", "#1bb3a1"),
    violet: read("--violet", "#8a5cf0"),
    green: read("--green", "#72b032"),
    stock: read("--paper", "#f3ead6"),
    printInk: read("--print-ink", "#16120e"),
  };
  const dark = luma(palette.paper) < 0.35;
  palette.shadow = mix3(palette.paper, dark ? [0, 0, 0] : palette.printInk, dark ? 0.5 : 0.2);
  palette.grid = mix3(palette.paper, palette.ink, 0.14);
  palette.orange = mix3(palette.spot, palette.gold, 0.5);
  palette.magenta = mix3(palette.spot, palette.violet, 0.55);
  palette.dots = [128 / 255, 110 / 255, 80 / 255];
  return palette;
}

// Hero cube faces: front (frame and file name around the relief), top (game
// experience) and right (shader code).
function heroCanvas(words, palette) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const stock = css(palette.stock);
  context.textAlign = "center";
  context.textBaseline = "middle";

  const frame = (x) => {
    context.strokeStyle = stock;
    context.lineWidth = 8;
    context.strokeRect(x + 34, 34, 444, 444);
  };

  frame(0);
  context.fillStyle = stock;
  context.font = `600 26px ${MONO}`;
  context.fillText(words.shaderNote, 256, 420);

  // The top face is read from straight above with +z up the screen.
  context.save();
  context.translate(1024, 512);
  context.rotate(Math.PI);
  frame(0);
  context.fillStyle = stock;
  const gamesSize = fitDisplay(context, words.games, 400, 130);
  words.games.forEach((line, index) => {
    context.fillText(line, 256, 256 + (index - (words.games.length - 1) / 2) * gamesSize * 0.98);
  });
  context.restore();

  frame(1024);
  context.textAlign = "left";
  context.font = `600 25px ${MONO}`;
  SHADER_CODE.forEach((line, index) => {
    context.fillStyle = css(palette.stock, 0.5);
    context.fillText(String(index + 1).padStart(2, "0"), 1024 + 62, 150 + index * 54);
    context.fillStyle = stock;
    context.fillText(line, 1024 + 112, 150 + index * 54);
  });
  return canvas;
}

const COVER = [256, 384];
const WIDE_COVER = Math.round((COVER[0] * WIDE_TILE) / TILE[0]);
const coverWidths = () => LIBRARY.map((tile) => (tile.wide ? WIDE_COVER : COVER[0]));

function genreInk(index, palette) {
  return palette[GENRE_INKS[index % GENRE_INKS.length]];
}

// All capsules side by side in one strip, each turned half a turn (like the
// cube's top) so it reads from above.
function coverAtlas(words, palette) {
  const widths = coverWidths();
  const canvas = document.createElement("canvas");
  canvas.width = widths.reduce((sum, width) => sum + width, 0);
  canvas.height = COVER[1];
  const context = canvas.getContext("2d");
  let x = 0;
  widths.forEach((width, index) => {
    context.save();
    context.translate(x + width, COVER[1]);
    context.rotate(Math.PI);
    drawCover(context, index, width, words, palette);
    context.restore();
    x += width;
  });
  return canvas;
}

function drawCover(context, index, w, words, palette) {
  const h = COVER[1];
  const background = genreInk(index, palette);
  const fore = css(luma(background) < 0.5 ? palette.stock : palette.printInk);
  const title = words.preferences[index];
  context.fillStyle = css(background);
  context.fillRect(0, 0, w, h);
  context.fillStyle = fore;
  context.strokeStyle = fore;
  context.lineCap = "round";
  const cx = w / 2;
  const cy = h * 0.42;

  switch (index) {
    case 0: {
      // Action, the top genre: its share, with slashes cutting past.
      context.lineWidth = 12;
      for (let slash = 0; slash < 4; slash += 1) {
        context.beginPath();
        context.moveTo(w * 0.6 + slash * 34, h * 0.66);
        context.lineTo(w * 0.78 + slash * 34, h * 0.14);
        context.stroke();
      }
      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      context.font = `700 22px ${MONO}`;
      context.fillText(words.topLabel, 30, h * 0.2);
      const size = fitDisplay(context, [words.topShare], w * 0.52, 170);
      context.fillText(words.topShare, 26, h * 0.2 + size * 0.86);
      break;
    }
    case 1:
      // Role-playing: a shield with a sword across it.
      context.beginPath();
      context.moveTo(cx - 62, cy - 70);
      context.lineTo(cx + 62, cy - 70);
      context.lineTo(cx + 62, cy + 6);
      context.quadraticCurveTo(cx + 58, cy + 62, cx, cy + 86);
      context.quadraticCurveTo(cx - 58, cy + 62, cx - 62, cy + 6);
      context.closePath();
      context.lineWidth = 10;
      context.stroke();
      context.fillRect(cx - 7, cy - 104, 14, 170);
      context.fillRect(cx - 38, cy + 34, 76, 12);
      break;
    case 2:
      // Multiplayer: a crowd of three.
      [-64, 0, 64].forEach((dx, person) => {
        const y = cy + (person === 1 ? -14 : 8);
        context.beginPath();
        context.arc(cx + dx, y - 34, 22, 0, TAU);
        context.fill();
        context.beginPath();
        context.arc(cx + dx, y + 38, 36, Math.PI, 0);
        context.fill();
      });
      break;
    case 3:
      // Co-op: two rings linked.
      context.lineWidth = 12;
      [-34, 34].forEach((dx) => {
        context.beginPath();
        context.arc(cx + dx, cy, 52, 0, TAU);
        context.stroke();
      });
      break;
    case 4:
      // Adventure: a peak, a path up to it and a flag on top.
      context.beginPath();
      context.moveTo(cx - 100, cy + 70);
      context.lineTo(cx + 6, cy - 66);
      context.lineTo(cx + 100, cy + 70);
      context.closePath();
      context.fill();
      context.fillStyle = css(background);
      context.setLineDash([8, 10]);
      context.strokeStyle = css(background);
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(cx - 40, cy + 66);
      context.quadraticCurveTo(cx + 40, cy + 20, cx - 4, cy - 44);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = fore;
      context.fillRect(cx + 4, cy - 116, 5, 52);
      context.beginPath();
      context.moveTo(cx + 9, cy - 116);
      context.lineTo(cx + 44, cy - 104);
      context.lineTo(cx + 9, cy - 92);
      context.closePath();
      context.fill();
      break;
    case 5:
      // Strategy: a board, half in play.
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          if ((row + column) % 2) context.fillRect(cx - 80 + column * 40, cy - 80 + row * 40, 40, 40);
        }
      }
      context.lineWidth = 4;
      context.strokeRect(cx - 80, cy - 80, 160, 160);
      break;
    default:
      // Open world: contour lines round a summit, and the horizon.
      context.lineWidth = 5;
      for (let ring = 1; ring <= 5; ring += 1) {
        context.beginPath();
        context.ellipse(cx + ring * 4, cy, 18 * ring, 12 * ring, -0.3, 0, TAU);
        context.stroke();
      }
      context.fillRect(18, cy + 94, w - 36, 5);
  }

  context.lineWidth = 3;
  context.strokeStyle = fore;
  context.strokeRect(9, 9, w - 18, h - 18);
  context.fillStyle = css(background);
  context.fillRect(9, h - 92, w - 18, 83);
  context.strokeRect(9, h - 92, w - 18, 83);
  context.fillStyle = fore;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const size = fitDisplay(context, [title.toUpperCase()], w - 104, index === 0 ? 58 : 44);
  context.fillText(title.toUpperCase(), 22, h - 50 + size * 0.35);
  setDisplayFont(context, 900, 34);
  context.textAlign = "right";
  context.fillText(`#${index + 1}`, w - 22, h - 38);
}

// One repeating segment of the paper strip.
function stripCanvas(words, palette) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = css(palette.stock);
  context.fillRect(0, 0, 1024, 128);
  context.fillStyle = css(palette.printInk);
  context.fillRect(0, 0, 1024, 12);
  context.fillRect(0, 116, 1024, 12);
  context.fillStyle = css(palette.spot);
  for (const start of [18, 876]) {
    for (let slash = 0; slash < 6; slash += 1) {
      const x = start + slash * 22;
      context.beginPath();
      context.moveTo(x + 16, 22);
      context.lineTo(x + 26, 22);
      context.lineTo(x + 10, 106);
      context.lineTo(x, 106);
      context.closePath();
      context.fill();
    }
  }
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillStyle = css(palette.printInk);
  const noteFont = `700 26px ${MONO}`;
  let noteWidth = 0;
  if (words.combatNote) {
    context.font = noteFont;
    noteWidth = context.measureText(words.combatNote).width + 28;
  }
  fitDisplay(context, [words.combat], words.combatNote ? 380 : 640, 84);
  const mainWidth = context.measureText(words.combat).width;
  const left = 512 - (mainWidth + noteWidth) / 2;
  context.fillText(words.combat, left, 66);
  if (words.combatNote) {
    context.font = noteFont;
    context.fillText(words.combatNote, left + mainWidth + 28, 68);
  }
  return canvas;
}

const GLYPHS = " .:-=+*#%@";

function glyphCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 48 * GLYPHS.length;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.font = `700 58px ${MONO}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  [...GLYPHS].forEach((glyph, index) => context.fillText(glyph, index * 48 + 24, 38));
  return canvas;
}

/* ---------- The opening ---------- */

export function startOpening({ canvas, overlay, language = "en", reduceMotion = false, onEnd } = {}) {
  const gl = canvas?.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;

  const program = (vertex, fragment) => {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(shader));
      return shader;
    };
    const linked = gl.createProgram();
    gl.attachShader(linked, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(linked, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(linked);
    if (gl.getProgramParameter(linked, gl.LINK_STATUS)) return linked;
    console.warn(gl.getProgramInfoLog(linked));
    return null;
  };
  const sceneProgram = program(SCENE_VERTEX, SCENE_FRAGMENT);
  const postProgram = program(POST_VERTEX, POST_FRAGMENT);
  if (!sceneProgram || !postProgram) return null;

  const locations = (linked, names) =>
    Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(linked, name)]));
  const su = locations(sceneProgram, [
    "u_viewProj", "u_model", "u_heights", "u_mode", "u_color", "u_ink", "u_cap", "u_light", "u_outline", "u_grid",
    "u_gridColor", "u_tex", "u_faceRect", "u_faceReveal", "u_clip", "u_clipOn", "u_repeat",
  ]);
  const pu = locations(postProgram, [
    "u_scene", "u_glyphs", "u_res", "u_dpr", "u_time", "u_line", "u_fxFrom", "u_fxTo", "u_flash", "u_pal", "u_dots",
  ]);

  const mesh = ({ data, index }) => {
    const vao = gl.createVertexArray();
    const buffers = [gl.createBuffer(), gl.createBuffer()];
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[0]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers[1]);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 3], [2, 2, 6], [3, 1, 8], [4, 4, 9], [5, 1, 13]].forEach(([location, size, offset]) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
    });
    gl.bindVertexArray(null);
    return { vao, buffers, count: index.length, type: index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  };
  const dropMesh = (geometry) => {
    gl.deleteVertexArray(geometry.vao);
    geometry.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
  };
  const cube = mesh(boxGeometry());
  const plane = mesh(planeGeometry());
  const postVao = gl.createVertexArray();

  const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
  const texture = (source, { repeat = false } = {}) => {
    const handle = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (anisotropy) {
      const max = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    return handle;
  };

  const palette = readPalette(canvas);
  const words = WORDS[language] ?? WORDS.en;

  // Printed textures plus the letter meshes (both need the display fonts).
  let assets = null;
  const buildAssets = () => {
    if (assets) {
      Object.values(assets.textures).forEach((handle) => gl.deleteTexture(handle));
      dropMesh(assets.level.mesh);
      dropMesh(assets.relief.mesh);
    }
    // Chinese characters get a finer grid and lower buildings, so their
    // strokes stay legible from the camera.
    const cjk = CJK.test(words.level.join(""));
    const levelGrid = letterGrid(words.level, { size: 100, cell: cjk ? 6 : 8 });
    const reliefGrid = letterGrid([words.shader], { size: 100, cell: 7 });
    const levelCell = 16 / levelGrid.cols;
    const heightRng = createRng(7);
    assets = {
      textures: {
        hero: texture(heroCanvas(words, palette)),
        covers: texture(coverAtlas(words, palette)),
        strip: texture(stripCanvas(words, palette), { repeat: true }),
        glyphs: texture(glyphCanvas()),
      },
      level: {
        mesh: mesh(letterGeometry(levelGrid, 0)),
        letters: Math.min(levelGrid.letters, RELIEF_IDS),
        heights: Array.from({ length: levelGrid.letters }, () => (1.3 + heightRng() * 2.3) * (cjk ? 0.6 : 1)),
        cell: levelCell,
        width: levelGrid.cols * levelCell,
        depth: levelGrid.rows * levelCell,
      },
      relief: {
        mesh: mesh(letterGeometry(reliefGrid, RELIEF_IDS)),
        letters: Math.min(reliefGrid.letters, HEIGHT_SLOTS - RELIEF_IDS),
        cell: Math.min(0.74 / reliefGrid.cols, 0.36 / reliefGrid.rows),
        cols: reliefGrid.cols,
        rows: reliefGrid.rows,
      },
    };
    cameras.clear();
  };

  // Render target: a multisampled buffer, resolved into a texture for the post pass.
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  let target = null;
  const makeTarget = (width, height) => {
    if (target) {
      gl.deleteFramebuffer(target.ms);
      gl.deleteFramebuffer(target.resolve);
      gl.deleteRenderbuffer(target.color);
      gl.deleteRenderbuffer(target.depth);
      gl.deleteTexture(target.texture);
    }
    const ms = gl.createFramebuffer();
    const color = gl.createRenderbuffer();
    const depth = gl.createRenderbuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    const resolved = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, resolved);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const resolve = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, resolve);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resolved, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    target = { ms, resolve, color, depth, texture: resolved, width, height };
  };

  const overlayContext = overlay?.getContext("2d");
  let live = false;
  let ratio = 1;
  const resize = () => {
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (!target || target.width !== width || target.height !== height) {
      canvas.width = width;
      canvas.height = height;
      makeTarget(width, height);
    }
    if (overlayContext) {
      const overlayRatio = Math.min(window.devicePixelRatio || 1, 2);
      const overlayWidth = Math.round(overlay.clientWidth * overlayRatio);
      const overlayHeight = Math.round(overlay.clientHeight * overlayRatio);
      if (overlay.width !== overlayWidth || overlay.height !== overlayHeight) {
        overlay.width = overlayWidth;
        overlay.height = overlayHeight;
      }
      overlayContext.setTransform(overlayRatio, 0, 0, overlayRatio, 0, 0);
    }
  };

  // Fixed bits of the strike: debris chips, sparks and the impact frame.
  const rng = createRng(2026);
  const DEBRIS = Array.from({ length: 30 }, (unused, index) => ({
    along: rng() * 1.8 - 0.9,
    depth: rng() * 1.8 - 0.9,
    side: index % 2 ? 1 : -1,
    push: 1.5 + rng() * 3,
    slide: 0.5 + rng() * 3.5,
    up: 1.5 + rng() * 3.5,
    size: 0.07 + rng() * 0.16,
    axis: norm3([rng() - 0.5, rng() - 0.5, rng() - 0.5]),
    spin: 6 + rng() * 12,
    ink: rng() < 0.6 ? "spot" : "stock",
  }));
  const SPARKS = Array.from({ length: 22 }, () => ({
    angle: [0, Math.PI, Math.PI / 2, -Math.PI / 2][Math.floor(rng() * 4)] + (rng() - 0.5) * 1.1,
    speed: 500 + rng() * 800,
    life: 0.35 + rng() * 0.25,
    ink: ["spot", "gold", "ink"][Math.floor(rng() * 3)],
  }));
  const SPEED_LINES = Array.from({ length: 34 }, (unused, index) => ({
    angle: (index / 34) * TAU + (rng() - 0.5) * 0.12,
    width: 0.01 + rng() * 0.025,
    inner: 0.18 + rng() * 0.16,
  }));

  /* Camera */

  const span = 2 * Math.tan(FOV / 2);

  // Camera keys: [scene time, target, yaw, pitch, distance]. Each channel
  // follows a monotone cubic, so the camera never stops dead between beats
  // and never tips past straight down.
  const cameras = new Map();
  function camera(aspect) {
    const key = aspect.toFixed(3);
    if (cameras.has(key)) return cameras.get(key);
    const fit = (dist, want, most = 3) => dist * clamp(want / aspect, 1, most);
    const topClose = Math.max(HERO_GAMES / 0.4, HERO_GAMES / 0.55 / aspect) / span;
    const topFit = Math.max(LIBRARY_SIZE[1] + 1.4, (LIBRARY_SIZE[0] + 1.4) / aspect) / span;
    const onCube = [0, 1, 0];
    // Over the letter buildings, leaning toward the cube in front of them.
    // On tall screens this shot lets the sides crop rather than shrink.
    const onLevel = [0, 0.8, LEVEL_FRONT - assets.level.depth * 0.38];
    const levelDist = Math.max((assets.level.width + 5) / (span * 1.45), (assets.level.depth * 0.8 + 7) / span);
    const keys = [
      [0, [0, 1.3, 0], 0.1, 0.62, fit(12, 0.9)],
      [0.8, onCube, 0.45, 0.38, fit(8.4, 0.9)],
      [2.3, onCube, 0.6, 0.35, fit(8, 0.9)],
      [3.25, onLevel, 0.22, 0.86, fit(levelDist, 1.45, 2.3)],
      [3.9, onLevel, 0.28, 0.83, fit(levelDist * 0.95, 1.45, 2.3)],
      [4.65, onCube, -1.2, 0.26, fit(9, 0.9)],
      [5.6, onCube, -1.32, 0.3, fit(9.4, 0.9)],
      [6.3, [0, HERO_GAMES, 0], -Math.PI, 1.56, topClose],
      [7, [0, 0.3, 0], -Math.PI, 1.56, topFit],
      [T.end + 1, [0, 0.3, 0], -Math.PI, 1.56, topFit * 1.04],
    ];
    const times = keys.map(([time]) => time);
    const curves = [
      (k) => k[1][0], (k) => k[1][1], (k) => k[1][2], (k) => k[2], (k) => k[3], (k) => Math.log(k[4]),
    ].map((pick) => monotone(times, keys.map(pick)));
    const at = (st) => {
      const [x, y, z, yaw, pitch, logDist] = curves.map((curve) => curve(st));
      return { target: [x, y, z], yaw, pitch: Math.min(pitch, 1.565), dist: Math.exp(logDist) };
    };
    cameras.set(key, at);
    return at;
  }
  const shotAt = (st, aspect) => camera(aspect)(st);

  const eyeOf = (shot) =>
    add3(shot.target, [
      shot.dist * Math.cos(shot.pitch) * Math.sin(shot.yaw),
      shot.dist * Math.sin(shot.pitch),
      shot.dist * Math.cos(shot.pitch) * Math.cos(shot.yaw),
    ]);

  // The blade's frame, taken from the camera at the moment of contact: the
  // strip runs along `along` (rising to the right on screen) facing the
  // camera, and the cut plane holds `along` and the view, with `normal` as
  // its normal.
  function bladeFrame(aspect) {
    const shot = shotAt(T.contact, aspect);
    const forward = norm3(sub3(shot.target, eyeOf(shot)));
    const right = norm3(cross3(forward, [0, 1, 0]));
    const up = cross3(right, forward);
    const c = Math.cos(STRIP.angle);
    const s = Math.sin(STRIP.angle);
    return {
      forward,
      along: add3(scale3(right, c), scale3(up, s)),
      normal: add3(scale3(right, -s), scale3(up, c)),
    };
  }

  /* Drawing */

  const NO_RECTS = new Float32Array(24);
  const FULL = new Float32Array([1, 1, 1, 1, 1, 1]);
  const heights = new Float32Array(HEIGHT_SLOTS);

  function draw(geometry, model, style) {
    gl.uniformMatrix4fv(su.u_model, false, model);
    gl.uniform1i(su.u_mode, style.mode ?? 0);
    gl.uniform3fv(su.u_color, style.color);
    gl.uniform1f(su.u_outline, style.outline ?? 0);
    gl.uniform1f(su.u_grid, style.grid ?? 0);
    gl.uniform4fv(su.u_faceRect, style.rects ?? NO_RECTS);
    gl.uniform1fv(su.u_faceReveal, style.reveal ?? FULL);
    gl.uniform1f(su.u_clipOn, style.clip ? 1 : 0);
    if (style.clip) gl.uniform4fv(su.u_clip, style.clip);
    gl.uniform2fv(su.u_repeat, style.repeat ?? [1, 0]);
    if (style.texture) gl.bindTexture(gl.TEXTURE_2D, style.texture);
    gl.bindVertexArray(geometry.vao);
    gl.drawElements(gl.TRIANGLES, geometry.count, geometry.type, 0);
  }

  const faceRects = (entries) => {
    const rects = new Float32Array(24);
    Object.entries(entries).forEach(([face, rect]) => rects.set(rect, Number(face) * 4));
    return rects;
  };
  const HERO_RECTS = faceRects({ 4: [0, 0, 1 / 3, 1], 2: [1 / 3, 0, 1 / 3, 1], 0: [2 / 3, 0, 1 / 3, 1] });
  const COVER_RECTS = (() => {
    const widths = coverWidths();
    const total = widths.reduce((sum, width) => sum + width, 0);
    let x = 0;
    return widths.map((width) => {
      const rect = faceRects({ 2: [x / total, 0, width / total, 1] });
      x += width;
      return rect;
    });
  })();

  function passState(st) {
    const state = { from: 0, to: 0, line: -1, tag: -1, fade: 0 };
    T.passes.forEach((start, index) => {
      if (st < start) return;
      const k = (st - start) / T.passLength;
      if (k < 1) {
        state.to = PASS_FX[index];
        state.line = easeInOut(k) * 1.08 - 0.04;
        state.tag = index;
        state.fade = Math.min(1, k / 0.15, (1 - k) / 0.15);
      } else {
        state.from = PASS_FX[index];
      }
    });
    return state;
  }

  function render(t) {
    const st = sceneTime(t);
    resize();
    const { width, height } = target;
    const aspect = width / height;
    const blade = bladeFrame(aspect);
    const since = st - T.contact;
    const { textures, level, relief } = assets;

    // Camera, with a punch-in on contact and a shake once time runs again.
    const shot = shotAt(st, aspect);
    if (since >= 0) shot.dist *= 1 - 0.07 * Math.exp(-since * 9);
    let eye = eyeOf(shot);
    let look = shot.target;
    if (since > 0 && since < 0.32) {
      const amount = 0.12 * (1 - since / 0.32) ** 2;
      const forward = norm3(sub3(look, eye));
      const right = norm3(cross3(forward, [0, 1, 0]));
      const up = cross3(right, forward);
      const offset = add3(scale3(right, Math.sin(since * 97) * amount), scale3(up, Math.cos(since * 83) * amount));
      eye = add3(eye, offset);
      look = add3(look, offset);
    }
    const viewProj = multiply(perspective(FOV, aspect, 0.5, 300), lookAt(eye, look));

    // Letter heights: the level's buildings rise and sink one by one; the
    // relief letters push out of the cube's face.
    heights.fill(0);
    for (let index = 0; index < level.letters; index += 1) {
      const rise = phase(st, T.riseStart + index * 0.045, T.riseLength);
      const sink = phase(st, T.sinkStart + (level.letters - 1 - index) * 0.03, T.sinkLength);
      heights[index] = level.heights[index] * easeOutBack(rise) * (1 - easeInOut(sink));
    }
    for (let index = 0; index < relief.letters; index += 1) {
      heights[RELIEF_IDS + index] = easeOutBack(phase(st, T.embossStart + index * 0.05, 0.35));
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.ms);
    gl.viewport(0, 0, width, height);
    gl.clearColor(palette.paper[0], palette.paper[1], palette.paper[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(sceneProgram);
    gl.uniformMatrix4fv(su.u_viewProj, false, viewProj);
    gl.uniform1fv(su.u_heights, heights);
    gl.uniform3fv(su.u_ink, palette.printInk);
    gl.uniform3fv(su.u_cap, palette.stock);
    gl.uniform3fv(su.u_light, LIGHT);
    gl.uniform3fv(su.u_gridColor, palette.grid);
    gl.uniform1i(su.u_tex, 0);
    gl.activeTexture(gl.TEXTURE0);

    // Floor: paper, with the whitebox grid while the level stands.
    const grid = 0.9 * easeInOut(phase(st, T.riseStart - 0.1, 0.6)) * (1 - easeInOut(phase(st, T.sinkStart, 0.6)));
    draw(plane, boxModel([0, 0, 0], [80, 1, 80]), { color: palette.paper, grid });

    // Everything standing on the floor, with the part above ground for its shadow.
    const solids = [];
    const levelModel = basis(
      [level.cell, 0, 0],
      [0, 1, 0],
      [0, 0, level.cell],
      [-level.width / 2, 0, LEVEL_FRONT - level.depth],
    );
    if (heights.some((value, index) => index < RELIEF_IDS && value > 0.02)) {
      solids.push({
        geometry: level.mesh,
        model: levelModel,
        shadow: levelModel,
        style: { color: palette.stock, outline: 1.6, grid: grid * 0.8 },
      });
    }

    PROPS.forEach(([x, z, w, d, h, base, ink]) => {
      const distance = Math.hypot(x, z);
      const rise = phase(st, T.riseStart + 0.1 + distance * 0.03, T.riseLength);
      const sink = phase(st, T.sinkStart + distance * 0.02, T.sinkLength);
      if (rise <= 0 || sink >= 1) return;
      const drop = (base + h) * (1 - easeOutBack(rise) + easeInOut(sink));
      const bottom = Math.max(0, base - drop);
      const top = base + h - drop;
      solids.push({
        geometry: cube,
        model: boxModel([x, base + h / 2 - drop, z], [w, h, d]),
        shadow: top > bottom ? boxModel([x, (bottom + top) / 2, z], [w, top - bottom, d]) : null,
        style: { color: palette[ink], outline: 1.8, grid: ink === "stock" ? grid * 0.8 : 0 },
      });
    });

    // Genre capsules are dealt out from under the cube, each on a low hop.
    LIBRARY.forEach((tile, index) => {
      const deal = phase(st, T.tilesStart + index * 0.05, T.dealLength);
      if (deal <= 0) return;
      const k = easeOut(deal);
      const size = scale3([tile.wide ? WIDE_TILE : TILE[0], TILE[1], TILE[2]], mix(0.55, 1, k));
      const hop = Math.sin(Math.PI * k) * (0.35 + (index % 3) * 0.12);
      const model = boxModel(
        [tile.x * k, size[1] / 2 + hop, tile.z * k],
        size,
        axisAngle([0, 1, 0], (index % 2 ? 0.5 : -0.5) * (1 - k)),
      );
      solids.push({
        geometry: cube,
        model,
        shadow: model,
        style: { color: genreInk(index, palette), outline: 1.4, rects: COVER_RECTS[index], texture: textures.covers },
      });
    });

    // The hero cube floats down, turning, and settles onto the floor.
    const land = phase(st, 0, T.land);
    const edge = mix(HERO * mix(0.6, 1, easeOut(land)), HERO_GAMES, easeInOut(phase(st, T.shrinkStart, T.shrinkLength)));
    const heroSpin = axisAngle([0, 1, 0], -1.1 * (1 - easeOutQuint(land)));
    const heroCenter = [0, edge / 2 + 2.4 * (1 - easeOutQuint(land)), 0];
    const heroModel = boxModel(heroCenter, [edge, edge, edge], heroSpin);
    const printIn = easeInOut(phase(st, T.printStart, T.printLength));
    const heroStyle = {
      color: palette.spot,
      outline: 2.2,
      rects: HERO_RECTS,
      texture: textures.hero,
      // The top face is printed upside down, so its reveal runs the other way.
      reveal: new Float32Array([printIn, 1, -easeInOut(phase(st, T.topText, 0.4)), 1, printIn, 1]),
    };
    // SHADER in relief on the cube's front face (letter rows run down the face,
    // extrusion runs out of it).
    const reliefLocal = basis(
      [relief.cell, 0, 0],
      [0, 0, 0.07],
      [0, -relief.cell, 0],
      [(-relief.cols * relief.cell) / 2, (relief.rows * relief.cell) / 2 + 0.05, 0.5],
    );
    const reliefStyle = { color: palette.stock, outline: 1.3 };

    // Shadows first, flat on the floor.
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -1);
    const shadowStyle = { mode: 1, color: palette.shadow };
    solids.forEach((solid) => solid.shadow && draw(solid.geometry, multiply(SHADOW, solid.shadow), shadowStyle));
    // The cube's shadow darkens as it comes down to the floor.
    draw(cube, multiply(SHADOW, heroModel), { mode: 1, color: mix3(palette.paper, palette.shadow, easeOut(land)) });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.CULL_FACE);

    solids.forEach((solid) => draw(solid.geometry, solid.model, solid.style));

    // The strike: the cube splits along the blade's plane, then closes up.
    const sliced = since >= 0 && st < T.rejoinStart + T.rejoinLength;
    if (sliced) {
      const open = easeOut(phase(st, T.contact, T.splitLength)) * (1 - easeInOut(phase(st, T.rejoinStart, T.rejoinLength)));
      const halves = [
        add3(scale3(blade.normal, 0.5 * open), scale3(blade.along, 0.4 * open)),
        add3(scale3(blade.normal, -0.5 * open), scale3(blade.along, -0.16 * open)),
      ];
      gl.disable(gl.CULL_FACE);
      halves.forEach((offset, index) => {
        const normal = scale3(blade.normal, index === 0 ? 1 : -1);
        const center = add3(heroCenter, offset);
        const clip = [...normal, -dot3(normal, center)];
        const model = boxModel(center, [edge, edge, edge], heroSpin);
        draw(cube, model, { ...heroStyle, clip });
        draw(relief.mesh, multiply(model, reliefLocal), { ...reliefStyle, clip });
      });
      gl.enable(gl.CULL_FACE);
    } else {
      draw(cube, heroModel, heroStyle);
      draw(relief.mesh, multiply(heroModel, reliefLocal), reliefStyle);
    }

    // Debris: chips thrown out of the cut; they land and lie on the floor.
    if (since >= 0 && st < T.rejoinStart + 0.6) {
      const gravity = 15;
      DEBRIS.forEach((chip, index) => {
        const start = add3(heroCenter, add3(scale3(blade.along, chip.along), scale3(blade.forward, chip.depth)));
        const velocity = add3(
          add3(scale3(blade.normal, chip.side * chip.push), scale3(blade.along, chip.slide)),
          [0, chip.up, 0],
        );
        const landing = (velocity[1] + Math.sqrt(velocity[1] ** 2 + 2 * gravity * Math.max(0, start[1] - chip.size / 2))) / gravity;
        const time = Math.min(since, landing);
        const position = add3(add3(start, scale3(velocity, time)), [0, -0.5 * gravity * time * time, 0]);
        const size = chip.size * (1 - easeIn(phase(st, T.rejoinStart + 0.1 + (index % 7) * 0.03, 0.35)));
        if (size <= 0.002) return;
        draw(cube, boxModel(position, [size, size, size], axisAngle(chip.axis, chip.spin * time)), {
          color: palette[chip.ink],
          outline: 1.2,
        });
      });
    }

    // The paper strip, always on top: in fast, stops dead in the hit-stop,
    // settles across the screen, then flies off.
    if (st >= T.strike) {
      const half = STRIP.length / 2;
      let offset = since < 0
        ? -half - 14 * (1 - (st - T.strike) / (T.contact - T.strike))
        : -half + half * easeOut(phase(st, T.contact, T.stripRest));
      offset += (half + 18) * easeIn(phase(st, T.stripOutStart, T.stripOutLength));
      if (offset < half + 16) {
        const repeat = STRIP.length / (STRIP.width * 8);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        const model = basis(
          scale3(blade.along, STRIP.length),
          scale3(blade.forward, -1),
          scale3(blade.normal, -STRIP.width),
          add3([0, HERO / 2, 0], scale3(blade.along, offset)),
        );
        draw(plane, model, { mode: 3, color: palette.stock, texture: textures.strip, repeat: [repeat, 0.5 - ((0.5 * repeat) % 1)] });
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
      }
    }

    // Resolve, then the post pass.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.ms);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.resolve);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(postProgram);
    const pass = passState(st);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.glyphs);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.uniform1i(pu.u_scene, 0);
    gl.uniform1i(pu.u_glyphs, 1);
    gl.uniform2f(pu.u_res, width, height);
    gl.uniform1f(pu.u_dpr, ratio);
    gl.uniform1f(pu.u_time, t);
    gl.uniform1f(pu.u_line, pass.line);
    gl.uniform1i(pu.u_fxFrom, pass.from);
    gl.uniform1i(pu.u_fxTo, pass.to);
    gl.uniform1f(pu.u_flash, t >= T.contact && t < T.contact + 0.04 ? 1 : 0);
    gl.uniform3fv(pu.u_pal, [
      ...palette.paper, ...palette.printInk, ...palette.spot, ...scale3(palette.spot, 0.66), ...palette.stock, ...palette.ink,
    ]);
    gl.uniform3fv(pu.u_dots, palette.dots);
    gl.bindVertexArray(postVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    drawOverlay(t, st, pass, viewProj);
    if (!live) {
      live = true;
      canvas.classList.add("is-live");
    }
  }

  function project(viewProj, [x, y, z]) {
    const cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
    const cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
    const cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
    return [((cx / cw) * 0.5 + 0.5) * overlay.clientWidth, (0.5 - (cy / cw) * 0.5) * overlay.clientHeight];
  }

  function drawOverlay(t, st, pass, viewProj) {
    if (!overlayContext) return;
    const width = overlay.clientWidth;
    const height = overlay.clientHeight;
    overlayContext.clearRect(0, 0, width, height);

    // Each post pass is named on its sweep line.
    if (pass.tag >= 0) {
      const y = pass.line * height;
      overlayContext.globalAlpha = pass.fade;
      overlayContext.font = `700 12px ${MONO}`;
      overlayContext.textAlign = "right";
      overlayContext.fillStyle = css(palette.spot);
      overlayContext.fillText(PASS_TAGS[pass.tag], width - 28, y - 10);
      overlayContext.textAlign = "left";
      overlayContext.fillStyle = css(palette.ink);
      overlayContext.fillText(`0${pass.tag + 1} / 05`, 28, y - 10);
      overlayContext.globalAlpha = 1;
    }

    const [cx, cy] = project(viewProj, [0, HERO / 2, 0]);

    // Impact frame: speed lines rush in while time stands still, then pull
    // back out and fade as it runs again.
    const impact = t - T.contact;
    if (impact >= 0 && impact < FREEZE + 0.14) {
      const after = clamp((impact - FREEZE) / 0.14);
      const reach = Math.hypot(width, height);
      overlayContext.fillStyle = css(palette.ink, 0.9 * (1 - after));
      SPEED_LINES.forEach((line) => {
        const inner = line.inner * Math.min(width, height) * (1 + after * 1.2);
        overlayContext.beginPath();
        overlayContext.moveTo(cx + Math.cos(line.angle) * inner, cy + Math.sin(line.angle) * inner);
        overlayContext.lineTo(cx + Math.cos(line.angle - line.width) * reach, cy + Math.sin(line.angle - line.width) * reach);
        overlayContext.lineTo(cx + Math.cos(line.angle + line.width) * reach, cy + Math.sin(line.angle + line.width) * reach);
        overlayContext.closePath();
        overlayContext.fill();
      });
    }

    // Sparks fly once time runs again.
    const since = st - T.contact;
    if (t >= T.contact + FREEZE && since < 0.6) {
      overlayContext.lineCap = "round";
      SPARKS.forEach((spark) => {
        if (since > spark.life) return;
        const k = since / spark.life;
        const angle = spark.angle - STRIP.angle;
        const travel = spark.speed * since * (1 - k * 0.5);
        const length = 10 + spark.speed * 0.035 * (1 - k);
        const x = cx + Math.cos(angle) * travel;
        const y = cy + Math.sin(angle) * travel;
        overlayContext.strokeStyle = css(palette[spark.ink], 1 - k);
        overlayContext.lineWidth = 3 * (1 - k) + 0.8;
        overlayContext.beginPath();
        overlayContext.moveTo(x, y);
        overlayContext.lineTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
        overlayContext.stroke();
      });
    }
  }

  let frameId = 0;
  let start = null;
  let running = true;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };

  function openingFrame(now) {
    if (!running) return;
    if (start === null) start = now;
    const t = (now - start) / 1000;
    render(t);
    if (t >= T.end + FREEZE) finish();
    frameId = requestAnimationFrame(openingFrame);
  }

  // Wait (briefly) for the display fonts so the words are set right, and set
  // them again if the fonts arrive later.
  const loaded = Promise.all(
    [`900 condensed 100px "Archivo"`, `900 100px "Noto Sans SC"`].map(
      (font) => document.fonts?.load(font, JSON.stringify(words)) ?? Promise.resolve(),
    ),
  ).catch(() => {});
  let begun = false;
  loaded.then(() => {
    if (begun && running) buildAssets();
  });
  Promise.race([loaded, new Promise((done) => window.setTimeout(done, 800))]).then(() => {
    if (!running) return;
    begun = true;
    buildAssets();
    if (reduceMotion) {
      render(T.end + FREEZE);
      window.setTimeout(finish, 1600);
      return;
    }
    frameId = requestAnimationFrame(openingFrame);
  });

  return {
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
