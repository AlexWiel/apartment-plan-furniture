// Einstiegspunkt: verbindet Store, Ansicht, Werkzeuge, Oberfläche und Speicherung.
import {
  getPlan, ui, subscribe, changed, undo, redo, canUndo, canRedo, isDirty, replacePlan, markSaved, snapshot,
  createEmptyPlan, selectedItem, select,
} from './state.js';
import { createView } from './view.js';
import { renderPlan } from './render.js';
import { planBounds } from './geometry.js';
import * as tools from './tools.js';
import { initUI, renderPalette, renderPanel, toast } from './ui.js';
import * as storage from './storage.js';
import { examplePlan } from './example.js';

const $ = (sel) => document.querySelector(sel);
const svg = $('#canvas');
const world = $('#world');

let raf = 0;
const requestRender = () => {
  if (!raf) raf = requestAnimationFrame(draw);
};
const view = createView(svg, world, requestRender);

function draw() {
  raf = 0;
  world.innerHTML = renderPlan(getPlan(), { scale: view.scale, viewBounds: view.viewBounds() });
  $('#zoom-level').textContent = `${Math.round(view.scale * 100)} %`;
}

// ---------- Toolbar-Zustand ----------
const HINTS = {
  select: '',
  room: 'Klicke Eckpunkte – Klick auf den ersten Punkt, Doppelklick oder Enter schließt den Raum · Shift: 45° · Esc: abbrechen',
  door: 'Klicke auf eine Wand, um eine Tür zu setzen · Esc: fertig',
  window: 'Klicke auf eine Wand, um ein Fenster zu setzen · Esc: fertig',
};

function syncToolbar() {
  const plan = getPlan();
  const s = plan.settings;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === ui.tool);
  $('#btn-grid').setAttribute('aria-pressed', s.showGrid);
  $('#btn-snap').setAttribute('aria-pressed', s.snap);
  $('#btn-dims').setAttribute('aria-pressed', s.showDimensions);
  $('#grid-size').value = String(s.gridSize);
  $('#btn-undo').disabled = !canUndo();
  $('#btn-redo').disabled = !canRedo();
  const dirty = isDirty();
  $('#plan-title').textContent = `— ${plan.name}${dirty ? ' •' : ''}`;
  document.title = `${dirty ? '• ' : ''}${plan.name} – Wohnplaner`;
  let hint = HINTS[ui.tool];
  if (ui.tool === 'select' && ui.selection?.kind === 'furniture') hint = 'Ziehen zum Verschieben · Kreis-Griff: drehen · Ecken: Größe · Alt: ohne Magnet';
  if (ui.tool === 'select' && ui.selection?.kind === 'room') hint = 'Ecken ziehen · Kreise auf Kanten ziehen fügt Ecken ein · Entf löscht Ecke/Raum';
  $('#hint').textContent = hint;
  $('#empty-state').hidden = !(plan.rooms.length === 0 && plan.furniture.length === 0 && ui.tool === 'select');
}

// ---------- Autosave ----------
let saveTimer;
function scheduleAutosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => storage.autosave(getPlan(), ui.currentId, ui.savedSnapshot), 400);
}

subscribe(() => {
  if (ui.selection && !selectedItem()) select(null);
  requestRender();
  renderPalette();
  renderPanel();
  syncToolbar();
  scheduleAutosave();
});

// ---------- Datei-Aktionen ----------
function confirmDiscard() {
  return !isDirty() || confirm('Ungespeicherte Änderungen gehen verloren. Fortfahren?');
}

function fitView() {
  const b = planBounds(getPlan());
  view.fit(b || { minX: 0, minY: 0, maxX: 800, maxY: 600 });
}

function loadPlan(plan, currentId = null, { saved = true } = {}) {
  tools.setTool('select');
  ui.currentId = currentId;
  replacePlan(plan, saved ? {} : { savedSnapshot: '' });
  fitView();
}

function save() {
  if (!ui.currentId) return saveAs();
  try {
    storage.saveToLibrary(ui.currentId, getPlan());
    markSaved();
    toast(`„${getPlan().name}“ gespeichert.`);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function saveAs() {
  const dlg = $('#dlg-save');
  $('#save-name').value = getPlan().name;
  dlg.returnValue = '';
  dlg.showModal();
  $('#save-name').select();
}

$('#dlg-save').addEventListener('close', () => {
  if ($('#dlg-save').returnValue !== 'ok') return;
  const name = $('#save-name').value.trim() || 'Meine Wohnung';
  getPlan().name = name;
  try {
    ui.currentId = storage.saveToLibrary(null, getPlan());
    markSaved();
    toast(`„${name}“ gespeichert.`);
  } catch (err) {
    toast(err.message, 'error');
  }
});

function openDialog() {
  const list = $('#plan-list');
  const plans = storage.listLibrary();
  const fmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  list.innerHTML = plans.length
    ? plans.map((p) => `<li>
        <div class="meta"><b>${esc(p.name)}</b><small>${p.savedAt ? fmt.format(p.savedAt) : ''} · ${p.rooms} Räume · ${p.furniture} Möbel</small></div>
        <button type="button" class="primary" data-open="${p.id}">Öffnen</button>
        <button type="button" class="danger" data-delete="${p.id}" title="Löschen">Löschen</button>
      </li>`).join('')
    : '<li class="empty">Noch keine Pläne in diesem Browser gespeichert.</li>';
  $('#dlg-open').showModal();
}

$('#plan-list').addEventListener('click', (e) => {
  const openId = e.target.closest('[data-open]')?.dataset.open;
  const delId = e.target.closest('[data-delete]')?.dataset.delete;
  if (openId) {
    if (!confirmDiscard()) return;
    try {
      loadPlan(storage.loadFromLibrary(openId), openId);
      $('#dlg-open').close();
      toast(`„${getPlan().name}“ geladen.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  } else if (delId) {
    const entry = storage.listLibrary().find((p) => p.id === delId);
    if (!confirm(`„${entry?.name}“ endgültig löschen?`)) return;
    storage.deleteFromLibrary(delId);
    if (ui.currentId === delId) ui.currentId = null;
    openDialog();
  }
});

function newPlan() {
  if (!confirmDiscard()) return;
  loadPlan(createEmptyPlan());
}

function loadExample() {
  if (!confirmDiscard()) return;
  loadPlan(examplePlan(), null, { saved: false });
  $('#dlg-open').close();
}

async function importFile(file) {
  try {
    const plan = await storage.importJSON(file);
    if (!confirmDiscard()) return;
    loadPlan(plan, null, { saved: false });
    $('#dlg-open').close();
    toast(`„${plan.name}“ importiert.`);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function exportPNG() {
  try {
    await storage.exportPNG(getPlan());
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- Ansicht-Schalter ----------
function toggleSetting(key) {
  const s = getPlan().settings;
  s[key] = !s[key];
  changed();
}

// ---------- Verdrahtung ----------
const on = (sel, ev, fn) => $(sel).addEventListener(ev, fn);
on('#btn-new', 'click', newPlan);
on('#btn-open', 'click', openDialog);
on('#btn-save', 'click', save);
on('#btn-save-as', 'click', saveAs);
on('#btn-export', 'click', () => storage.exportJSON(getPlan()));
on('#btn-import', 'click', () => $('#file-import').click());
on('#btn-open-import', 'click', () => $('#file-import').click());
on('#btn-open-example', 'click', loadExample);
on('#file-import', 'change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importFile(file);
});
on('#btn-png', 'click', exportPNG);
on('#btn-undo', 'click', undo);
on('#btn-redo', 'click', redo);
on('#btn-grid', 'click', () => toggleSetting('showGrid'));
on('#btn-snap', 'click', () => toggleSetting('snap'));
on('#btn-dims', 'click', () => toggleSetting('showDimensions'));
on('#grid-size', 'change', (e) => {
  getPlan().settings.gridSize = +e.target.value;
  changed();
});
on('#btn-zoom-in', 'click', () => view.zoomCenter(1.25));
on('#btn-zoom-out', 'click', () => view.zoomCenter(0.8));
on('#btn-fit', 'click', fitView);
on('#btn-help', 'click', () => $('#dlg-help').showModal());
on('#btn-start-room', 'click', () => tools.setTool('room'));
on('#btn-example', 'click', loadExample);
on('#btn-toggle-palette', 'click', () => {
  document.body.classList.remove('show-panel');
  document.body.classList.toggle('show-palette');
});
on('#btn-toggle-panel', 'click', () => {
  document.body.classList.remove('show-palette');
  document.body.classList.toggle('show-panel');
});
for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => tools.setTool(b.dataset.tool));

window.addEventListener('beforeunload', () => storage.autosave(getPlan(), ui.currentId, ui.savedSnapshot));
window.addEventListener('resize', requestRender);

// ---------- Tastatur ----------
window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('dialog[open]')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  if (mod) {
    if (k === 'z' && !e.shiftKey) undo();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
    else if (k === 's') save();
    else if (k === 'o') openDialog();
    else if (k === 'd') tools.duplicateSelection();
    else return;
    e.preventDefault();
    return;
  }

  const g = getPlan().settings.gridSize;
  const step = e.shiftKey ? g : 1;
  switch (e.key) {
    case ' ':
      tools.setSpace(true);
      break;
    case 'Escape':
      if (ui.tool === 'room' && tools.cancelDrawing()) break;
      if (ui.tool !== 'select') tools.setTool('select');
      else if (ui.selection) {
        select(null);
        changed();
      }
      break;
    case 'Enter':
      if (ui.tool === 'room') tools.finishRoom();
      break;
    case 'Backspace':
    case 'Delete':
      if (ui.tool === 'room' && tools.removeLastPoint()) break;
      tools.deleteSelection();
      break;
    case 'ArrowLeft': tools.nudgeSelection(-step, 0); break;
    case 'ArrowRight': tools.nudgeSelection(step, 0); break;
    case 'ArrowUp': tools.nudgeSelection(0, -step); break;
    case 'ArrowDown': tools.nudgeSelection(0, step); break;
    case '+':
    case '=': view.zoomCenter(1.25); break;
    case '-': view.zoomCenter(0.8); break;
    case '0': fitView(); break;
    case '?': $('#dlg-help').showModal(); break;
    default:
      switch (k) {
        case 'v': tools.setTool('select'); break;
        case 'w': tools.setTool('room'); break;
        case 't': tools.setTool('door'); break;
        case 'f': tools.setTool('window'); break;
        case 'g': toggleSetting('showGrid'); break;
        case 'm': toggleSetting('snap'); break;
        case 'r': tools.rotateSelection(e.shiftKey ? -90 : 90); break;
        default: return;
      }
  }
  e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') tools.setSpace(false);
});
window.addEventListener('blur', () => tools.setSpace(false));

// ---------- Start ----------
tools.initTools(svg, view);
initUI(view, svg);
const restored = storage.loadAutosave();
if (restored) {
  ui.currentId = restored.currentId;
  replacePlan(restored.plan, { savedSnapshot: restored.savedSnapshot ?? snapshot() });
} else {
  changed();
}
fitView();
