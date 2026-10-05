/*
  Snowflake Grower
  Clifford Reiter's hexagonal automaton (2005): each cell holds water. Cells
  that are ice, or touch ice, are "receptive": they keep their water and gain
  a little more from the cold (gamma). The others share theirs with their
  neighbors (diffusion, alpha). A cell freezes once it holds 1. The rest of
  the air starts at the background level beta, the humidity.
  https://github.com/evoluteur/snowflake-grower
  (c) 2026 Olivier Giulieri
*/

const N = 301; // grid side (axial coordinates), center at (C, C)
const C = (N - 1) / 2;
const R = C - 3; // the air beyond this radius stays at the background level

const presets = [
  { id: "stellar", name: "Stellar dendrite", a: 1, b: 0.4, g: 0.001, text: "Six feathery arms with side branches: the classic snowflake." },
  { id: "fern", name: "Fernlike star", a: 1, b: 0.35, g: 0.001, text: "Long arms, branched like ferns, in drier air." },
  { id: "needle", name: "Needle star", a: 1, b: 0.3, g: 0.0001, text: "Six thin spikes with fine combs of side branches." },
  { id: "broad", name: "Broad branches", a: 1, b: 0.5, g: 0.003, text: "Thick arms with wide, leafy branches." },
  { id: "sectored", name: "Sectored plate", a: 1, b: 0.65, g: 0.0001, text: "A plate divided by ridges, its six sectors growing apart." },
  { id: "fernplate", name: "Fern plate", a: 1, b: 0.8, g: 0.002, text: "Dense herringbone branches filling a hexagon." },
  { id: "lace", name: "Lace hexagon", a: 1, b: 0.95, g: 0.001, text: "Very humid air: a hexagon of rings and lace." },
  { id: "plate", name: "Solid plate", a: 1, b: 0.9, g: 0.05, text: "So much frost that the crystal stays a nearly solid plate." },
  { id: "thin", name: "Thin star", a: 2, b: 0.4, g: 0.0001, text: "Faster diffusion: slender arms with short barbs." },
];

const styles = {
  ice: "Ice",
  rings: "Growth rings",
  paper: "Paper cut",
};

const state = {
  a: 1,
  b: 0.4,
  g: 0.001,
  preset: "stellar",
  style: "ice",
  speed: 12, // steps per frame
  drift: false, // the crystal falls through changing air
  paused: false,
};

const total = N * N;
let s = new Float32Array(total); // water in each cell
let u = new Float32Array(total); // the part that diffuses
let frozen = new Uint8Array(total);
let receptive = new Uint8Array(total);
let born = new Uint16Array(total); // step at which each cell froze
let inside = []; // indices of the cells inside the radius
let dist = new Float32Array(total); // distance to the center, in cells
let steps = 0, done = false, maxDist = 0;
let neighbors; // 6 per cell

const idx = (q, r) => r * N + q;

const setupGrid = () => {
  neighbors = new Int32Array(total * 6);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const ins = [];
  for (let r = 0; r < N; r++) {
    for (let q = 0; q < N; q++) {
      const dq = q - C, dr = r - C;
      // round, so the air around is a disk (x = q + r/2, y = r sqrt3/2)
      const d = Math.hypot(dq + dr / 2, (dr * Math.sqrt(3)) / 2);
      const i = idx(q, r);
      dist[i] = d;
      dirs.forEach(([a, b], k) => {
        const qq = Math.min(N - 1, Math.max(0, q + a)), rr = Math.min(N - 1, Math.max(0, r + b));
        neighbors[i * 6 + k] = idx(qq, rr);
      });
      if (d < R) ins.push(i);
    }
  }
  inside = Int32Array.from(ins);
};

const reset = () => {
  s.fill(state.b);
  frozen.fill(0);
  receptive.fill(0);
  born.fill(0);
  steps = 0;
  done = false;
  maxDist = 0;
  freeze(idx(C, C));
  s[idx(C, C)] = 1;
  dirty = true;
};

const freeze = (i) => {
  frozen[i] = 1;
  born[i] = Math.min(65535, steps);
  receptive[i] = 1;
  for (let k = 0; k < 6; k++) receptive[neighbors[i * 6 + k]] = 1;
  if (dist[i] > maxDist) maxDist = dist[i];
};

const step = () => {
  const { a, g } = state;
  const n = inside.length;
  // the receptive cells keep their water (plus gamma), the others diffuse
  for (let j = 0; j < n; j++) {
    const i = inside[j];
    u[i] = receptive[i] ? 0 : s[i];
  }
  const k = a / 2;
  for (let j = 0; j < n; j++) {
    const i = inside[j];
    const b = i * 6;
    const sum = u[i] + u[neighbors[b]] + u[neighbors[b + 1]] + u[neighbors[b + 2]] + u[neighbors[b + 3]] + u[neighbors[b + 4]] + u[neighbors[b + 5]];
    const ui = u[i];
    const nu = ui + k * (sum / 7 - ui);
    s[i] = receptive[i] ? s[i] + g + nu : nu;
  }
  steps++;
  for (let j = 0; j < n; j++) {
    const i = inside[j];
    if (!frozen[i] && s[i] >= 1) freeze(i);
  }
  // stop before the arms reach the edge of the air, where they fill in
  if (maxDist >= R * 0.82) done = true;
};

// the cells outside the radius are the endless air around the crystal
const refreshAir = () => {
  for (let i = 0; i < total; i++) if (dist[i] >= R) s[i] = state.b;
};

// ------------------------------------------------------------ drawing

let canvas, ctx, img, lookup, dirty = true;

const buildLookup = () => {
  const w = canvas.width, h = canvas.height;
  img = ctx.createImageData(w, h);
  lookup = new Int32Array(w * h).fill(-1);
  // pointy hexes, an arm along each axis: x = sp (q + r/2), y = sp (r sqrt3/2)
  const sp = (Math.min(w, h) / 2 - 2) / (R * 0.88);
  const h3 = Math.sqrt(3) / 2;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5 - w / 2) / sp, y = (py + 0.5 - h / 2) / sp;
      const fr = y / h3, fq = x - fr / 2;
      // cube rounding
      let rq = Math.round(fq), rr = Math.round(fr), rs = Math.round(-fq - fr);
      const dq = Math.abs(rq - fq), dr = Math.abs(rr - fr), ds = Math.abs(rs + fq + fr);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      const q = rq + C, r = rr + C;
      if (q < 0 || r < 0 || q >= N || r >= N) continue;
      const i = idx(q, r);
      if (dist[i] < R) lookup[py * w + px] = i;
    }
  }
};

const mix = (c1, c2, t) => [0, 1, 2].map((k) => c1[k] + (c2[k] - c1[k]) * t);
const hsl = (h, sat, l) => {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
};

const render = () => {
  const w = canvas.width, h = canvas.height;
  const d = img.data;
  const style = state.style;
  const bg = style === "paper" ? [24, 42, 78] : [10, 22, 44];
  const colors = new Uint8ClampedArray(total * 3);
  const last = Math.max(1, steps);
  for (let j = 0; j < inside.length; j++) {
    const i = inside[j];
    let c;
    if (frozen[i]) {
      if (style === "rings") {
        c = hsl(200 + (born[i] / last) * 160, 0.6, 0.66 - (born[i] / last) * 0.12);
      } else if (style === "paper") {
        c = [246, 248, 252];
      } else {
        // thicker (older) ice is whiter, thin new ice is translucent blue,
        // and a little relief from the neighbor up-left shows the ridges
        const t = Math.min(1, (s[i] - 1) / 1.1);
        c = t < 0.5 ? mix([96, 150, 215], [190, 222, 250], t * 2) : mix([190, 222, 250], [255, 255, 255], t * 2 - 1);
        const up = neighbors[i * 6 + 3]; // (q, r - 1)
        const relief = Math.max(-0.25, Math.min(0.25, (s[i] - s[up]) * 1.5));
        c = c.map((v) => v * (1 + relief));
      }
    } else if (style === "paper") {
      c = bg;
    } else {
      // the humid air around, darker where the crystal has drained it
      const t = Math.min(1, s[i] / Math.max(0.05, state.b));
      c = mix(bg, [38, 70, 120], t * 0.9);
    }
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  for (let p = 0; p < w * h; p++) {
    const i = lookup[p];
    const o = p * 4;
    if (i < 0) {
      d[o] = bg[0];
      d[o + 1] = bg[1];
      d[o + 2] = bg[2];
    } else {
      d[o] = colors[i * 3];
      d[o + 1] = colors[i * 3 + 1];
      d[o + 2] = colors[i * 3 + 2];
    }
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (style === "ice") {
    // a soft glow on the ice
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.35;
    ctx.filter = `blur(${Math.round(w / 120)}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
};

// ------------------------------------------------------------ the loop

let driftT = 0;
const loop = () => {
  if (!state.paused && !done) {
    if (state.drift) {
      // the crystal falls through layers of cloud: humidity and frost wander
      driftT += 0.004;
      state.b = Math.min(0.9, Math.max(0.3, state.b + (Math.sin(driftT * 3.1) + Math.sin(driftT * 7.3)) * 0.0015));
      state.g = Math.min(0.006, Math.max(0.0001, state.g * (1 + Math.sin(driftT * 5.7) * 0.01)));
      showValues();
    }
    for (let i = 0; i < state.speed && !done; i++) step();
    if (state.drift) refreshAir();
    dirty = true;
  }
  if (dirty) {
    render();
    dirty = false;
    $("status").textContent = done
      ? `Fully grown, in ${steps.toLocaleString()} steps.`
      : `Growing: step ${steps.toLocaleString()}.`;
  }
  requestAnimationFrame(loop);
};

// ------------------------------------------------------------ controls

const $ = (id) => document.getElementById(id);

// gamma on a log slider: 0.00005 to 0.05
const gToSlider = (g) => Math.log10(g / 0.00005) / 3;
const sliderToG = (v) => 0.00005 * Math.pow(10, v * 3);

const showValues = () => {
  $("alpha").value = state.a;
  $("beta").value = state.b;
  $("gamma").value = gToSlider(state.g);
  $("alpha-val").textContent = state.a.toFixed(2);
  $("beta-val").textContent = state.b.toFixed(3);
  $("gamma-val").textContent = state.g < 0.001 ? state.g.toExponential(1) : state.g.toFixed(4);
  const p = presets.find((p) => p.id === state.preset);
  $("preset").value = p ? p.id : "";
  $("preset-text").textContent = state.drift
    ? "Drifting: the crystal falls through changing air, so each part of it records the weather it grew in."
    : p
      ? p.text
      : "Your own weather.";
  saveHash();
};

const setPreset = (id) => {
  const p = presets.find((p) => p.id === id);
  if (!p) return;
  Object.assign(state, { a: p.a, b: p.b, g: p.g, preset: p.id });
  showValues();
  reset();
};

const custom = () => {
  state.preset = "";
  showValues();
};

let hashTimer;
const saveHash = () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = state.preset ? `p=${state.preset}` : `a=${state.a}&b=${state.b.toFixed(3)}&g=${state.g.toPrecision(2)}`;
    history.replaceState(null, "", "#" + h + (state.style !== "ice" ? `&s=${state.style}` : ""));
  }, 300);
};

const readHash = () => {
  const q = new URLSearchParams(location.hash.slice(1));
  const p = presets.find((p) => p.id === q.get("p"));
  if (p) Object.assign(state, { a: p.a, b: p.b, g: p.g, preset: p.id });
  else if (q.get("b")) {
    const a = +q.get("a"), b = +q.get("b"), g = +q.get("g");
    if (a > 0 && a <= 3 && b > 0 && b < 1 && g > 0 && g <= 0.05) Object.assign(state, { a, b, g, preset: "" });
  }
  if (styles[q.get("s")]) state.style = q.get("s");
};

const download = () => {
  render();
  canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `snowflake-${state.preset || "custom"}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
};

const resize = () => {
  const r = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.min(1100, Math.round(r.width * ratio));
  if (w && canvas.width !== w) {
    canvas.width = w;
    canvas.height = w;
    buildLookup();
    dirty = true;
  }
};

const setupControls = () => {
  $("preset").innerHTML =
    presets.map((p) => `<option value="${p.id}">${p.name}</option>`).join("") +
    '<option value="" disabled>Custom</option>';
  $("style").innerHTML = Object.entries(styles)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("");
  $("style").value = state.style;
  $("preset").addEventListener("change", (e) => setPreset(e.target.value));
  $("alpha").addEventListener("input", (e) => {
    state.a = +e.target.value;
    custom();
  });
  $("beta").addEventListener("input", (e) => {
    state.b = +e.target.value;
    custom();
  });
  $("beta").addEventListener("change", () => !steps || done ? reset() : refreshAir());
  $("gamma").addEventListener("input", (e) => {
    state.g = sliderToG(+e.target.value);
    custom();
  });
  $("style").addEventListener("change", (e) => {
    state.style = e.target.value;
    dirty = true;
    saveHash();
  });
  $("speed").value = state.speed;
  $("speed").addEventListener("input", (e) => (state.speed = +e.target.value));
  $("drift").checked = state.drift;
  $("drift").addEventListener("change", (e) => {
    state.drift = e.target.checked;
    if (state.drift) state.preset = "";
    showValues();
  });
  $("btn-grow").addEventListener("click", reset);
  $("btn-pause").addEventListener("click", () => {
    state.paused = !state.paused;
    $("btn-pause").textContent = state.paused ? "Resume" : "Pause";
  });
  $("btn-png").addEventListener("click", download);
};

const initSnow = () => {
  canvas = $("snow");
  ctx = canvas.getContext("2d", { willReadFrequently: false });
  readHash();
  setupGrid();
  setupControls();
  showValues();
  resize();
  window.addEventListener("resize", resize);
  reset();
  requestAnimationFrame(loop);
};
