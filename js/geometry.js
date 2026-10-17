// Geometrie-Hilfsfunktionen. Alle Koordinaten in Zentimetern, Punkte als [x, y].

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const round1 = (v) => Math.round(v * 10) / 10;

export const roundPoint = (p) => [round1(p[0]), round1(p[1])];

// Vorzeichenbehaftete Fläche (Shoelace). Positiv = im Bildschirm im Uhrzeigersinn.
export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonPerimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export function polygonCentroid(pts) {
  const a = polygonArea(pts);
  if (Math.abs(a) < 1e-6) {
    const sx = pts.reduce((s, p) => s + p[0], 0);
    const sy = pts.reduce((s, p) => s + p[1], 0);
    return [sx / pts.length, sy / pts.length];
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Projektion eines Punktes auf eine Strecke a-b.
export function projectToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const point = [a[0] + t * dx, a[1] + t * dy];
  return { t, point, d: dist(p, point) };
}

export function bounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function rotate([x, y], deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

// Eckpunkte eines Möbelstücks (x/y = Mittelpunkt) in Weltkoordinaten.
export function furnitureCorners(f) {
  return [
    [-f.w / 2, -f.h / 2],
    [f.w / 2, -f.h / 2],
    [f.w / 2, f.h / 2],
    [-f.w / 2, f.h / 2],
  ].map((p) => {
    const [rx, ry] = rotate(p, f.rotation);
    return [f.x + rx, f.y + ry];
  });
}

// Halbe Ausdehnung der achsenparallelen Hülle eines gedrehten Möbelstücks.
export function furnitureHalfExtents(f) {
  const r = (f.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return [(f.w * c + f.h * s) / 2, (f.w * s + f.h * c) / 2];
}

export function nearestGridLine(v, origin, g) {
  return origin + Math.round((v - origin) / g) * g;
}

export const normalizeAngle = (a) => ((a % 360) + 360) % 360;

// Gesamthülle eines Plans (Räume + Möbel) oder null, wenn leer.
export function planBounds(plan) {
  const pts = [];
  for (const r of plan.rooms) pts.push(...r.points);
  for (const f of plan.furniture) pts.push(...furnitureCorners(f));
  if (!pts.length) return null;
  return bounds(pts);
}

// Gut sichtbarer Punkt im Inneren eines Polygons (Näherung an den Punkt mit größtem Wandabstand).
export function labelPoint(pts) {
  const c = polygonCentroid(pts);
  const clearance = (p) => {
    let m = Infinity;
    for (let i = 0; i < pts.length; i++) m = Math.min(m, projectToSegment(p, pts[i], pts[(i + 1) % pts.length]).d);
    return m;
  };
  let best = null;
  let bestD = -1;
  const b = bounds(pts);
  const N = 16;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const p = [b.minX + ((b.maxX - b.minX) * i) / N, b.minY + ((b.maxY - b.minY) * j) / N];
      if (!pointInPolygon(p, pts)) continue;
      const d = clearance(p);
      if (d > bestD) { best = p; bestD = d; }
    }
  }
  // Schwerpunkt bevorzugen, solange er genug Abstand zu den Wänden hat
  if (pointInPolygon(c, pts) && clearance(c) >= bestD * 0.6) return c;
  return best || c;
}
