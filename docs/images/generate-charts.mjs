// Regenerates the SVG charts in docs/images/charts/ from the seed data.
//   node docs/images/generate-charts.mjs
// No dependencies. Re-run it after changing packages/db/seed/*.json, GAME_RULES, the EXP curve
// (packages/world/src/levels.ts) or BATTLE_RULES.turnOrderExponent.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = fileURLToPath(new URL("./charts/", import.meta.url));
mkdirSync(out, { recursive: true });

const creatures = JSON.parse(readFileSync(`${root}packages/db/seed/creatures.json`, "utf8"));
const world = JSON.parse(readFileSync(`${root}packages/db/seed/mabunyi.world.json`, "utf8"));

// Validated categorical order (dataviz reference palette, light mode). One fixed slot per Wildkin.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const colorOf = new Map(creatures.map((c, i) => [c.id, SERIES[i]]));
const nameOf = new Map(creatures.map((c) => [c.id, c.name]));
const T = { surface: "#fcfcfb", primary: "#0b0b0b", secondary: "#52514e", muted: "#8a8984", grid: "#e4e3df" };
const FONT = "font-family='Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT} role="img" aria-label="${esc(title)}">\n` +
  `<title>${esc(title)}</title>\n<rect width="${w}" height="${h}" rx="12" fill="${T.surface}"/>\n${body}\n</svg>\n`;
const text = (x, y, s, { size = 13, fill = T.primary, anchor = "start", weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const inkOn = (hex) => (lum(hex) > 0.35 ? T.primary : "#ffffff");

// ------------------------------------------------------------------ 1. spawn modifier heatmap (diverging around ×1)

{
  const cols = [
    ...["dawn", "day", "dusk", "night"].map((k) => ["timeOfDay", k]),
    ...["clear", "cloudy", "rain", "storm", "fog"].map((k) => ["weather", k]),
  ];
  // Blue = more common (>1), red = rarer (<1), gray = no change (1).
  const blue = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab"];
  const red = ["#f9d4d1", "#f0a19c", "#e34948", "#a32524"];
  const fillFor = (v) => {
    if (v === 1) return "#f0efec";
    if (v > 1) return blue[Math.min(3, Math.floor((v - 1) / 0.25))];
    if (v === 0) return red[3];
    return red[Math.min(2, Math.floor((1 - v) / 0.3))];
  };
  const cw = 72, ch = 40, x0 = 120, y0 = 92;
  let body = text(24, 34, "Species spawn modifiers", { size: 17, weight: 700 });
  body += text(24, 56, "Multiplier on encounter weight. Blue = more common, red = rarer, 0 = never spawns.", { fill: T.secondary });
  body += text(x0 + (4 * cw) / 2, y0 - 14, "Time of day", { fill: T.secondary, anchor: "middle", size: 12 });
  body += text(x0 + 4 * cw + 12 + (5 * cw) / 2, y0 - 14, "Weather", { fill: T.secondary, anchor: "middle", size: 12 });
  creatures.forEach((c, r) => {
    const y = y0 + 22 + r * (ch + 2);
    body += text(24, y + ch / 2 + 5, c.name, { weight: 600 });
    cols.forEach(([group, key], i) => {
      const x = x0 + i * (cw + 2) + (group === "weather" ? 12 : 0);
      const v = c.spawnModifiers[group]?.[key] ?? 1;
      const f = fillFor(v);
      body += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="4" fill="${f}"/>`;
      body += text(x + cw / 2, y + ch / 2 + 5, `×${v}`, { anchor: "middle", fill: inkOn(f), weight: 600 });
    });
  });
  cols.forEach(([group, key], i) => {
    const x = x0 + i * (cw + 2) + (group === "weather" ? 12 : 0);
    body += text(x + cw / 2, y0 + 12, key, { anchor: "middle", size: 12, fill: T.secondary });
  });
  const h = y0 + 22 + creatures.length * (ch + 2) + 50;
  // legend
  const ly = h - 26;
  const legend = [["#a32524", "×0 never"], [red[1], "rarer"], ["#f0efec", "×1 no change"], [blue[1], "more common"], [blue[3], "×1.75+"]];
  legend.forEach(([f, label], i) => {
    const lx = 24 + i * 130;
    body += `<rect x="${lx}" y="${ly - 11}" width="14" height="14" rx="3" fill="${f}"/>` + text(lx + 20, ly, label, { size: 12, fill: T.secondary });
  });
  writeFileSync(`${out}spawn-modifiers-heatmap.svg`, svg(x0 + 9 * (cw + 2) + 12 + 24, h, body, "Species spawn modifiers heatmap"));
}

// ------------------------------------------------------------------ 2. time-of-day bands over 24 h

{
  const bands = [
    ["night", 0, 5, "#6250d6"],
    ["dawn", 5, 7, "#eb6834"],
    ["day", 7, 17, "#eda100"],
    ["dusk", 17, 19, "#e87ba4"],
    ["night", 19, 24, "#6250d6"],
  ];
  const W = 760, x0 = 24, w = W - 48, y = 76, bh = 44;
  const hx = (hr) => x0 + (hr / 24) * w;
  let body = text(24, 34, "Time-of-day bands (local time at the player's position)", { size: 17, weight: 700 });
  body += text(24, 56, "timeOfDayForHour() in packages/world/src/conditions.ts", { fill: T.secondary });
  for (const [label, a, b, f] of bands) {
    body += `<rect x="${hx(a) + 1}" y="${y}" width="${hx(b) - hx(a) - 2}" height="${bh}" rx="4" fill="${f}"/>`;
    body += text((hx(a) + hx(b)) / 2, y + bh / 2 + 5, label, { anchor: "middle", fill: inkOn(f), weight: 600 });
  }
  for (let hr = 0; hr <= 24; hr += 1) {
    const major = hr % 3 === 0 || [5, 7, 17, 19].includes(hr);
    body += `<line x1="${hx(hr)}" x2="${hx(hr)}" y1="${y + bh + 4}" y2="${y + bh + (major ? 10 : 6)}" stroke="${T.muted}" stroke-width="1"/>`;
    if (major) body += text(hx(hr), y + bh + 26, `${String(hr).padStart(2, "0")}:00`, { anchor: "middle", size: 11, fill: T.secondary });
  }
  writeFileSync(`${out}time-of-day-bands.svg`, svg(W, 170, body, "Time-of-day bands"));
}

// ------------------------------------------------------------------ 3. anti-teleport allowance

{
  const W = 760, H = 400, x0 = 70, y0 = 80, pw = 560, ph = 230;
  const maxT = 60, maxD = 2600;
  const px = (t) => x0 + (t / maxT) * pw;
  const py = (d) => y0 + ph - (d / maxD) * ph;
  const series = [
    { label: "Allowed, both fixes ±10 m", color: "#2a78d6", f: (t) => 40 * t + 10 + 10 + 25 },
    { label: "Allowed, both fixes ±100 m", color: "#eb6834", f: (t) => 40 * t + 100 + 100 + 25 },
    { label: "Walking person (1.4 m/s)", color: "#1baf7a", f: (t) => 1.4 * t },
  ];
  let body = text(24, 34, "Anti-teleport: how far a player may move between two reports", { size: 17, weight: 700 });
  body += text(24, 56, "allowed = 40 m/s × elapsed + accuracy(previous) + accuracy(new) + 25 m jitter", { fill: T.secondary });
  for (let d = 0; d <= maxD; d += 500) {
    body += `<line x1="${x0}" x2="${x0 + pw}" y1="${py(d)}" y2="${py(d)}" stroke="${T.grid}" stroke-width="1"/>`;
    body += text(x0 - 8, py(d) + 4, d >= 1000 ? `${d / 1000}K m` : `${d} m`, { anchor: "end", size: 11, fill: T.secondary });
  }
  for (let t = 0; t <= maxT; t += 10) body += text(px(t), y0 + ph + 18, `${t}s`, { anchor: "middle", size: 11, fill: T.secondary });
  body += text(x0 + pw / 2, y0 + ph + 38, "Seconds since the last accepted fix (server clock)", { anchor: "middle", size: 12, fill: T.secondary });
  for (const s of series) {
    const pts = Array.from({ length: 61 }, (_, t) => `${px(t).toFixed(1)},${py(s.f(t)).toFixed(1)}`).join(" ");
    body += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    body += `<circle cx="${px(60)}" cy="${py(s.f(60))}" r="4" fill="${s.color}" stroke="${T.surface}" stroke-width="2"/>`;
    body += text(px(60) + 10, py(s.f(60)) + 4, `${Math.round(s.f(60))} m`, { size: 12, weight: 600 });
  }
  series.forEach((s, i) => {
    const lx = 24 + i * 240;
    body += `<line x1="${lx}" x2="${lx + 18}" y1="${H - 18}" y2="${H - 18}" stroke="${s.color}" stroke-width="3" stroke-linecap="round"/>` +
      text(lx + 24, H - 14, s.label, { size: 12, fill: T.secondary });
  });
  writeFileSync(`${out}anti-teleport-allowance.svg`, svg(W, H, body, "Anti-teleport movement allowance"));
}

// ------------------------------------------------------------------ 4. encounter odds per habitat (seed world)

/** Mirrors evaluateEncounterTable + combineAvailableWildkin + (optionally) applySpawnModifiers. */
function odds(habitatId, env, withModifiers) {
  const ok = (rules) =>
    (!rules.timeOfDay.length || rules.timeOfDay.includes(env.timeOfDay)) && (!rules.weather.length || rules.weather.includes(env.weather));
  const weights = new Map();
  for (const t of world.encounterTables) {
    if (!t.active || !ok(t.conditionRules)) continue;
    if (t.habitatId !== habitatId && t.habitatId !== null) continue;
    for (const e of t.entries) if (ok(e.conditions)) weights.set(e.creatureId, (weights.get(e.creatureId) ?? 0) + e.weight);
  }
  if (withModifiers) {
    for (const c of creatures) {
      if (!weights.has(c.id)) continue;
      const m = (c.spawnModifiers.weather[env.weather] ?? 1) * (c.spawnModifiers.timeOfDay[env.timeOfDay] ?? 1);
      weights.set(c.id, weights.get(c.id) * m);
    }
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  return creatures.map((c) => ({ id: c.id, p: total > 0 ? (weights.get(c.id) ?? 0) / total : 0 }));
}

const scenarios = [
  { label: "Day · clear (encounter tables only, as v0.1.0 ships)", env: { timeOfDay: "day", weather: "clear" }, mods: false },
  { label: "Day · clear (with species modifiers, after exercise #2)", env: { timeOfDay: "day", weather: "clear" }, mods: true },
  { label: "Night · rain (with species modifiers, after exercise #2)", env: { timeOfDay: "night", weather: "rain" }, mods: true },
];
export const oddsTable = [];
{
  const W = 820, x0 = 170, bw = 600, bh = 22;
  let y = 84;
  let body = text(24, 34, "Who spawns where: share of spawns per habitat (Mabunyi seed world)", { size: 17, weight: 700 });
  body += text(24, 56, "Each bar is 100% of the spawns rolled in that habitat. Same color = same Wildkin in every bar.", { fill: T.secondary });
  for (const sc of scenarios) {
    body += text(24, y + 14, sc.label, { size: 13, weight: 700 });
    y += 26;
    for (const h of world.habitats) {
      const rows = odds(h.id, sc.env, sc.mods);
      oddsTable.push({ scenario: sc.label, habitat: h.name, rows });
      body += text(x0 - 10, y + bh / 2 + 5, h.name, { anchor: "end", size: 12, fill: T.secondary });
      let x = x0;
      for (const r of rows) {
        if (r.p <= 0) continue;
        const w = r.p * bw;
        const f = colorOf.get(r.id);
        body += `<rect x="${x + 1}" y="${y}" width="${Math.max(0, w - 2)}" height="${bh}" rx="4" fill="${f}"/>`;
        const label = `${Math.round(r.p * 100)}%`;
        if (w > 40) body += text(x + w / 2, y + bh / 2 + 5, label, { anchor: "middle", size: 11, fill: inkOn(f), weight: 600 });
        x += w;
      }
      y += bh + 6;
    }
    y += 14;
  }
  creatures.forEach((c, i) => {
    const lx = x0 + i * 112;
    body += `<rect x="${lx}" y="${y}" width="14" height="14" rx="3" fill="${colorOf.get(c.id)}"/>` + text(lx + 20, y + 12, c.name, { size: 12, fill: T.secondary });
  });
  writeFileSync(`${out}encounter-odds.svg`, svg(W, y + 36, body, "Encounter odds per habitat"));
}

// ------------------------------------------------------------------ 5. seed world map

{
  const W = 820, H = 600, pad = 60;
  const allPts = world.regions.flatMap((r) => r.geometry.coordinates.flat(2));
  const lngs = allPts.map((p) => p[0]), lats = allPts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
  const kx = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
  const scale = Math.min((W - 2 * pad - 220) / ((maxX - minX) * kx), (H - 2 * pad - 30) / (maxY - minY));
  const P = ([lng, lat]) => [pad + (lng - minX) * kx * scale, pad + 40 + (maxY - lat) * scale];
  const path = (ring) => ring.map((p, i) => `${i ? "L" : "M"}${P(p).map((v) => v.toFixed(1)).join(",")}`).join("") + "Z";
  const habitatColors = ["#1baf7a", "#eda100", "#2a78d6"];
  let body = text(24, 34, "Mabunyi Nature Reserve: the seed world (packages/db/seed/mabunyi.world.json)", { size: 17, weight: 700 });
  body += text(24, 56, "1 region (gold outline) · 3 habitats (filled) · 7 points of interest (dots). North is up.", { fill: T.secondary });
  for (const r of world.regions)
    for (const poly of r.geometry.coordinates)
      body += `<path d="${poly.map(path).join("")}" fill="#f2b134" fill-opacity="0.12" stroke="#c98500" stroke-width="2.5" stroke-linejoin="round"/>`;
  world.habitats.forEach((h, i) => {
    const c = habitatColors[i % 3];
    body += `<path d="${h.geometry.coordinates.map(path).join("")}" fill="${c}" fill-opacity="0.28" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
  });
  for (const p of world.pois) {
    const [x, y] = P(p.location.coordinates);
    body += `<circle cx="${x}" cy="${y}" r="5" fill="${T.primary}" stroke="${T.surface}" stroke-width="2"/>`;
    body += text(x + 9, y + 4, p.name, { size: 11, fill: T.primary, weight: 600 });
  }
  // legend panel
  const lx = W - 220, ly = 110;
  body += text(lx, ly, "Habitats", { weight: 700 });
  world.habitats.forEach((h, i) => {
    const c = habitatColors[i % 3];
    body += `<rect x="${lx}" y="${ly + 14 + i * 46}" width="16" height="16" rx="3" fill="${c}" fill-opacity="0.5" stroke="${c}"/>`;
    body += text(lx + 24, ly + 27 + i * 46, h.name, { size: 12, weight: 600 });
    const tbl = world.encounterTables.find((t) => t.habitatId === h.id);
    body += text(lx + 24, ly + 43 + i * 46, (tbl?.entries ?? []).map((e) => `${nameOf.get(e.creatureId)} ${e.weight}`).join(" · "), { size: 11, fill: T.secondary });
  });
  body += `<rect x="${lx}" y="${ly + 160}" width="16" height="16" rx="3" fill="#f2b134" fill-opacity="0.2" stroke="#c98500" stroke-width="2"/>` + text(lx + 24, ly + 173, "Region boundary", { size: 12, weight: 600 });
  body += `<circle cx="${lx + 8}" cy="${ly + 198}" r="5" fill="${T.primary}"/>` + text(lx + 24, ly + 202, "Point of interest", { size: 12, weight: 600 });
  // scale bar: 100 m
  const m100 = (100 / 111_320) * kx * scale;
  body += `<line x1="${pad}" x2="${pad + m100}" y1="${H - 30}" y2="${H - 30}" stroke="${T.primary}" stroke-width="2"/>` + text(pad + m100 + 8, H - 26, "100 m", { size: 11, fill: T.secondary });
  writeFileSync(`${out}seed-world-map.svg`, svg(W, H, body, "Mabunyi seed world map"));
}

// ------------------------------------------------------------------ 6. EXP curve (v0.3.0)

// Mirrors packages/world/src/levels.ts and RESEARCH_RULES.levelsPerRank (packages/shared/src/research.ts).
// Keep these three in sync if you change the curve or the license bands.
const totalExpForLevel = (level) => (level <= 1 ? 0 : Math.min(level, 100) ** 3);
const nextLevelGap = (level) => (level >= 100 ? 0 : totalExpForLevel(level + 1) - totalExpForLevel(level));
const LEVELS_PER_RANK = 20;

{
  // Two panels with their own y-axis (two measures of different scale: never one chart with two axes).
  const W = 820, x0 = 90, pw = 680, ph = 190;
  const panels = [
    { y0: 96, title: "Total EXP needed to reach a level: totalExpForLevel(L) = L³", f: totalExpForLevel, max: 1_000_000, step: 250_000, color: SERIES[0] },
    { y0: 96 + ph + 86, title: "EXP from one level to the next: nextLevelGap(L)", f: nextLevelGap, max: 30_000, step: 10_000, color: SERIES[1] },
  ];
  const px = (l) => x0 + ((l - 1) / 99) * pw;
  const fmt = (v) => (v >= 1_000_000 ? `${v / 1_000_000}M` : v >= 1000 ? `${v / 1000}K` : String(v));
  let body = text(24, 34, "Wildkin EXP curve, levels 1 to 100", { size: 17, weight: 700 });
  body += text(24, 56, "Dashed lines: license caps (rank × 20). A Wildkin at its cap gains no more EXP; anything beyond is lost.", { fill: T.secondary });
  for (const p of panels) {
    const py = (v) => p.y0 + ph - (v / p.max) * ph;
    body += text(x0, p.y0 - 14, p.title, { size: 13, weight: 600 });
    for (let v = 0; v <= p.max; v += p.step) {
      body += `<line x1="${x0}" x2="${x0 + pw}" y1="${py(v)}" y2="${py(v)}" stroke="${T.grid}" stroke-width="1"/>`;
      body += text(x0 - 8, py(v) + 4, fmt(v), { anchor: "end", size: 11, fill: T.secondary });
    }
    for (let cap = LEVELS_PER_RANK; cap < 100; cap += LEVELS_PER_RANK) {
      body += `<line x1="${px(cap)}" x2="${px(cap)}" y1="${p.y0}" y2="${p.y0 + ph}" stroke="${T.muted}" stroke-width="1" stroke-dasharray="4 4"/>`;
      body += text(px(cap) + 4, p.y0 + 12, `rank ${cap / LEVELS_PER_RANK} cap`, { size: 10, fill: T.secondary });
    }
    const pts = Array.from({ length: 100 }, (_, i) => i + 1)
      .filter((l) => p.f !== nextLevelGap || l < 100)
      .map((l) => `${px(l).toFixed(1)},${py(p.f(l)).toFixed(1)}`)
      .join(" ");
    body += `<polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const l of [20, 40, 60, 80]) {
      const v = p.f(l);
      body += `<circle cx="${px(l)}" cy="${py(v)}" r="4" fill="${p.color}" stroke="${T.surface}" stroke-width="2"/>`;
      body += text(px(l) - 6, py(v) - 8, v.toLocaleString("en-US"), { anchor: "end", size: 11, weight: 600 });
    }
    for (const l of [1, 20, 40, 60, 80, 100]) body += text(px(l), p.y0 + ph + 18, String(l), { anchor: "middle", size: 11, fill: T.secondary });
    body += text(x0 + pw / 2, p.y0 + ph + 36, "Level", { anchor: "middle", size: 12, fill: T.secondary });
  }
  writeFileSync(`${out}exp-curve.svg`, svg(W, panels[1].y0 + ph + 56, body, "Wildkin EXP curve"));
}

// ------------------------------------------------------------------ 7. turn-order odds (v0.3.0)

{
  // P(A first) = SPD_A^k / (SPD_A^k + SPD_B^k), BATTLE_RULES.turnOrderExponent (packages/shared/src/battle.ts).
  const W = 820, H = 430, x0 = 70, y0 = 84, pw = 660, ph = 250;
  const rMin = 0.25, rMax = 4; // speed ratio on a log scale, so 1/2 and 2 sit symmetrically
  const px = (r) => x0 + ((Math.log(r) - Math.log(rMin)) / (Math.log(rMax) - Math.log(rMin))) * pw;
  const py = (p) => y0 + ph - p * ph;
  const series = [
    { label: "k = 1 (current)", color: SERIES[0], f: (r) => r / (r + 1), dash: "" },
    { label: "k = 2 (if Speed matters too little)", color: SERIES[1], f: (r) => r * r / (r * r + 1), dash: "" },
    { label: "Exercise #10 fallback: faster always first", color: T.muted, f: (r) => (r >= 1 ? 1 : 0), dash: "5 4" },
  ];
  let body = text(24, 34, "Turn order: chance that Wildkin A attacks first", { size: 17, weight: 700 });
  body += text(24, 56, "P(A first) = SPD_A^k / (SPD_A^k + SPD_B^k), re-rolled every turn. Faster has better odds, never certainty.", { fill: T.secondary });
  for (let p = 0; p <= 1.0001; p += 0.25) {
    body += `<line x1="${x0}" x2="${x0 + pw}" y1="${py(p)}" y2="${py(p)}" stroke="${T.grid}" stroke-width="1"/>`;
    body += text(x0 - 8, py(p) + 4, `${Math.round(p * 100)}%`, { anchor: "end", size: 11, fill: T.secondary });
  }
  for (const r of [0.25, 0.5, 1, 2, 4]) {
    const label = r < 1 ? `1/${1 / r}×` : `${r}×`;
    body += text(px(r), y0 + ph + 18, label, { anchor: "middle", size: 11, fill: T.secondary });
  }
  body += text(x0 + pw / 2, y0 + ph + 38, "Speed ratio SPD_A / SPD_B (log scale)", { anchor: "middle", size: 12, fill: T.secondary });
  for (const s of series) {
    const n = 200;
    const pts = Array.from({ length: n + 1 }, (_, i) => {
      const r = Math.exp(Math.log(rMin) + (i / n) * (Math.log(rMax) - Math.log(rMin)));
      return `${px(r).toFixed(1)},${py(s.f(r)).toFixed(1)}`;
    }).join(" ");
    body += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
  }
  // Labelled points: twice as fast, and level 5 Kawi (Speed 16) against level 5 Kantar (Speed 9).
  for (const [r, name] of [[2, "twice as fast"], [16 / 9, "Kawi 16 vs Kantar 9"]]) {
    for (const s of series.slice(0, 2)) {
      const p = s.f(r);
      body += `<circle cx="${px(r)}" cy="${py(p)}" r="4" fill="${s.color}" stroke="${T.surface}" stroke-width="2"/>`;
      body += text(px(r) + (name.startsWith("Kawi") ? -8 : 8), py(p) + (name.startsWith("Kawi") ? -8 : 14), `${Math.round(p * 100)}%`, { anchor: name.startsWith("Kawi") ? "end" : "start", size: 11, weight: 600 });
    }
    body += text(px(r), y0 + ph - 8, name, { anchor: name.startsWith("Kawi") ? "end" : "start", size: 10, fill: T.secondary });
  }
  series.forEach((s, i) => {
    const lx = 24 + i * 250;
    body += `<line x1="${lx}" x2="${lx + 18}" y1="${H - 18}" y2="${H - 18}" stroke="${s.color}" stroke-width="3" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>` +
      text(lx + 24, H - 14, s.label, { size: 12, fill: T.secondary });
  });
  writeFileSync(`${out}turn-order-odds.svg`, svg(W, H, body, "Turn-order odds by speed ratio"));
}

// Markdown table of the encounter odds, pasted into docs/09-wildkin-and-content.md.
const md = ["| Scenario | Habitat | " + creatures.map((c) => c.name).join(" | ") + " |", "|---|---|" + creatures.map(() => "---:|").join("")];
for (const r of oddsTable) md.push(`| ${r.scenario} | ${r.habitat} | ` + r.rows.map((x) => (x.p ? `${Math.round(x.p * 100)}%` : "-")).join(" | ") + " |");
writeFileSync(`${out}encounter-odds.md`, md.join("\n") + "\n");
console.log("Charts written to", out);
