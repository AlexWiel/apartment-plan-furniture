// Werkzeuge und Zeiger-Interaktion auf der Zeichenfläche.
import {
  getPlan, ui, mutate, pushUndo, snapshot, changed, uid, findRoom, findFurniture, findOpening, select, ROOM_COLORS,
} from './state.js';
import {
  dist, roundPoint, round1, polygonArea, projectToSegment, rotate, furnitureHalfExtents, nearestGridLine,
  normalizeAngle, pointInPolygon,
} from './geometry.js';
import { roomGridOrigin, openingGeom, OPENING_TYPES, OPENING_WIDTHS } from './render.js';
import { findTemplate } from './furniture.js';

let svg;
let view;
const pointers = new Map();
let pinch = null;
let drag = null;
let spaceDown = false;
let onCalibrated = () => {};

// Wird aufgerufen, sobald beim Maßstab-Festlegen zwei Punkte gesetzt sind.
export function setCalibrationHandler(fn) {
  onCalibrated = fn;
}

const snapOn = (e) => getPlan().settings.snap && !(e && e.altKey);

export function initTools(svgEl, v) {
  svg = svgEl;
  view = v;
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', () => {
    if (drag) return;
    if (ui.drawing) ui.drawing.cursor = null;
    if (ui.calibration) ui.calibration.cursor = null;
    ui.openingPreview = null;
    changed();
  });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    view.zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.0015));
  }, { passive: false });
}

export function setSpace(down) {
  spaceDown = down;
  svg.classList.toggle('panning', down);
}

export function setTool(tool) {
  if (ui.tool === tool) return;
  ui.tool = tool;
  ui.drawing = tool === 'room' ? { points: [], cursor: null } : null;
  ui.calibration = tool === 'calibrate' ? { points: [], cursor: null } : null;
  ui.openingPreview = null;
  if (tool !== 'select') select(null);
  svg.dataset.tool = tool;
  changed();
}

// ---------- Fangen (Snapping) ----------

function roomForPoint(p) {
  const rooms = getPlan().rooms;
  for (let i = rooms.length - 1; i >= 0; i--) if (pointInPolygon(p, rooms[i].points)) return rooms[i];
  return null;
}

// Punkt für Raumecken: Shift = 45°-Winkel, sonst Fang an bestehenden Ecken und am Raster.
function snapRoomPoint(world, e, prev, exclude) {
  const plan = getPlan();
  const g = plan.settings.gridSize;
  if (e.shiftKey && prev) {
    const step = Math.PI / 4;
    const ang = Math.round(Math.atan2(world[1] - prev[1], world[0] - prev[0]) / step) * step;
    let len = dist(world, prev);
    if (snapOn(e)) len = Math.round(len / g) * g;
    return roundPoint([prev[0] + Math.cos(ang) * len, prev[1] + Math.sin(ang) * len]);
  }
  if (!snapOn(e)) return roundPoint(world);
  const thr = 10 / view.scale;
  let best = null;
  let bd = thr;
  const consider = (q) => {
    const d = dist(world, q);
    if (d < bd) { bd = d; best = q; }
  };
  for (const room of plan.rooms) {
    room.points.forEach((q, i) => {
      if (!(exclude && exclude.room === room && exclude.index === i)) consider(q);
    });
  }
  if (ui.drawing) ui.drawing.points.forEach(consider);
  if (best) return [best[0], best[1]];
  return [Math.round(world[0] / g) * g, Math.round(world[1] / g) * g];
}

// Leicht magnetisches Fangen eines Möbelstücks an Wänden und am Raster des Raumes.
export function snapFurniture(f, cx, cy) {
  const plan = getPlan();
  const g = plan.settings.gridSize;
  const wt = plan.settings.wallThickness;
  const [hw, hh] = furnitureHalfExtents(f);
  const gridThr = Math.min(8 / view.scale, g * 0.34);
  const wallThr = 14 / view.scale;
  const room = roomForPoint([cx, cy]);
  const [ox, oy] = room ? roomGridOrigin(room) : [0, 0];

  const axis = (c, h, origin, otherC, otherH, vertical) => {
    const lo = c - h;
    const hi = c + h;
    let best = null;
    // Wände (nur achsenparallele Kanten)
    for (const r of plan.rooms) {
      const pts = r.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const k = vertical ? 0 : 1; // Koordinate, die konstant sein muss
        const o = 1 - k;
        if (Math.abs(a[k] - b[k]) > 0.5) continue;
        const min = Math.min(a[o], b[o]);
        const max = Math.max(a[o], b[o]);
        if (otherC + otherH < min || otherC - otherH > max) continue;
        for (const face of [a[k] - wt / 2, a[k] + wt / 2]) {
          for (const edge of [lo, hi]) {
            const d = face - edge;
            if (Math.abs(d) < wallThr && (!best || Math.abs(d) < Math.abs(best))) best = d;
          }
        }
      }
    }
    if (best !== null) return c + best;
    // Raster
    let gbest = null;
    for (const edge of [lo, hi]) {
      const d = nearestGridLine(edge, origin, g) - edge;
      if (Math.abs(d) < gridThr && (gbest === null || Math.abs(d) < Math.abs(gbest))) gbest = d;
    }
    return gbest !== null ? c + gbest : c;
  };

  return [round1(axis(cx, hw, ox, cy, hh, true)), round1(axis(cy, hh, oy, cx, hw, false))];
}

function nearestEdge(world, rooms) {
  let best = null;
  for (const room of rooms) {
    const pts = room.points;
    for (let i = 0; i < pts.length; i++) {
      const pr = projectToSegment(world, pts[i], pts[(i + 1) % pts.length]);
      if (!best || pr.d < best.d) best = { room, wall: i, t: pr.t, d: pr.d };
    }
  }
  return best;
}

function clampOpeningT(room, wall, t, width, snap) {
  const a = room.points[wall];
  const b = room.points[(wall + 1) % room.points.length];
  const L = dist(a, b);
  let pos = t * L;
  if (snap) pos = Math.round(pos / 5) * 5;
  const half = Math.min(width, L) / 2;
  pos = Math.min(Math.max(pos, half), L - half);
  return L ? pos / L : 0.5;
}

// Ordnet Türen/Fenster nach dem Einfügen/Löschen von Ecken der nächsten Wand neu zu.
function reprojectOpenings(plan, room, oldPts) {
  for (const o of plan.openings) {
    if (o.roomId !== room.id) continue;
    const { P } = openingGeom({ points: oldPts }, o);
    const best = nearestEdge(P, [room]);
    o.wall = best.wall;
    o.t = clampOpeningT(room, best.wall, best.t, o.width, false);
  }
}

// ---------- Zeiger-Ereignisse ----------

function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {
    finishDrag();
    const [a, b] = [...pointers.values()];
    pinch = { d: dist(a, b), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    return;
  }
  if (pointers.size > 2) return;
  const world = view.screenToWorld(e.clientX, e.clientY);
  if (e.button === 1 || spaceDown) {
    drag = { type: 'pan', last: [e.clientX, e.clientY] };
    return;
  }
  if (ui.tool === 'room') return roomDown(e, world);
  if (ui.tool === 'calibrate') return calibrateDown(world);
  if (OPENING_TYPES.includes(ui.tool)) return openingDown(e, world);
  selectDown(e, world, e.target.closest('[data-kind]'));
}

function selectDown(e, world, target) {
  const plan = getPlan();
  const kind = target?.dataset.kind;
  const id = target?.dataset.id;
  const base = { start: [e.clientX, e.clientY], startWorld: world, snap: snapshot(), moved: false };
  const sel = ui.selection;

  if (kind === 'vertex' && sel?.kind === 'room') {
    const room = findRoom(sel.id);
    const index = +target.dataset.index;
    sel.vertex = index;
    drag = { ...base, type: 'vertex', room, index };
  } else if (kind === 'edge-mid' && sel?.kind === 'room') {
    const room = findRoom(sel.id);
    const i = +target.dataset.index;
    const a = room.points[i];
    const b = room.points[(i + 1) % room.points.length];
    const old = room.points.map((p) => [...p]);
    room.points.splice(i + 1, 0, roundPoint([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
    reprojectOpenings(plan, room, old);
    sel.vertex = i + 1;
    drag = { ...base, type: 'vertex', room, index: i + 1, moved: true };
  } else if (kind === 'rotate' && sel?.kind === 'furniture') {
    drag = { ...base, type: 'rotate', f: findFurniture(sel.id) };
  } else if (kind === 'resize' && sel?.kind === 'furniture') {
    const f = findFurniture(sel.id);
    const [sx, sy] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][+target.dataset.corner];
    const [ox, oy] = rotate([(-sx * f.w) / 2, (-sy * f.h) / 2], f.rotation);
    drag = { ...base, type: 'resize', f, sx, sy, opp: [f.x + ox, f.y + oy] };
  } else if (kind === 'furniture') {
    const f = findFurniture(id);
    select('furniture', id);
    drag = { ...base, type: 'furniture', f, origin: [f.x, f.y] };
  } else if (kind === 'opening') {
    select('opening', id);
    drag = { ...base, type: 'opening', o: findOpening(id) };
  } else if (kind === 'background' && plan.background) {
    select(null);
    drag = { ...base, type: 'background', origin: [plan.background.x, plan.background.y] };
  } else if (kind === 'room') {
    const room = findRoom(id);
    select('room', id);
    drag = { ...base, type: 'room', room, origin: room.points.map((p) => [...p]) };
  } else {
    select(null);
    drag = { type: 'pan', last: [e.clientX, e.clientY] };
  }
  changed();
}

function roomDown(e, world) {
  if (!ui.drawing) ui.drawing = { points: [], cursor: null };
  const pts = ui.drawing.points;
  const last = pts[pts.length - 1];
  const p = snapRoomPoint(world, e, last);
  if (pts.length >= 3 && dist(p, pts[0]) * view.scale < 12) return finishRoom();
  if (last && dist(p, last) < 1) {
    if (pts.length >= 3) finishRoom();
    return;
  }
  pts.push(p);
  ui.drawing.cursor = p;
  changed();
}

function calibrateDown(world) {
  if (!ui.calibration) ui.calibration = { points: [], cursor: null };
  const pts = ui.calibration.points;
  if (pts.length >= 2) pts.length = 0;
  pts.push(roundPoint(world));
  changed();
  if (pts.length === 2 && dist(pts[0], pts[1]) > 0.5) onCalibrated(pts[0], pts[1]);
  else if (pts.length === 2) pts.pop();
}

function openingDown(e, world) {
  updateOpeningPreview(world);
  const prev = ui.openingPreview;
  if (!prev) return;
  const o = { id: uid('o'), ...prev };
  mutate((plan) => plan.openings.push(o));
  select('opening', o.id);
  changed();
}

function updateOpeningPreview(world) {
  const plan = getPlan();
  const best = nearestEdge(world, plan.rooms);
  if (!best || best.d * view.scale > 30) {
    ui.openingPreview = null;
    return;
  }
  const width = OPENING_WIDTHS[ui.tool];
  ui.openingPreview = {
    type: ui.tool,
    roomId: best.room.id,
    wall: best.wall,
    t: clampOpeningT(best.room, best.wall, best.t, width, getPlan().settings.snap),
    width,
    swing: 'left',
    flip: false,
  };
}

function onMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch) {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const d = dist(a, b);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    view.panBy(m[0] - pinch.m[0], m[1] - pinch.m[1]);
    view.zoomAt(m[0], m[1], d / (pinch.d || d));
    pinch = { d, m };
    return;
  }
  const world = view.screenToWorld(e.clientX, e.clientY);

  if (!drag) {
    if (ui.tool === 'room' && ui.drawing) {
      ui.drawing.cursor = snapRoomPoint(world, e, ui.drawing.points[ui.drawing.points.length - 1]);
      changed();
    } else if (OPENING_TYPES.includes(ui.tool)) {
      updateOpeningPreview(world);
      changed();
    } else if (ui.tool === 'calibrate' && ui.calibration) {
      ui.calibration.cursor = roundPoint(world);
      changed();
    }
    return;
  }

  if (drag.type === 'pan') {
    view.panBy(e.clientX - drag.last[0], e.clientY - drag.last[1]);
    drag.last = [e.clientX, e.clientY];
    return;
  }
  if (!drag.moved) {
    if (dist([e.clientX, e.clientY], drag.start) < 3) return;
    drag.moved = true;
  }
  const plan = getPlan();
  const g = plan.settings.gridSize;
  const dx = world[0] - drag.startWorld[0];
  const dy = world[1] - drag.startWorld[1];

  switch (drag.type) {
    case 'vertex':
      drag.room.points[drag.index] = snapRoomPoint(world, e, null, { room: drag.room, index: drag.index });
      break;
    case 'background':
      plan.background.x = round1(drag.origin[0] + dx);
      plan.background.y = round1(drag.origin[1] + dy);
      break;
    case 'room': {
      let ddx = dx, ddy = dy;
      if (snapOn(e)) {
        ddx = Math.round(dx / g) * g;
        ddy = Math.round(dy / g) * g;
      }
      drag.room.points = drag.origin.map((p) => roundPoint([p[0] + ddx, p[1] + ddy]));
      break;
    }
    case 'furniture': {
      let x = drag.origin[0] + dx;
      let y = drag.origin[1] + dy;
      if (snapOn(e)) [x, y] = snapFurniture(drag.f, x, y);
      drag.f.x = round1(x);
      drag.f.y = round1(y);
      break;
    }
    case 'rotate': {
      const f = drag.f;
      const a = (Math.atan2(world[1] - f.y, world[0] - f.x) * 180) / Math.PI + 90;
      f.rotation = normalizeAngle(snapOn(e) ? Math.round(a / 15) * 15 : Math.round(a));
      break;
    }
    case 'resize': {
      const { f, sx, sy, opp } = drag;
      const local = rotate([world[0] - opp[0], world[1] - opp[1]], -f.rotation);
      let w = Math.max(5, local[0] * sx);
      let h = Math.max(5, local[1] * sy);
      if (snapOn(e)) {
        w = Math.max(5, Math.round(w / 5) * 5);
        h = Math.max(5, Math.round(h / 5) * 5);
      }
      const [cx, cy] = rotate([(sx * w) / 2, (sy * h) / 2], f.rotation);
      f.w = round1(w);
      f.h = round1(h);
      f.x = round1(opp[0] + cx);
      f.y = round1(opp[1] + cy);
      break;
    }
    case 'opening': {
      const o = drag.o;
      const room = findRoom(o.roomId);
      if (!room) break;
      const best = nearestEdge(world, [room]);
      o.wall = best.wall;
      o.t = clampOpeningT(room, best.wall, best.t, o.width, snapOn(e));
      break;
    }
  }
  changed();
}

function onUp(e) {
  pointers.delete(e.pointerId);
  if (pinch) {
    if (pointers.size < 2) pinch = null;
    drag = null;
    return;
  }
  finishDrag();
}

function finishDrag() {
  if (drag && drag.snap && drag.moved) {
    pushUndo(drag.snap);
    changed();
  }
  drag = null;
}

// ---------- Aktionen ----------

export function finishRoom() {
  const d = ui.drawing;
  if (!d) return;
  const pts = d.points;
  if (pts.length >= 3 && Math.abs(polygonArea(pts)) > 100) {
    const id = uid('r');
    mutate((plan) => {
      plan.rooms.push({
        id,
        name: `Raum ${plan.rooms.length + 1}`,
        color: ROOM_COLORS[plan.rooms.length % ROOM_COLORS.length],
        points: pts.map((p) => [...p]),
      });
    });
    select('room', id);
  }
  ui.drawing = { points: [], cursor: d.cursor };
  changed();
}

export function cancelDrawing() {
  if (ui.drawing && ui.drawing.points.length) {
    ui.drawing.points = [];
    changed();
    return true;
  }
  return false;
}

export function removeLastPoint() {
  if (ui.drawing && ui.drawing.points.length) {
    ui.drawing.points.pop();
    changed();
    return true;
  }
  return false;
}

export function addFurniture(type, at) {
  const plan = getPlan();
  const t = findTemplate(type, plan);
  if (!t) return;
  const f = { id: uid('f'), type, name: t.name, x: at[0], y: at[1], w: t.w, h: t.h, rotation: 0, color: t.color };
  if (plan.settings.snap) [f.x, f.y] = snapFurniture(f, f.x, f.y);
  f.x = round1(f.x);
  f.y = round1(f.y);
  mutate((p) => p.furniture.push(f));
  ui.tool = 'select';
  ui.drawing = null;
  svg.dataset.tool = 'select';
  select('furniture', f.id);
  changed();
}

export function deleteSelection() {
  const sel = ui.selection;
  if (!sel) return;
  if (sel.kind === 'room' && sel.vertex != null) {
    mutate((plan) => {
      const room = plan.rooms.find((r) => r.id === sel.id);
      if (room && room.points.length > 3) {
        const old = room.points.map((p) => [...p]);
        room.points.splice(sel.vertex, 1);
        reprojectOpenings(plan, room, old);
      }
      sel.vertex = null;
    });
    return;
  }
  mutate((plan) => {
    if (sel.kind === 'room') {
      plan.rooms = plan.rooms.filter((r) => r.id !== sel.id);
      plan.openings = plan.openings.filter((o) => o.roomId !== sel.id);
    } else if (sel.kind === 'furniture') {
      plan.furniture = plan.furniture.filter((f) => f.id !== sel.id);
    } else if (sel.kind === 'opening') {
      plan.openings = plan.openings.filter((o) => o.id !== sel.id);
    }
  });
  select(null);
  changed();
}

export function duplicateSelection() {
  const sel = ui.selection;
  if (!sel || sel.kind !== 'furniture') return;
  const f = findFurniture(sel.id);
  if (!f) return;
  const off = getPlan().settings.gridSize;
  const copy = { ...f, id: uid('f'), x: f.x + off, y: f.y + off };
  mutate((plan) => plan.furniture.push(copy));
  select('furniture', copy.id);
  changed();
}

export function rotateSelection(deg = 90) {
  const sel = ui.selection;
  if (!sel || sel.kind !== 'furniture') return;
  mutate(() => {
    const f = findFurniture(sel.id);
    if (f) f.rotation = normalizeAngle(f.rotation + deg);
  });
}

export function nudgeSelection(dx, dy) {
  const sel = ui.selection;
  if (!sel) return;
  mutate(() => {
    if (sel.kind === 'furniture') {
      const f = findFurniture(sel.id);
      if (f) { f.x = round1(f.x + dx); f.y = round1(f.y + dy); }
    } else if (sel.kind === 'room') {
      const r = findRoom(sel.id);
      if (!r) return;
      if (sel.vertex != null) {
        const p = r.points[sel.vertex];
        r.points[sel.vertex] = roundPoint([p[0] + dx, p[1] + dy]);
      } else {
        r.points = r.points.map((p) => roundPoint([p[0] + dx, p[1] + dy]));
      }
    }
  });
}
