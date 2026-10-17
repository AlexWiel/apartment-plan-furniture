// Erzeugt das SVG-Markup für den Plan (Weltkoordinaten in cm).
import { ui } from './state.js';
import { polygonArea, labelPoint, bounds, dist, furnitureHalfExtents, rotate, pointInPolygon } from './geometry.js';
import { furnitureSymbol } from './furniture.js';
import { getImage } from './background.js';

export const COLORS = {
  paper: '#fbfaf7',
  wall: '#3c4a52',
  gridMinor: 'rgba(40,60,80,0.14)',
  gridMajor: 'rgba(40,60,80,0.30)',
  select: '#1e88e5',
  text: '#263238',
  dim: '#5f6f78',
  window: '#e3f2fd',
};
export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const n = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ptsAttr = (pts) => pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ');
const halo = `stroke="${COLORS.paper}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`;

export const formatLength = (cm) =>
  (cm / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m';
export const formatArea = (cm2) =>
  (Math.abs(cm2) / 10000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' m²';

// Ursprung des Raum-Rasters: linke obere Ecke der Raumhülle.
export function roomGridOrigin(room) {
  const b = bounds(room.points);
  return [b.minX, b.minY];
}

// Lage einer Tür/eines Fensters auf der Wand.
export function openingGeom(room, o) {
  const A = room.points[o.wall % room.points.length];
  const B = room.points[(o.wall + 1) % room.points.length];
  const L = dist(A, B) || 1;
  const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  const sign = polygonArea(room.points) >= 0 ? 1 : -1;
  const inward = [-u[1] * sign, u[0] * sign];
  const half = Math.min(o.width, L) / 2;
  const tc = Math.min(Math.max(o.t * L, half), L - half);
  const P = [A[0] + u[0] * tc, A[1] + u[1] * tc];
  const p1 = [P[0] - u[0] * half, P[1] - u[1] * half];
  const p2 = [P[0] + u[0] * half, P[1] + u[1] * half];
  return { A, B, L, u, inward, P, p1, p2, half };
}

function gridPattern(id, ox, oy, g, px, scale) {
  const M = 100 % g === 0 ? 100 : g;
  let minor = '';
  if (g * scale >= 5) for (let k = g; k < M; k += g) minor += `M${k} 0V${M}M0 ${k}H${M}`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${n(ox)}" y="${n(oy)}" width="${M}" height="${M}">`
    + (minor ? `<path d="${minor}" fill="none" stroke="${COLORS.gridMinor}" stroke-width="${n(px)}"/>` : '')
    + `<path d="M0 0H${M}M0 0V${M}" fill="none" stroke="${COLORS.gridMajor}" stroke-width="${n(px * 2)}"/></pattern>`;
}

function renderOpening(room, o, wt, px, extra = '') {
  const g = openingGeom(room, o);
  const { p1, p2, inward, half } = g;
  let s = `<g ${extra}>`;
  // Lücke in der Wand
  s += `<line x1="${n(p1[0])}" y1="${n(p1[1])}" x2="${n(p2[0])}" y2="${n(p2[1])}" stroke="${COLORS.paper}" stroke-width="${n(wt + 2)}"/>`;
  if (o.type === 'window') {
    const h = wt / 2;
    const q = [
      [p1[0] + inward[0] * h, p1[1] + inward[1] * h],
      [p2[0] + inward[0] * h, p2[1] + inward[1] * h],
      [p2[0] - inward[0] * h, p2[1] - inward[1] * h],
      [p1[0] - inward[0] * h, p1[1] - inward[1] * h],
    ];
    s += `<polygon points="${ptsAttr(q)}" fill="${COLORS.window}" stroke="${COLORS.wall}" stroke-width="${n(px * 1.2)}"/>`;
    s += `<line x1="${n(p1[0])}" y1="${n(p1[1])}" x2="${n(p2[0])}" y2="${n(p2[1])}" stroke="${COLORS.wall}" stroke-width="${n(px)}"/>`;
  } else {
    const hinge = o.swing === 'right' ? p2 : p1;
    const other = o.swing === 'right' ? p1 : p2;
    const side = o.flip ? -1 : 1;
    const w = half * 2;
    const leaf = [hinge[0] + inward[0] * side * w, hinge[1] + inward[1] * side * w];
    const v = [leaf[0] - hinge[0], leaf[1] - hinge[1]];
    const ww = [other[0] - hinge[0], other[1] - hinge[1]];
    const sweep = v[0] * ww[1] - v[1] * ww[0] > 0 ? 1 : 0;
    s += `<path d="M${n(leaf[0])} ${n(leaf[1])}A${n(w)} ${n(w)} 0 0 ${sweep} ${n(other[0])} ${n(other[1])}" fill="none" stroke="${COLORS.dim}" stroke-width="${n(px)}" stroke-dasharray="${n(px * 4)} ${n(px * 3)}"/>`;
    s += `<line x1="${n(hinge[0])}" y1="${n(hinge[1])}" x2="${n(leaf[0])}" y2="${n(leaf[1])}" stroke="${COLORS.wall}" stroke-width="${n(Math.max(px * 2, 3))}" stroke-linecap="round"/>`;
  }
  return s + '</g>';
}

function edgeLabel(a, b, outward, offset, fontSize) {
  const L = dist(a, b);
  const m = [(a[0] + b[0]) / 2 + outward[0] * offset, (a[1] + b[1]) / 2 + outward[1] * offset];
  let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  if (ang > 90 || ang <= -90) ang += 180;
  return `<text x="${n(m[0])}" y="${n(m[1])}" transform="rotate(${n(ang)} ${n(m[0])} ${n(m[1])})" text-anchor="middle" dominant-baseline="middle" font-size="${n(fontSize)}" fill="${COLORS.dim}" ${halo}>${formatLength(L)}</text>`;
}

function roomDimensions(room, wt, fontSize, rooms) {
  const pts = room.points;
  const sign = polygonArea(pts) >= 0 ? 1 : -1;
  let s = '';
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = dist(a, b);
    if (L < 30) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    let outward = [u[1] * sign, -u[0] * sign];
    const off = wt / 2 + fontSize * 0.9;
    // Liegt die Beschriftung außen in einem Nachbarraum, kommt sie nach innen.
    const probe = [(a[0] + b[0]) / 2 + outward[0] * off, (a[1] + b[1]) / 2 + outward[1] * off];
    if (rooms.some((r) => r !== room && pointInPolygon(probe, r.points))) outward = [-outward[0], -outward[1]];
    s += edgeLabel(a, b, outward, off, fontSize);
  }
  return s;
}

function furnitureLabel(f) {
  const [hw, hh] = furnitureHalfExtents(f);
  const len = Math.max(3, f.name.length);
  let fs = Math.min(16, Math.max(7, Math.min(f.w, f.h) * 0.22));
  fs = Math.min(fs, (hw * 2 * 0.9) / (0.56 * len));
  if (fs < 6 || hh * 2 < 14) return '';
  return `<text x="${n(f.x)}" y="${n(f.y)}" text-anchor="middle" dominant-baseline="middle" font-size="${n(fs)}" fill="${COLORS.text}" ${halo} pointer-events="none">${esc(f.name)}</text>`;
}

/**
 * @param plan Plan
 * @param opts { scale, interactive, viewBounds }
 */
export function renderPlan(plan, opts) {
  const { scale, interactive = true, viewBounds } = opts;
  // Bei sichtbarer Foto-Vorlage scheinen die Räume durch
  const translucent = interactive && plan.background?.visible;
  const set = plan.settings;
  const wt = set.wallThickness;
  const g = set.gridSize;
  const px = 1 / scale;
  const sel = interactive ? ui.selection : null;
  let defs = '';
  let fills = '';
  let walls = '';
  let openings = '';
  let labels = '';
  let furniture = '';
  let overlay = '';

  // Hintergrundraster beim Zeichnen von Räumen
  if (interactive && viewBounds && (ui.tool === 'room' || !plan.rooms.length)) {
    defs += gridPattern('grid-global', 0, 0, g, px, scale);
    const b = viewBounds;
    fills += `<rect x="${n(b.minX)}" y="${n(b.minY)}" width="${n(b.maxX - b.minX)}" height="${n(b.maxY - b.minY)}" fill="url(#grid-global)" opacity="0.6" pointer-events="none"/>`;
  }

  for (const room of plan.rooms) {
    const pts = ptsAttr(room.points);
    fills += `<polygon points="${pts}" fill="${room.color}" ${translucent ? 'fill-opacity="0.35"' : ''} ${interactive ? `data-kind="room" data-id="${room.id}"` : ''}/>`;
    if (set.showGrid) {
      const [ox, oy] = roomGridOrigin(room);
      defs += gridPattern(`grid-${room.id}`, ox, oy, g, px, scale);
      fills += `<polygon points="${pts}" fill="url(#grid-${room.id})" pointer-events="none"/>`;
    }
    walls += `<polygon points="${pts}" fill="none" stroke="${COLORS.wall}" stroke-width="${wt}" stroke-linejoin="miter" pointer-events="none"/>`;

    const c = labelPoint(room.points);
    const area = polygonArea(room.points);
    labels += `<text x="${n(c[0])}" y="${n(c[1] - 4)}" text-anchor="middle" font-size="22" font-weight="600" fill="${COLORS.text}" ${halo} pointer-events="none">${esc(room.name)}</text>`;
    labels += `<text x="${n(c[0])}" y="${n(c[1] + 18)}" text-anchor="middle" font-size="16" fill="${COLORS.dim}" ${halo} pointer-events="none">${formatArea(area)}</text>`;
    if (set.showDimensions || (sel && sel.kind === 'room' && sel.id === room.id)) {
      labels += `<g pointer-events="none">${roomDimensions(room, wt, 14, plan.rooms)}</g>`;
    }
  }

  for (const o of plan.openings) {
    const room = plan.rooms.find((r) => r.id === o.roomId);
    if (!room) continue;
    openings += renderOpening(room, o, wt, px, 'pointer-events="none"');
    if (interactive) {
      const { p1, p2 } = openingGeom(room, o);
      const selected = sel && sel.kind === 'opening' && sel.id === o.id;
      openings += `<line data-kind="opening" data-id="${o.id}" x1="${n(p1[0])}" y1="${n(p1[1])}" x2="${n(p2[0])}" y2="${n(p2[1])}" stroke="${selected ? COLORS.select : 'transparent'}" stroke-opacity="${selected ? 0.45 : 0}" stroke-width="${n(wt + 12 * px)}" pointer-events="stroke" style="cursor:move"/>`;
    }
  }

  for (const f of plan.furniture) {
    furniture += `<g transform="translate(${n(f.x)} ${n(f.y)}) rotate(${n(f.rotation)})" ${interactive ? `data-kind="furniture" data-id="${f.id}" style="cursor:move"` : ''}>${furnitureSymbol(f)}`
      + (interactive ? `<rect x="${n(-f.w / 2)}" y="${n(-f.h / 2)}" width="${n(f.w)}" height="${n(f.h)}" fill="transparent"/>` : '')
      + '</g>';
    furniture += furnitureLabel(f);
  }

  if (interactive) overlay += renderSelection(plan, sel, px);
  if (interactive) overlay += renderToolPreview(plan, wt, px);

  return `<defs>${defs}</defs>${fills}${walls}${openings}${labels}${furniture}${overlay}`;
}

function renderSelection(plan, sel, px) {
  if (!sel) return '';
  const S = COLORS.select;
  const hs = 6 * px;
  let s = '';
  if (sel.kind === 'room') {
    const room = plan.rooms.find((r) => r.id === sel.id);
    if (!room) return '';
    const pts = room.points;
    s += `<polygon points="${ptsAttr(pts)}" fill="none" stroke="${S}" stroke-width="${n(2 * px)}" pointer-events="none"/>`;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (dist(a, b) * (1 / px) > 40) {
        s += `<circle data-kind="edge-mid" data-index="${i}" cx="${n((a[0] + b[0]) / 2)}" cy="${n((a[1] + b[1]) / 2)}" r="${n(hs * 0.75)}" fill="#fff" stroke="${S}" stroke-width="${n(1.5 * px)}" style="cursor:copy"><title>Ziehen, um einen Eckpunkt einzufügen</title></circle>`;
      }
    }
    pts.forEach((p, i) => {
      const active = sel.vertex === i;
      s += `<circle data-kind="vertex" data-index="${i}" cx="${n(p[0])}" cy="${n(p[1])}" r="${n(hs * 1.1)}" fill="${active ? S : '#fff'}" stroke="${S}" stroke-width="${n(2 * px)}" style="cursor:grab"/>`;
    });
  } else if (sel.kind === 'furniture') {
    const f = plan.furniture.find((x) => x.id === sel.id);
    if (!f) return '';
    const hw = f.w / 2, hh = f.h / 2;
    const rh = hh + 26 * px;
    s += `<g transform="translate(${n(f.x)} ${n(f.y)}) rotate(${n(f.rotation)})">`;
    s += `<rect x="${n(-hw)}" y="${n(-hh)}" width="${n(f.w)}" height="${n(f.h)}" fill="none" stroke="${S}" stroke-width="${n(2 * px)}" stroke-dasharray="${n(6 * px)} ${n(4 * px)}" pointer-events="none"/>`;
    s += `<line x1="0" y1="${n(-hh)}" x2="0" y2="${n(-rh)}" stroke="${S}" stroke-width="${n(1.5 * px)}" pointer-events="none"/>`;
    s += `<circle data-kind="rotate" cx="0" cy="${n(-rh)}" r="${n(hs * 1.1)}" fill="#fff" stroke="${S}" stroke-width="${n(2 * px)}" style="cursor:alias"><title>Drehen</title></circle>`;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
      s += `<rect data-kind="resize" data-corner="${i}" x="${n(sx * hw - hs)}" y="${n(sy * hh - hs)}" width="${n(hs * 2)}" height="${n(hs * 2)}" fill="#fff" stroke="${S}" stroke-width="${n(2 * px)}" style="cursor:nwse-resize"/>`;
    });
    s += '</g>';
    // Maßangabe auf der dem Drehgriff gegenüberliegenden Seite
    const [ehw, ehh] = furnitureHalfExtents(f);
    const d = rotate([0, 1], f.rotation);
    const ext = Math.abs(d[0]) * ehw + Math.abs(d[1]) * ehh + 16 * px;
    s += `<text x="${n(f.x + d[0] * ext)}" y="${n(f.y + d[1] * ext + 4 * px)}" text-anchor="middle" font-size="${n(12 * px)}" fill="${S}" ${halo} pointer-events="none">${n(f.w)} × ${n(f.h)} cm</text>`;
  }
  return s;
}

function renderToolPreview(plan, wt, px) {
  const S = COLORS.select;
  let s = '';
  if (ui.tool === 'room' && ui.drawing) {
    const { points, cursor } = ui.drawing;
    const all = cursor ? [...points, cursor] : points;
    if (all.length > 1) {
      s += `<polyline points="${ptsAttr(all)}" fill="none" stroke="${S}" stroke-width="${n(2 * px)}" stroke-dasharray="${n(6 * px)} ${n(4 * px)}" pointer-events="none"/>`;
    }
    if (points.length >= 3 && cursor) {
      s += `<polygon points="${ptsAttr(all)}" fill="${S}" fill-opacity="0.08" pointer-events="none"/>`;
    }
    points.forEach((p, i) => {
      const closing = i === 0 && points.length >= 3 && cursor && dist(cursor, p) < 0.5;
      s += `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n((closing ? 9 : 4.5) * px)}" fill="${closing ? S : '#fff'}" stroke="${S}" stroke-width="${n(2 * px)}" pointer-events="none"/>`;
    });
    if (cursor) {
      s += `<circle cx="${n(cursor[0])}" cy="${n(cursor[1])}" r="${n(3.5 * px)}" fill="${S}" pointer-events="none"/>`;
      const last = points[points.length - 1];
      if (last && dist(last, cursor) > 1) {
        const L = dist(last, cursor);
        s += `<text x="${n(cursor[0] + 12 * px)}" y="${n(cursor[1] - 12 * px)}" font-size="${n(13 * px)}" fill="${S}" font-weight="600" ${halo} pointer-events="none">${formatLength(L)}</text>`;
      }
    }
  }
  if (ui.tool === 'calibrate' && ui.calibration) {
    const { points, cursor } = ui.calibration;
    const all = cursor && points.length < 2 ? [...points, cursor] : points;
    if (all.length === 2) {
      s += `<line x1="${n(all[0][0])}" y1="${n(all[0][1])}" x2="${n(all[1][0])}" y2="${n(all[1][1])}" stroke="#e53935" stroke-width="${n(2 * px)}" pointer-events="none"/>`;
    }
    for (const p of all) {
      s += `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(5 * px)}" fill="none" stroke="#e53935" stroke-width="${n(2 * px)}" pointer-events="none"/>`
        + `<path d="M${n(p[0] - 9 * px)} ${n(p[1])}H${n(p[0] + 9 * px)}M${n(p[0])} ${n(p[1] - 9 * px)}V${n(p[1] + 9 * px)}" stroke="#e53935" stroke-width="${n(px)}" pointer-events="none"/>`;
    }
  }
  if ((ui.tool === 'door' || ui.tool === 'window') && ui.openingPreview) {
    const room = plan.rooms.find((r) => r.id === ui.openingPreview.roomId);
    if (room) s += renderOpening(room, ui.openingPreview, wt, px, 'opacity="0.55" pointer-events="none"');
  }
  return s;
}

// Foto-Vorlage in einer eigenen, dauerhaften Ebene: das (große) Bild wird nur bei Änderungen neu gesetzt.
let bgKey = '';
export function renderBackground(layer, planLayer, plan) {
  const b = plan.background;
  const img = b && getImage(b.imageId);
  const active = !!(img && b.visible);
  // Entsperrte Vorlage: Ziehen verschiebt das Foto, der Plan ist so lange nicht anklickbar.
  planLayer.style.pointerEvents = active && !b.locked ? 'none' : '';
  const key = active ? `${b.imageId}|${b.x}|${b.y}|${b.cmPerPx}|${b.opacity}|${b.locked}` : '';
  if (key === bgKey) return;
  bgKey = key;
  if (!active) {
    layer.replaceChildren();
    return;
  }
  let el = layer.firstElementChild;
  if (!el) {
    el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    el.setAttribute('preserveAspectRatio', 'none');
    layer.append(el);
  }
  if (el.getAttribute('href') !== img.dataUrl) el.setAttribute('href', img.dataUrl);
  el.setAttribute('x', b.x);
  el.setAttribute('y', b.y);
  el.setAttribute('width', img.width * b.cmPerPx);
  el.setAttribute('height', img.height * b.cmPerPx);
  el.setAttribute('opacity', b.opacity);
  if (b.locked) {
    el.setAttribute('pointer-events', 'none');
    el.removeAttribute('data-kind');
    el.style.cursor = '';
  } else {
    el.setAttribute('pointer-events', 'all');
    el.dataset.kind = 'background';
    el.style.cursor = 'move';
  }
}

export function backgroundBounds(plan) {
  const b = plan.background;
  const img = b && getImage(b.imageId);
  if (!img) return null;
  return { minX: b.x, minY: b.y, maxX: b.x + img.width * b.cmPerPx, maxY: b.y + img.height * b.cmPerPx };
}
