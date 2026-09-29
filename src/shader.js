// Card-surface shaders: Balatro-style foil editions for the project cards and
// a rarity edge glint. The scene renderer (backgrounds, pack, card plates) lives in graphic-shader.js.

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;


const cardFragmentSource = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_kind;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 hsl2rgb(vec3 hsl) {
  vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  return (rgb - 0.5) * c + hsl.z;
}

// Balatro "Foil": liquid metal waves, crests tinted by a drifting rainbow hue
vec3 foilEffect(vec2 p, vec2 m, float t) {
  float d = length(p - vec2(0.25, 0.2));
  float w1 = sin(9.0 * d - t * 1.9);
  float w2 = sin(6.5 * (p.x + p.y) + t * 1.1 + 2.2 * sin(t * 0.5 + 3.0 * p.y));
  float w3 = sin(10.0 * (p.x - p.y) - t * 0.7);
  float fac = 0.5 + 0.5 * sin(w1 + w2 + w3 + 2.0 * d);

  float hue = fract(0.22 * (p.x + p.y) + 0.18 * fac + t * 0.05);
  vec3 crest = hsl2rgb(vec3(hue, 0.85, 0.55));

  vec3 col = vec3(0.05, 0.10, 0.24) * fac * 0.7;
  col += crest * pow(fac, 4.0) * 0.9;
  col += vec3(0.85, 0.93, 1.00) * pow(fac, 11.0) * 0.5;
  return col;
}

// Balatro "Holographic": vivid rainbow bands washing diagonally + glitter
vec3 holoEffect(vec2 p, vec2 m, float t) {
  vec2 q = p - vec2(0.18, 0.12);
  float angle = atan(q.y, q.x);
  float band = sin(5.5 * (p.x + p.y) + 2.6 * sin(t * 0.7 + 3.2 * p.y) + t * 1.3);
  float hue = fract(
    0.38 * (p.x + p.y)
    + 0.16 * sin(t * 0.6 + 4.0 * p.x * p.y)
    + t * 0.06
    + 0.22 * abs(angle) / 3.1415927
  );
  float bright = 0.46 + 0.36 * band;
  vec3 col = hsl2rgb(vec3(hue, 0.95, 0.52)) * bright;
  vec2 cell = floor((p + 1.0) * 24.0);
  vec2 cellUv = fract((p + 1.0) * 24.0) - 0.5;
  float s = hash(cell);
  float tw = pow(0.5 + 0.5 * sin(t * 3.0 + s * 6.2831), 14.0);
  float spot = smoothstep(0.42, 0.08, length(cellUv));
  col += vec3(1.0) * step(0.96, s) * tw * spot;
  return col * 0.9;
}

// Balatro "Polychrome": the whole face tinted by one silky flowing rainbow
vec3 polyEffect(vec2 p, vec2 m, float t) {
  float flow = 0.30 * (p.x + p.y)
    + 0.12 * sin(t * 0.5 + 2.4 * p.x)
    + 0.12 * cos(t * 0.4 + 2.9 * p.y);
  float hue = fract(flow + t * 0.07);
  float lum = 0.50 + 0.14 * sin(3.5 * (p.x - p.y) + t * 1.0);
  vec3 col = hsl2rgb(vec3(hue, 0.92, lum));
  float sheen = pow(0.5 + 0.5 * sin(2.6 * (p.x + p.y) - t * 1.2), 3.0);
  col += vec3(1.0, 0.96, 1.0) * sheen * 0.24;
  return col;
}

// "Laser": diffraction-grating prism — sharp spectral sectors radiating from a
// moving center, etched with fine radial grating lines, like the back of a CD
vec3 laserEffect(vec2 p, vec2 m, float t) {
  vec2 q = p;
  float ang = atan(q.y, q.x);
  float r = length(q);

  float bands = fract(ang * 3.0 / 6.2831853 + r * 0.5 + t * 0.07);
  float hue = mix(floor(bands * 7.0) / 7.0, bands, 0.35);

  float grating = 0.55 + 0.45 * sin(ang * 140.0 + t * 1.1);
  float rings = 0.62 + 0.38 * sin(r * 60.0 - t * 1.8);
  float beam = pow(abs(sin(ang * 2.0 + t * 0.55)), 24.0);
  float core = smoothstep(0.5, 0.05, r);

  vec3 col = hsl2rgb(vec3(hue, 1.0, 0.55)) * grating * rings * 0.85;
  col += vec3(1.0) * beam * 0.8;
  col += vec3(0.9, 0.95, 1.0) * core * 0.35;
  return col;
}

void main() {
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (v_uv - 0.5) * aspect * 2.0;
  vec2 m = (u_mouse - 0.5) * aspect * 2.0;

  // card editions get a slight parallax from the tilt
  vec2 pc = p + m * 0.18;

  vec3 col;
  if (u_kind < 0.5) {
    col = foilEffect(pc, m, u_time);
  } else if (u_kind < 1.5) {
    col = holoEffect(pc, m, u_time);
  } else if (u_kind < 2.5) {
    col = polyEffect(pc, m, u_time);
  } else {
    col = laserEffect(pc, m, u_time);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

const edgeFragmentSource = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_tier;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 hsl2rgb(vec3 hsl) {
  vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  return (rgb - 0.5) * c + hsl.z;
}

float edgeDistance(vec2 uv) {
  vec2 d = min(uv, 1.0 - uv);
  return min(d.x, d.y);
}

float edgeBand(vec2 uv, float width) {
  float d = edgeDistance(uv);
  float outer = smoothstep(width, 0.0, d);
  float inner = smoothstep(width * 0.42, width, d);
  return outer * inner;
}

float outerGlow(vec2 uv, float width) {
  return smoothstep(width, 0.0, edgeDistance(uv));
}

float perimeterCoord(vec2 uv) {
  float left = uv.x;
  float right = 1.0 - uv.x;
  float bottom = uv.y;
  float top = 1.0 - uv.y;
  float d = min(min(left, right), min(bottom, top));
  if (d == bottom) return uv.x * 0.25;
  if (d == right) return 0.25 + uv.y * 0.25;
  if (d == top) return 0.50 + (1.0 - uv.x) * 0.25;
  return 0.75 + (1.0 - uv.y) * 0.25;
}

float sweepLine(float p, float center, float width) {
  float d = abs(fract(p - center + 0.5) - 0.5);
  return smoothstep(width, 0.0, d);
}

void main() {
  vec2 uv = v_uv;
  float p = perimeterCoord(uv);
  float edge = edgeBand(uv, 0.055);
  float glow = outerGlow(uv, 0.115);
  float t = u_time;
  vec2 mouse = u_mouse;

  vec3 color = vec3(1.0);
  float alpha = 0.0;

  if (u_tier < 0.5) {
    float pulse = 0.56 + 0.22 * sin(t * 1.6 + p * 6.2831);
    color = mix(vec3(0.55, 0.78, 1.0), vec3(1.0), edge);
    alpha = edge * 0.58 + glow * 0.18 * pulse;
  } else if (u_tier < 1.5) {
    float metal = 0.55 + 0.45 * sin(p * 26.0 + sin(p * 7.0) * 1.4);
    float sweep1 = sweepLine(p, t * 0.18, 0.026);
    float sweep2 = sweepLine(p, t * 0.18 + 0.18, 0.016);
    float sweep3 = sweepLine(p, t * 0.18 + 0.34, 0.012);
    float stripe = max(max(sweep1, sweep2 * 0.82), sweep3 * 0.62);
    color = mix(vec3(0.55, 0.62, 0.70), vec3(0.98, 1.0, 1.0), stripe + metal * 0.25);
    alpha = edge * (0.42 + metal * 0.28 + stripe * 0.78) + glow * stripe * 0.18;
  } else if (u_tier < 2.5) {
    float hot = sweepLine(p, t * 0.14 + mouse.x * 0.08, 0.036);
    float dust = step(0.972, hash(floor(vec2(p * 180.0, t * 9.0)))) * (0.65 + 0.35 * sin(t * 8.0 + p * 80.0));
    vec3 gold = vec3(1.0, 0.68, 0.15);
    vec3 whiteGold = vec3(1.0, 0.94, 0.66);
    color = mix(gold, whiteGold, hot + dust);
    alpha = edge * (0.62 + hot * 0.92 + dust * 0.55) + glow * (0.22 + hot * 0.28);
  } else {
    float hue = fract(p + t * 0.12 + mouse.x * 0.05);
    float chase = sweepLine(p, t * 0.20, 0.05);
    float chase2 = sweepLine(p, t * 0.20 + 0.44, 0.032);
    color = hsl2rgb(vec3(hue, 0.98, 0.58 + chase * 0.22));
    color += vec3(1.0) * (chase * 0.42 + chase2 * 0.24);
    alpha = edge * (0.82 + chase * 0.85 + chase2 * 0.45) + glow * 0.32;
  }

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
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


const editionKinds = { foil: 0, holo: 1, polychrome: 2, laser: 3 };
const rarityTiers = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

export function attachCardShader(canvas, edition) {
  const kind = editionKinds[edition];
  if (kind === undefined) return null;

  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, cardFragmentSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const mouseLocation = gl.getUniformLocation(program, "u_mouse");
  const timeLocation = gl.getUniformLocation(program, "u_time");
  const kindLocation = gl.getUniformLocation(program, "u_kind");

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mouse = { x: 0.5, y: 0.45 };
  const start = performance.now();
  let frameId = 0;
  let disposed = false;

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function drawFrame(now) {
    resize();
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform2f(mouseLocation, mouse.x, mouse.y);
    gl.uniform1f(timeLocation, (now - start) / 1000);
    gl.uniform1f(kindLocation, kind);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function renderLoop(now) {
    drawFrame(now);
    frameId = requestAnimationFrame(renderLoop);
  }

  if (reduceMotion) {
    frameId = requestAnimationFrame(drawFrame);
  } else {
    frameId = requestAnimationFrame(renderLoop);
  }

  return {
    setPointer(x, y) {
      mouse.x = x;
      mouse.y = 1 - y;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

export function attachRarityEdgeShader(canvas, tier) {
  const tierValue = rarityTiers[tier] ?? 0;
  const gl = canvas.getContext("webgl", { antialias: true, alpha: true });
  if (!gl) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, edgeFragmentSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const mouseLocation = gl.getUniformLocation(program, "u_mouse");
  const timeLocation = gl.getUniformLocation(program, "u_time");
  const tierLocation = gl.getUniformLocation(program, "u_tier");

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mouse = { x: 0.5, y: 0.45 };
  const start = performance.now();
  let frameId = 0;
  let disposed = false;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function drawFrame(now) {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform2f(mouseLocation, mouse.x, mouse.y);
    gl.uniform1f(timeLocation, (now - start) / 1000);
    gl.uniform1f(tierLocation, tierValue);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function renderLoop(now) {
    drawFrame(now);
    frameId = requestAnimationFrame(renderLoop);
  }

  if (reduceMotion) {
    frameId = requestAnimationFrame(drawFrame);
  } else {
    frameId = requestAnimationFrame(renderLoop);
  }

  return {
    setPointer(x, y) {
      mouse.x = x;
      mouse.y = 1 - y;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
