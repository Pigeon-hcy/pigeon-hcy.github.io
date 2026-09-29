// Art direction data and SVG line work. The printed plates themselves are
// raymarched in graphic-shader.js; this module holds their ink sets, the
// printer's marks drawn around them, and a flat SVG poster fallback for
// browsers without WebGL.

const TAU = Math.PI * 2;

export function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value) => Math.round(value * 10) / 10;
const point = ([x, y]) => `${round(x)},${round(y)}`;
const polar = (cx, cy, radius, angle) => [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];

function raysPath(cx, cy, count, radius, phase = 0, duty = 0.5) {
  const step = TAU / count;
  let path = "";
  for (let index = 0; index < count; index += 1) {
    const start = phase + index * step;
    path += `M${point([cx, cy])}L${point(polar(cx, cy, radius, start))}L${point(polar(cx, cy, radius, start + step * duty))}Z`;
  }
  return path;
}

// A long, pointed shard split along its spine into a lit and a shaded facet.
function shard(cx, cy, angle, length, width, colors, rng, strokeWidth = 3) {
  const tip = polar(cx, cy, length, angle);
  const back = polar(cx, cy, -length * (0.12 + rng() * 0.18), angle);
  const left = polar(back[0], back[1], width * (0.55 + rng() * 0.5), angle + Math.PI / 2);
  const right = polar(back[0], back[1], width * (0.45 + rng() * 0.5), angle - Math.PI / 2);
  const spine = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  return `
    <polygon points="${point(tip)} ${point(left)} ${point(right)}" fill="${colors.ink}" stroke="${colors.ink}" stroke-width="${strokeWidth * 2}" stroke-linejoin="miter" />
    <polygon points="${point(tip)} ${point(left)} ${point(spine)}" fill="${colors.lit}" />
    <polygon points="${point(tip)} ${point(spine)} ${point(right)}" fill="${colors.shade}" />
    ${colors.dots ? `<polygon points="${point(tip)} ${point(spine)} ${point(right)}" fill="url(#${colors.dots})" />` : ""}
  `;
}

function halftoneDefs(id, ink, light, width, height) {
  return `
    <pattern id="${id}-dots" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <circle cx="3.5" cy="3.5" r="1.75" fill="${ink}" />
    </pattern>
    <pattern id="${id}-fine" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <circle cx="2.5" cy="2.5" r="1" fill="${light}" />
    </pattern>
    <linearGradient id="${id}-fade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.42" stop-color="#fff" stop-opacity="0" />
      <stop offset="1" stop-color="#fff" stop-opacity="1" />
    </linearGradient>
    <mask id="${id}-shadow" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="url(#${id}-fade)" />
    </mask>
  `;
}

const ART_PALETTES = {
  mint: { deep: "#06231e", deep2: "#0b3a31", main: "#19e6b4", alt: "#2a7bff", pop: "#ff3d7f", light: "#fff2d6", sun: "#ffd23f", ink: "#05110f" },
  gold: { deep: "#2a1104", deep2: "#4a1c08", main: "#ffb81f", alt: "#ff5c1f", pop: "#19c9ff", light: "#fff4dc", sun: "#ffe066", ink: "#140801" },
  violet: { deep: "#150a33", deep2: "#26114f", main: "#9b5cff", alt: "#ff3d9a", pop: "#ffd23f", light: "#f6ecff", sun: "#ff8ac8", ink: "#08031a" },
  red: { deep: "#2a0613", deep2: "#4a0b24", main: "#ff2e55", alt: "#ff8a1f", pop: "#1fd6ff", light: "#ffeede", sun: "#ffc933", ink: "#140209" },
  blue: { deep: "#06123a", deep2: "#0c205e", main: "#2f7bff", alt: "#19d9ff", pop: "#ff5c1f", light: "#eef4ff", sun: "#ffd23f", ink: "#020824" },
  green: { deep: "#0b2410", deep2: "#133a1b", main: "#8fe33a", alt: "#19c9a0", pop: "#ff3d7f", light: "#f3ffe4", sun: "#ffe14d", ink: "#041006" },
  mono: { deep: "#121016", deep2: "#221f2b", main: "#e9e4f2", alt: "#8d86a3", pop: "#ff2e55", light: "#ffffff", sun: "#ff2e55", ink: "#050408" },
};

const LAYOUTS = ["burst", "blades", "split", "spiral", "monument"];

function sunDisk(cx, cy, radius, pal, id, bands = [pal.sun, pal.alt, pal.pop]) {
  return `
    <circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="${bands[0]}" stroke="${pal.ink}" stroke-width="5" />
    <circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius * 0.72)}" fill="${bands[1]}" />
    <circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius * 0.42)}" fill="${bands[2]}" />
    <circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="url(#${id}-dots)" mask="url(#${id}-shadow)" />
  `;
}

// Flat poster fallback for browsers without WebGL. `index` (the card's position
// in the collection) rotates the layout so neighbours never share a composition.
export function cardArtSvg(card, { uid = "", index } = {}) {
  const seed = hashString(card.id);
  const rng = createRng(seed);
  const pal = ART_PALETTES[card.accent] ?? ART_PALETTES.blue;
  const id = `art-${uid}${card.id}`.replace(/[^a-z0-9-]/gi, "");
  const width = 400;
  const height = 260;
  const layout = LAYOUTS[(Number.isInteger(index) ? index : seed) % LAYOUTS.length];
  const fx = width * (0.32 + rng() * 0.36);
  const fy = height * (0.36 + rng() * 0.3);
  const initial = [...String(card.title ?? "?").trim()][0]?.toUpperCase() ?? "?";
  const colors = [
    { lit: pal.main, shade: pal.deep2, ink: pal.ink, dots: `${id}-fine` },
    { lit: pal.pop, shade: pal.alt, ink: pal.ink },
    { lit: pal.light, shade: pal.main, ink: pal.ink },
    { lit: pal.sun, shade: pal.alt, ink: pal.ink, dots: `${id}-dots` },
  ];
  const body = [`<rect width="${width}" height="${height}" fill="${pal.deep}" />`];
  const shards = [];

  if (layout === "burst") {
    // Radial explosion out of a posterized sun.
    body.push(`<path d="${raysPath(fx, fy, 18 + Math.floor(rng() * 8), 720, rng() * TAU, 0.46)}" fill="${pal.deep2}" />`);
    body.push(sunDisk(fx, fy, 58 + rng() * 20, pal, id));
    const count = 5 + Math.floor(rng() * 2);
    const baseAngle = rng() * TAU;
    for (let step = 0; step < count; step += 1) {
      const angle = baseAngle + (step / count) * TAU + (rng() - 0.5) * 0.6;
      const [sx, sy] = polar(fx, fy, 50 + rng() * 30, angle);
      shards.push(shard(sx, sy, angle, 70 + rng() * 110, 14 + rng() * 20, colors[step % colors.length], rng));
    }
  } else if (layout === "blades") {
    // Concentric "Command" rings sliced by two long crossing blades.
    body.push(`<path d="${raysPath(fx, fy, 30, 720, rng() * TAU, 0.5)}" fill="${pal.deep2}" />`);
    [104, 82, 62, 44].forEach((radius, step) => {
      const color = [pal.light, pal.main, pal.sun, pal.alt][step];
      const strokeWidth = [3, 13, 4, 10][step];
      const dash = step % 2 ? `${round(14 + rng() * 40)} ${round(6 + rng() * 12)}` : `${round(2 + rng() * 3)} ${round(5 + rng() * 5)}`;
      body.push(`<circle cx="${round(fx)}" cy="${round(fy)}" r="${radius}" fill="none" stroke="${pal.ink}" stroke-width="${strokeWidth + 5}" />`);
      body.push(`<circle cx="${round(fx)}" cy="${round(fy)}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash}" />`);
    });
    body.push(`<circle cx="${round(fx)}" cy="${round(fy)}" r="24" fill="${pal.pop}" stroke="${pal.ink}" stroke-width="5" />`);
    const tilt = -0.5 - rng() * 0.3;
    shards.push(shard(fx - 230 * Math.cos(tilt), fy - 230 * Math.sin(tilt), tilt, 380, 26, colors[2], rng, 3.5));
    shards.push(shard(fx + 200 * Math.cos(tilt + 1.1), fy + 200 * Math.sin(tilt + 1.1), tilt + 1.1 + Math.PI, 300, 20, colors[1], rng, 3.5));
  } else if (layout === "split") {
    // A hard diagonal cut; the sun straddles it and shards stream along it.
    const a = height * (0.2 + rng() * 0.25);
    const b = height * (0.7 + rng() * 0.25);
    const slope = Math.atan2(b - a, width);
    body.push(`<path d="${raysPath(width * 0.1, a, 22, 720, 0, 0.42)}" fill="${pal.deep2}" />`);
    body.push(`<polygon points="0,${round(a)} ${width},${round(b)} ${width},${height} 0,${height}" fill="${pal.main}" />`);
    body.push(`<polygon points="0,${round(a)} ${width},${round(b)} ${width},${height} 0,${height}" fill="url(#${id}-dots)" opacity="0.5" />`);
    const sx = width * (0.55 + rng() * 0.2);
    body.push(sunDisk(sx, a + (b - a) * (sx / width), 64, pal, id, [pal.sun, pal.pop, pal.light]));
    body.push(`<line x1="0" y1="${round(a)}" x2="${width}" y2="${round(b)}" stroke="${pal.ink}" stroke-width="6" />`);
    for (let step = 0; step < 3; step += 1) {
      const t = 0.08 + step * 0.2 + rng() * 0.05;
      const x = width * t;
      const y = a + (b - a) * t + (step % 2 ? 26 : -26);
      shards.push(shard(x, y, slope + (rng() - 0.5) * 0.25, 90 + rng() * 60, 16 + rng() * 10, colors[(step + 1) % colors.length], rng));
    }
  } else if (layout === "spiral") {
    // Mishra-style spiral winding out of the sun, with shards riding it.
    body.push(`<path d="${raysPath(fx, fy, 20, 720, rng() * TAU, 0.5)}" fill="${pal.deep2}" />`);
    let path = "";
    let radius = 12;
    let angle = rng() * TAU;
    path += `M${point(polar(fx, fy, radius, angle))}`;
    for (let step = 0; step < 30; step += 1) {
      angle += 0.5;
      radius += 4 + step * 0.42;
      path += `L${point(polar(fx, fy, radius, angle))}`;
    }
    body.push(sunDisk(fx, fy, 46, pal, id, [pal.sun, pal.pop, pal.deep]));
    body.push(`<path d="${path}" fill="none" stroke="${pal.ink}" stroke-width="12" stroke-linejoin="miter" stroke-linecap="butt" />`);
    body.push(`<path d="${path}" fill="none" stroke="${pal.main}" stroke-width="5" stroke-linejoin="miter" stroke-linecap="butt" stroke-dasharray="46 10 18 10" />`);
    for (let step = 0; step < 3; step += 1) {
      const orbitAngle = rng() * TAU;
      const [sx, sy] = polar(fx, fy, 96 + step * 22, orbitAngle);
      shards.push(shard(sx, sy, orbitAngle + Math.PI / 2, 60 + rng() * 40, 14 + rng() * 8, colors[step + 1], rng));
    }
  } else {
    // Monument: poster sunset bands and one heroic shard thrusting upward.
    const bands = [pal.deep, pal.deep2, pal.alt, pal.pop, pal.sun];
    bands.forEach((color, step) => {
      const y = height * (0.2 + step * 0.16);
      body.push(`<rect x="0" y="${round(y)}" width="${width}" height="${height}" fill="${color}" />`);
      body.push(`<line x1="0" y1="${round(y)}" x2="${width}" y2="${round(y)}" stroke="${pal.ink}" stroke-width="3" />`);
    });
    const cx = width * (0.44 + rng() * 0.12);
    body.push(sunDisk(cx, height * 0.46, 70, pal, id, [pal.sun, pal.light, pal.pop]));
    body.push(`<rect y="${round(height * 0.52)}" width="${width}" height="${height}" fill="url(#${id}-dots)" opacity="0.45" />`);
    shards.push(shard(cx - 70, height + 16, -Math.PI / 2 - 0.34, 150, 24, colors[1], rng, 3.5));
    shards.push(shard(cx + 74, height + 16, -Math.PI / 2 + 0.3, 140, 22, colors[3], rng, 3.5));
    shards.push(shard(cx, height + 34, -Math.PI / 2 + (rng() - 0.5) * 0.12, 250, 44, colors[2], rng, 4));
  }

  body.push(
    `<text x="${round(width * (0.6 + rng() * 0.12))}" y="${height + 34}" class="art-initial" fill="none" stroke="${pal.light}" stroke-width="3" opacity="0.45">${initial}</text>`,
  );
  body.push(`<g filter="url(#${id}-rough)">${shards.join("")}</g>`);

  const streakAngle = -0.5 - rng() * 0.4;
  const streaks = Array.from({ length: 5 }, (_, step) => {
    const offset = (step - 2) * 11;
    const x0 = width * 0.06 + offset;
    const y0 = height * 0.2 + offset * 1.4;
    const length = 50 + rng() * 60;
    return `<line x1="${round(x0)}" y1="${round(y0)}" x2="${round(x0 + Math.cos(streakAngle) * length)}" y2="${round(y0 + Math.sin(streakAngle) * length)}" stroke="${pal.light}" stroke-width="${step === 2 ? 3 : 1.5}" stroke-linecap="round" />`;
  });
  body.push(`<g opacity="0.7">${streaks.join("")}</g>`);
  body.push(`<rect width="${width}" height="${height}" fill="url(#${id}-dots)" mask="url(#${id}-shadow)" opacity="0.4" />`);

  return `
    <svg class="card-art-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        ${halftoneDefs(id, pal.ink, pal.light, width, height)}
        <filter id="${id}-rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="${seed % 97}" />
          <feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      ${body.join("")}
    </svg>
  `;
}

export function paintSeed(value) {
  return (hashString(value) % 10000) / 10000;
}

// Spot-ink sets for printed card plates, [ink, shade, spot, light, sky].
// Cards are printed objects, so they keep the paper stock in both themes.
export const GRAPHIC_INKS = {
  mint: ["#10150f", "#0c544d", "#159d8d", "#f2ecd8", "#e6e0c8"],
  gold: ["#17120a", "#7c4f06", "#e1a119", "#f8f0dc", "#ebe1c6"],
  violet: ["#140f1c", "#3d1f78", "#7a4ce0", "#f3ecdc", "#e8e0d0"],
  red: ["#16120e", "#7d2116", "#e5452d", "#f7efdd", "#ece2c8"],
  blue: ["#12131c", "#1d3480", "#3563e0", "#f4e7c0", "#e9e1cb"],
  green: ["#0f140c", "#2f5414", "#6aa62a", "#f3f0d8", "#e6e3c8"],
  mono: ["#141210", "#4a453d", "#8f877a", "#f5eee0", "#e9e2d2"],
  pack: ["#16120e", "#7d2116", "#e5452d", "#f7efdd", "#ece2c8"],
  portrait: ["#12131c", "#1d3480", "#3563e0", "#f4e7c0", "#e9e1cb"],
  back: ["#16120e", "#3a342b", "#e1a119", "#f6efdd", "#1d1a16"],
};

export const GRAPHIC_LAYOUTS = { pack: 1, portrait: 3, back: 4 };

// Printer's marks around the pack: crop marks, registration targets,
// a colour bar and plate captions.
function printMarksSvg() {
  const x = 300;
  const y = 400;
  const crop = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
    .map(([sx, sy]) => `<path d="M${sx * (x + 16)} ${sy * y}h${sx * 70}M${sx * x} ${sy * (y + 16)}v${sy * 70}" />`)
    .join("");
  const target = (cx, cy) => `
    <g class="print-target" transform="translate(${cx} ${cy})">
      <circle r="13" />
      <path d="M-24 0H24M0 -24V24" />
    </g>
  `;
  const bars = Array.from({ length: 6 }, (_, index) => `<rect class="print-bar print-bar--${index}" x="${-150 + index * 50}" y="${y + 58}" width="46" height="18" />`).join("");
  return `
    <svg class="print-marks" viewBox="-500 -500 1000 1000" aria-hidden="true" focusable="false">
      <g class="print-lines">
        ${crop}
        ${target(-x - 58, 0)}
        ${target(x + 58, 0)}
        ${target(0, -y - 58)}
      </g>
      <g class="print-bars">${bars}</g>
      <g class="print-captions">
        <text x="${-x - 70}" y="${-y - 34}">PLATE 01 — CORE 2026</text>
        <text x="${x + 70}" y="${y + 104}" text-anchor="end">FIG. A / GD-CY</text>
      </g>
    </svg>
  `;
}

// Printed card back: ink frame with cut corners and small registration crosses.
function graphicBackSvg() {
  const cross = (cx, cy) => `<path d="M${cx - 7} ${cy}h14M${cx} ${cy - 7}v14" /><circle cx="${cx}" cy="${cy}" r="3.5" />`;
  return `
    <svg viewBox="0 0 280 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polygon class="back-frame" points="22,12 258,12 268,22 268,378 258,388 22,388 12,378 12,22" />
      <rect class="back-frame back-frame--inner" x="24" y="24" width="232" height="352" />
      <g class="back-crosses">${cross(40, 40)}${cross(240, 40)}${cross(40, 360)}${cross(240, 360)}</g>
    </svg>
  `;
}

const staticArt = {
  sigil: printMarksSvg,
  "back-sigil": graphicBackSvg,
};

export function mountStaticArt(root = document) {
  root.querySelectorAll("[data-art]").forEach((element) => {
    const render = staticArt[element.dataset.art];
    if (render && !element.firstElementChild) element.innerHTML = render();
  });
}
