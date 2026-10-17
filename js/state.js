// Zentrales Datenmodell, UI-Zustand und Undo/Redo.
import { hasImage } from './background.js';

export const PLAN_VERSION = 1;
export const GRID_SIZES = [10, 20, 25, 50, 100];
export const ROOM_COLORS = ['#e3edf7', '#f6ead9', '#e5f2e3', '#efe5f5', '#f7e4e4', '#dff1f0', '#fbf3d6'];
const MAX_HISTORY = 100;

export function createEmptyPlan(name = 'Meine Wohnung') {
  return {
    version: PLAN_VERSION,
    name,
    settings: { gridSize: 25, showGrid: true, snap: true, showDimensions: true, wallThickness: 10 },
    rooms: [],
    openings: [],
    furniture: [],
    customFurniture: [],
    background: null, // Foto-Vorlage: { imageId, x, y, cmPerPx, opacity, visible, locked }
  };
}

export function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const str = (v, d = '') => (typeof v === 'string' ? v : d);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const safeId = (v, prefix) => (typeof v === 'string' && /^[\w-]+$/.test(v) ? v : uid(prefix));
const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);

function normalizeBackground(b) {
  if (!b || typeof b !== 'object' || !hasImage(b.imageId)) return null;
  return {
    imageId: b.imageId,
    x: num(b.x, 0),
    y: num(b.y, 0),
    cmPerPx: Math.min(1000, Math.max(0.001, num(b.cmPerPx, 1))),
    opacity: Math.min(1, Math.max(0.05, num(b.opacity, 0.6))),
    visible: b.visible !== false,
    locked: b.locked !== false,
  };
}

// Prüft und vervollständigt einen geladenen Plan (z. B. aus einer JSON-Datei).
export function normalizePlan(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Keine gültige Plandatei.');
  if (!Array.isArray(data.rooms) && !Array.isArray(data.furniture)) throw new Error('Die Datei enthält keinen Wohnungsplan.');
  if (typeof data.version === 'number' && data.version > PLAN_VERSION) {
    throw new Error('Die Datei stammt aus einer neueren Version des Wohnplaners.');
  }
  const base = createEmptyPlan();
  const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const plan = {
    version: PLAN_VERSION,
    name: str(data.name).trim() || base.name,
    settings: {
      gridSize: GRID_SIZES.includes(num(s.gridSize)) ? num(s.gridSize) : base.settings.gridSize,
      showGrid: typeof s.showGrid === 'boolean' ? s.showGrid : true,
      snap: typeof s.snap === 'boolean' ? s.snap : true,
      showDimensions: typeof s.showDimensions === 'boolean' ? s.showDimensions : true,
      wallThickness: Math.min(60, Math.max(1, num(s.wallThickness, 10))),
    },
    rooms: arr(data.rooms)
      .filter((r) => Array.isArray(r.points) && r.points.length >= 3)
      .map((r, i) => ({
        id: safeId(r.id, 'r'),
        name: str(r.name) || `Raum ${i + 1}`,
        color: color(r.color, ROOM_COLORS[i % ROOM_COLORS.length]),
        points: r.points.map((p) => [num(p?.[0], 0), num(p?.[1], 0)]),
      })),
    openings: [],
    furniture: arr(data.furniture).map((f) => ({
      id: safeId(f.id, 'f'),
      type: str(f.type, 'custom'),
      name: str(f.name) || 'Möbel',
      x: num(f.x, 0),
      y: num(f.y, 0),
      w: Math.max(1, num(f.w, 50)),
      h: Math.max(1, num(f.h, 50)),
      rotation: num(f.rotation, 0),
      color: color(f.color, '#b0bec5'),
    })),
    customFurniture: arr(data.customFurniture).map((c) => ({
      type: safeId(c.type, 'custom-'),
      name: str(c.name) || 'Eigenes Möbel',
      w: Math.max(1, num(c.w, 50)),
      h: Math.max(1, num(c.h, 50)),
      color: color(c.color, '#bcaaa4'),
    })),
    background: normalizeBackground(data.background),
  };
  const roomIds = new Set(plan.rooms.map((r) => r.id));
  plan.openings = arr(data.openings)
    .filter((o) => roomIds.has(o.roomId))
    .map((o) => {
      const room = plan.rooms.find((r) => r.id === o.roomId);
      return {
        id: safeId(o.id, 'o'),
        type: ['door', 'sliding', 'passage', 'window'].includes(o.type) ? o.type : 'door',
        roomId: o.roomId,
        wall: Math.min(room.points.length - 1, Math.max(0, Math.floor(num(o.wall, 0)))),
        t: Math.min(1, Math.max(0, num(o.t, 0.5))),
        width: Math.max(10, num(o.width, 90)),
        swing: o.swing === 'right' ? 'right' : 'left',
        flip: !!o.flip,
      };
    });
  return plan;
}

// ---- UI-Zustand (wird nicht gespeichert) ----
export const ui = {
  tool: 'select', // select | room | door | sliding | passage | window | calibrate
  selection: null, // { kind: 'room'|'furniture'|'opening', id, vertex }
  drawing: null, // { points: [], cursor }
  openingPreview: null,
  calibration: null, // { points: [], cursor }
  currentId: null, // ID in der Plan-Bibliothek
  savedSnapshot: null,
};

// ---- Store ----
let plan = createEmptyPlan();
let undoStack = [];
let redoStack = [];
const listeners = new Set();

export const getPlan = () => plan;
export const snapshot = () => JSON.stringify(plan);
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export const isDirty = () => snapshot() !== ui.savedSnapshot;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function changed() {
  for (const fn of listeners) fn();
}

export function replacePlan(next, { savedSnapshot = null } = {}) {
  plan = next;
  undoStack = [];
  redoStack = [];
  ui.selection = null;
  ui.drawing = null;
  ui.savedSnapshot = savedSnapshot ?? snapshot();
  changed();
}

export function markSaved() {
  ui.savedSnapshot = snapshot();
  changed();
}

// Legt einen früheren Zustand auf den Undo-Stapel, sofern sich etwas geändert hat.
export function pushUndo(prev) {
  if (prev === snapshot()) return false;
  undoStack.push(prev);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  return true;
}

export function mutate(fn) {
  const prev = snapshot();
  fn(plan);
  pushUndo(prev);
  changed();
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  plan = JSON.parse(undoStack.pop());
  changed();
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  plan = JSON.parse(redoStack.pop());
  changed();
}

export const findRoom = (id) => plan.rooms.find((r) => r.id === id);
export const findFurniture = (id) => plan.furniture.find((f) => f.id === id);
export const findOpening = (id) => plan.openings.find((o) => o.id === id);

export function selectedItem() {
  const s = ui.selection;
  if (!s) return null;
  if (s.kind === 'room') return findRoom(s.id);
  if (s.kind === 'furniture') return findFurniture(s.id);
  if (s.kind === 'opening') return findOpening(s.id);
  return null;
}

export function select(kind, id, vertex = null) {
  ui.selection = kind ? { kind, id, vertex } : null;
}
