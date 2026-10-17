// Möbelkatalog mit Standardmaßen (Breite × Tiefe in cm) und Draufsicht-Symbolen.
// Lokales Koordinatensystem: Mittelpunkt = (0,0), die Rückseite liegt oben (negatives y).

export const CATALOG = [
  {
    id: 'wohnen', name: 'Wohnen', color: '#b0bec5',
    items: [
      { type: 'sofa', name: 'Sofa', w: 200, h: 90, shape: 'sofa' },
      { type: 'sofa-corner', name: 'Ecksofa', w: 260, h: 180, shape: 'cornersofa' },
      { type: 'armchair', name: 'Sessel', w: 80, h: 80, shape: 'sofa' },
      { type: 'coffee-table', name: 'Couchtisch', w: 110, h: 60, shape: 'table', color: '#d7ccc8' },
      { type: 'tv-board', name: 'TV-Board', w: 180, h: 45, shape: 'tv', color: '#cfd8dc' },
      { type: 'shelf', name: 'Regal', w: 100, h: 35, shape: 'shelf', color: '#d7ccc8' },
      { type: 'rug', name: 'Teppich', w: 200, h: 140, shape: 'rug', color: '#e6d8c3' },
      { type: 'plant', name: 'Pflanze', w: 45, h: 45, shape: 'plant', color: '#81c784' },
    ],
  },
  {
    id: 'essen', name: 'Essen', color: '#d7ccc8',
    items: [
      { type: 'dining-table', name: 'Esstisch', w: 160, h: 90, shape: 'table' },
      { type: 'round-table', name: 'Runder Tisch', w: 100, h: 100, shape: 'roundtable' },
      { type: 'chair', name: 'Stuhl', w: 45, h: 50, shape: 'chair', color: '#bcaaa4' },
      { type: 'bench', name: 'Sitzbank', w: 140, h: 40, shape: 'bench', color: '#bcaaa4' },
    ],
  },
  {
    id: 'schlafen', name: 'Schlafen', color: '#c5cae9',
    items: [
      { type: 'bed-double', name: 'Doppelbett', w: 160, h: 200, shape: 'bed' },
      { type: 'bed-single', name: 'Einzelbett', w: 90, h: 200, shape: 'bed' },
      { type: 'wardrobe', name: 'Kleiderschrank', w: 200, h: 60, shape: 'wardrobe', color: '#d7ccc8' },
      { type: 'nightstand', name: 'Nachttisch', w: 45, h: 40, shape: 'cabinet', color: '#d7ccc8' },
      { type: 'dresser', name: 'Kommode', w: 120, h: 50, shape: 'cabinet', color: '#d7ccc8' },
    ],
  },
  {
    id: 'kueche', name: 'Küche', color: '#e0e0e0',
    items: [
      { type: 'counter', name: 'Unterschrank', w: 60, h: 60, shape: 'counter' },
      { type: 'stove', name: 'Herd', w: 60, h: 60, shape: 'stove' },
      { type: 'sink', name: 'Spüle', w: 80, h: 60, shape: 'sink' },
      { type: 'fridge', name: 'Kühlschrank', w: 60, h: 65, shape: 'appliance' },
      { type: 'dishwasher', name: 'Geschirrspüler', w: 60, h: 60, shape: 'appliance' },
      { type: 'island', name: 'Kücheninsel', w: 180, h: 90, shape: 'island' },
    ],
  },
  {
    id: 'bad', name: 'Bad', color: '#e1f5fe',
    items: [
      { type: 'bathtub', name: 'Badewanne', w: 170, h: 75, shape: 'bathtub' },
      { type: 'shower', name: 'Dusche', w: 90, h: 90, shape: 'shower' },
      { type: 'wc', name: 'WC', w: 40, h: 65, shape: 'wc' },
      { type: 'washbasin', name: 'Waschbecken', w: 60, h: 45, shape: 'washbasin' },
      { type: 'washer', name: 'Waschmaschine', w: 60, h: 60, shape: 'washer', color: '#eceff1' },
    ],
  },
  {
    id: 'buero', name: 'Büro', color: '#ffe0b2',
    items: [
      { type: 'desk', name: 'Schreibtisch', w: 140, h: 70, shape: 'desk' },
      { type: 'office-chair', name: 'Bürostuhl', w: 60, h: 60, shape: 'officechair', color: '#90a4ae' },
      { type: 'bookshelf', name: 'Bücherregal', w: 80, h: 30, shape: 'shelf', color: '#d7ccc8' },
    ],
  },
];

const BY_TYPE = new Map();
for (const cat of CATALOG) {
  for (const item of cat.items) BY_TYPE.set(item.type, { ...item, color: item.color || cat.color, category: cat.id });
}

// Sucht eine Vorlage im Katalog oder in den eigenen Möbeln des Plans.
export function findTemplate(type, plan) {
  if (BY_TYPE.has(type)) return BY_TYPE.get(type);
  const c = plan?.customFurniture.find((x) => x.type === type);
  return c ? { ...c, shape: 'rect', category: 'custom' } : null;
}

export const shapeOf = (type) => BY_TYPE.get(type)?.shape || 'rect';

// ---- Symbole ----
const STROKE = '#455a64';
const LIGHT = 'rgba(255,255,255,0.45)';
const n = (v) => Math.round(v * 100) / 100;
const st = (w = 1.2) => `stroke="${STROKE}" stroke-width="${w}" vector-effect="non-scaling-stroke"`;
const rect = (x, y, w, h, fill, rx = 0, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" rx="${n(Math.max(0, rx))}" fill="${fill}" ${st()} ${extra}/>`;
const line = (x1, y1, x2, y2, extra = '') =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${st(1)} ${extra}/>`;
const circle = (cx, cy, r, fill) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(0, r))}" fill="${fill}" ${st()}/>`;
const ellipse = (cx, cy, rx, ry, fill) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(Math.max(0, rx))}" ry="${n(Math.max(0, ry))}" fill="${fill}" ${st()}/>`;

const SHAPES = {
  rect: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 2),
  cabinet: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 1) + line(-w / 2, h / 2 - 4, w / 2, h / 2 - 4),
  counter: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 1) + line(-w / 2, h / 2 - 4, w / 2, h / 2 - 4),
  island: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 2) + rect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 'none', 1),
  bench: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 4),
  table: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 4),
  roundtable: (w, h, c) => ellipse(0, 0, w / 2, h / 2, c),
  wardrobe(w, h, c) {
    let s = rect(-w / 2, -h / 2, w, h, c, 1);
    const k = Math.max(1, Math.round(w / 50));
    for (let i = 1; i < k; i++) s += line(-w / 2 + (i * w) / k, -h / 2, -w / 2 + (i * w) / k, h / 2);
    return s + line(-w / 2 + 4, 0, w / 2 - 4, 0, 'stroke-dasharray="4 3"');
  },
  shelf(w, h, c) {
    let s = rect(-w / 2, -h / 2, w, h, c, 1);
    const k = Math.max(1, Math.round(w / 40));
    for (let i = 1; i < k; i++) s += line(-w / 2 + (i * w) / k, -h / 2, -w / 2 + (i * w) / k, h / 2);
    return s;
  },
  tv: (w, h, c) => SHAPES.cabinet(w, h, c) + rect(-w * 0.35, -h / 2 + 3, w * 0.7, 4, '#37474f'),
  sofa(w, h, c) {
    const back = Math.min(h * 0.28, 25);
    const arm = Math.min(w * 0.12, 20);
    let s = rect(-w / 2, -h / 2, w, h, c, 6);
    s += rect(-w / 2, -h / 2, w, back, LIGHT, 4);
    s += rect(-w / 2, -h / 2 + back, arm, h - back, LIGHT, 3) + rect(w / 2 - arm, -h / 2 + back, arm, h - back, LIGHT, 3);
    const iw = w - 2 * arm;
    const k = Math.max(1, Math.round(iw / 70));
    for (let i = 0; i < k; i++) s += rect(-w / 2 + arm + (i * iw) / k + 1, -h / 2 + back + 1, iw / k - 2, h - back - 4, 'none', 3);
    return s;
  },
  cornersofa(w, h, c) {
    const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
    const d = Math.min(95, h * 0.6, w * 0.45);
    const b = Math.min(d * 0.3, 25);
    const outer = `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y0 + d)}H${n(x0 + d)}V${n(y1)}H${n(x0)}Z`;
    const back = `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y0 + b)}H${n(x0 + b)}V${n(y1)}H${n(x0)}Z`;
    return `<path d="${outer}" fill="${c}" ${st()} stroke-linejoin="round"/><path d="${back}" fill="${LIGHT}" ${st()}/>`
      + line(x0 + d, y0 + b, x0 + d, y0 + d) + line(x1 - 20, y0 + b, x1 - 20, y0 + d);
  },
  bed(w, h, c) {
    const x0 = -w / 2, y0 = -h / 2;
    let s = rect(x0, y0, w, h, c, 3);
    const k = w >= 120 ? 2 : 1;
    const pw = (w - 10 - (k - 1) * 6) / k;
    const ph = Math.min(30, h * 0.15);
    for (let i = 0; i < k; i++) s += rect(x0 + 5 + i * (pw + 6), y0 + 6, pw, ph, '#fff', 5);
    s += rect(x0 + 3, y0 + h * 0.28, w - 6, h * 0.72 - 3, LIGHT, 3);
    return s + line(x0 + 3, y0 + h * 0.38, x0 + w - 3, y0 + h * 0.38);
  },
  chair(w, h, c) {
    return rect(-w / 2 + 2, -h / 2 + h * 0.22, w - 4, h * 0.78 - 2, c, 4) + rect(-w / 2, -h / 2, w, h * 0.2, c, 3);
  },
  officechair(w, h, c) {
    const r = Math.min(w, h) * 0.38;
    return circle(0, h * 0.06, r, c) + rect(-w * 0.4, -h / 2, w * 0.8, h * 0.18, c, 6);
  },
  rug(w, h, c) {
    return rect(-w / 2, -h / 2, w, h, c, 2, 'fill-opacity="0.7" stroke-dasharray="6 4"')
      + rect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 'none', 2, 'stroke-dasharray="2 4"');
  },
  plant(w, h, c) {
    const r = Math.min(w, h) / 2;
    let s = '';
    for (let k = 0; k < 8; k++) {
      s += `<ellipse cx="0" cy="${n(-r * 0.5)}" rx="${n(r * 0.24)}" ry="${n(r * 0.5)}" transform="rotate(${k * 45})" fill="${c}" ${st(1)}/>`;
    }
    return s + circle(0, 0, r * 0.3, '#a1887f');
  },
  stove(w, h, c) {
    const r = Math.min(w, h) * 0.15;
    let s = rect(-w / 2, -h / 2, w, h, c, 1);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s += circle((sx * w) / 4, (sy * h) / 4, r, 'none');
    return s;
  },
  sink(w, h, c) {
    return rect(-w / 2, -h / 2, w, h, c, 1)
      + rect(-w * 0.32, -h / 2 + 8, w * 0.64, h - 16, '#fff', 6)
      + circle(0, 4, 2.5, 'none') + circle(0, -h / 2 + 4, 2, '#90a4ae');
  },
  appliance: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 1) + rect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 'none', 1)
    + line(-w / 2, h / 2 - 4, w / 2, h / 2 - 4),
  washer(w, h, c) {
    const r = Math.min(w, h) * 0.33;
    return rect(-w / 2, -h / 2, w, h, c, 2) + circle(0, 2, r, '#fff') + circle(0, 2, r * 0.6, 'none');
  },
  bathtub(w, h, c) {
    const ri = Math.min(h / 2 - 6, 30);
    return rect(-w / 2, -h / 2, w, h, c, 6) + rect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, '#fff', ri)
      + circle(-w / 2 + 20, 0, 3, 'none');
  },
  shower(w, h, c) {
    return rect(-w / 2, -h / 2, w, h, c, 2) + line(-w / 2, -h / 2, w / 2, h / 2) + line(w / 2, -h / 2, -w / 2, h / 2)
      + circle(0, 0, 4, '#fff');
  },
  wc(w, h, c) {
    const th = h * 0.28;
    return ellipse(0, -h / 2 + th + (h - th) / 2, w * 0.45, (h - th) / 2, '#fff') + rect(-w / 2, -h / 2, w, th, c, 3);
  },
  washbasin(w, h, c) {
    return rect(-w / 2, -h / 2, w, h, c, 3) + ellipse(0, h * 0.06, w * 0.36, h * 0.32, '#fff') + circle(0, -h / 2 + h * 0.15, 2, '#90a4ae');
  },
  desk: (w, h, c) => rect(-w / 2, -h / 2, w, h, c, 2) + rect(-w * 0.2, -h / 2 + 6, w * 0.4, 5, '#546e7a'),
};

export function furnitureSymbol(f) {
  const draw = SHAPES[shapeOf(f.type)] || SHAPES.rect;
  return draw(f.w, f.h, f.color);
}

// Kleine Vorschaugrafik für die Palette.
export function previewSVG(t, size = 44) {
  const pad = 6;
  const vb = `${n(-t.w / 2 - pad)} ${n(-t.h / 2 - pad)} ${n(t.w + 2 * pad)} ${n(t.h + 2 * pad)}`;
  const draw = SHAPES[t.shape] || SHAPES.rect;
  return `<svg viewBox="${vb}" width="${size}" height="${size}" aria-hidden="true">${draw(t.w, t.h, t.color)}</svg>`;
}
