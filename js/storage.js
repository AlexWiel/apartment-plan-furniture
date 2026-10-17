// Speichern & Laden: Autosave, Plan-Bibliothek im Browser, JSON- und PNG-Export.
import { normalizePlan, uid } from './state.js';
import { planBounds, polygonArea } from './geometry.js';
import { renderPlan, COLORS, FONT, formatArea } from './render.js';

const AUTOSAVE_KEY = 'wohnplaner.autosave.v1';
const LIBRARY_KEY = 'wohnplaner.library.v1';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---- Autosave ----
export const autosave = (plan, currentId, savedSnapshot) => writeJSON(AUTOSAVE_KEY, { plan, currentId, savedSnapshot });

export function loadAutosave() {
  const data = readJSON(AUTOSAVE_KEY, null);
  if (!data || !data.plan) return null;
  try {
    return { plan: normalizePlan(data.plan), currentId: data.currentId || null, savedSnapshot: data.savedSnapshot || null };
  } catch {
    return null;
  }
}

// ---- Bibliothek ----
const readLibrary = () => {
  const lib = readJSON(LIBRARY_KEY, {});
  return lib && typeof lib === 'object' && !Array.isArray(lib) ? lib : {};
};

export function listLibrary() {
  return Object.entries(readLibrary())
    .map(([id, e]) => ({ id, name: e.name, savedAt: e.savedAt, rooms: e.plan?.rooms?.length || 0, furniture: e.plan?.furniture?.length || 0 }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export function saveToLibrary(id, plan) {
  const lib = readLibrary();
  const key = id || uid('p');
  lib[key] = { name: plan.name, savedAt: Date.now(), plan };
  if (!writeJSON(LIBRARY_KEY, lib)) throw new Error('Speichern im Browser fehlgeschlagen (Speicher voll oder blockiert).');
  return key;
}

export function loadFromLibrary(id) {
  const entry = readLibrary()[id];
  if (!entry) throw new Error('Plan nicht gefunden.');
  return normalizePlan(entry.plan);
}

export function deleteFromLibrary(id) {
  const lib = readLibrary();
  delete lib[id];
  writeJSON(LIBRARY_KEY, lib);
}

// ---- Dateien ----
const fileName = (name, ext) => (name || 'wohnung').replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '_') + '.' + ext;

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJSON(plan) {
  download(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), fileName(plan.name, 'json'));
}

export async function importJSON(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Datei.');
  }
  return normalizePlan(data);
}

// Erzeugt ein eigenständiges SVG des Plans (ohne Auswahl und Bedienelemente).
export function planToSVG(plan, maxPx = 2400) {
  const b = planBounds(plan);
  if (!b) throw new Error('Der Plan ist leer.');
  const pad = 70;
  const head = 60;
  const minX = b.minX - pad;
  const minY = b.minY - pad - head;
  const w = b.maxX - b.minX + 2 * pad;
  const h = b.maxY - b.minY + 2 * pad + head;
  const scale = Math.min(maxPx / w, maxPx / h, 3);
  const W = Math.ceil(w * scale);
  const H = Math.ceil(h * scale);
  const total = plan.rooms.reduce((s, r) => s + Math.abs(polygonArea(r.points)), 0);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const title = `<text x="${minX + pad}" y="${minY + pad}" font-size="30" font-weight="700" fill="${COLORS.text}">${esc(plan.name)}</text>`
    + `<text x="${minX + pad}" y="${minY + pad + 26}" font-size="17" fill="${COLORS.dim}">Wohnfläche ${formatArea(total)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${minX} ${minY} ${w} ${h}" font-family="${FONT}">`
    + `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="${COLORS.paper}"/>${title}`
    + renderPlan(plan, { scale, interactive: false })
    + '</svg>';
  return { svg, W, H };
}

export async function exportPNG(plan) {
  const { svg, W, H } = planToSVG(plan);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d').drawImage(img, 0, 0, W, H);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    download(blob, fileName(plan.name, 'png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
