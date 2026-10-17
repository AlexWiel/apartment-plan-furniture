// Seitenleisten: Möbel-Palette und Eigenschaften-Panel, sowie kleine UI-Helfer.
import { getPlan, ui, mutate, changed, uid, selectedItem } from './state.js';
import { CATALOG, findTemplate, previewSVG } from './furniture.js';
import { bounds, polygonArea, polygonPerimeter, normalizeAngle, round1 } from './geometry.js';
import { formatArea, formatLength } from './render.js';
import * as tools from './tools.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let view;
let svg;

export function initUI(v, svgEl) {
  view = v;
  svg = svgEl;
  initPalette();
  initPanel();
  initCustomDialog();
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, type = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

// ---------- Palette ----------
let paletteKey = '';

export function renderPalette() {
  const plan = getPlan();
  const key = JSON.stringify(plan.customFurniture);
  if (key === paletteKey) return;
  paletteKey = key;
  const item = (t) => `
    <button class="pal-item" data-type="${esc(t.type)}" title="${esc(t.name)} – ${t.w} × ${t.h} cm. Klicken oder auf den Plan ziehen.">
      ${previewSVG(t)}
      <span class="pal-name">${esc(t.name)}</span>
      <span class="pal-dim">${t.w}×${t.h}</span>
      ${t.custom ? `<span class="pal-del" data-del="${esc(t.type)}" title="Eigenes Möbel entfernen" role="button">×</span>` : ''}
    </button>`;
  let html = '';
  for (const cat of CATALOG) {
    const items = cat.items.map((i) => findTemplate(i.type));
    html += `<details open><summary>${cat.name}</summary><div class="pal-grid">${items.map(item).join('')}</div></details>`;
  }
  const custom = plan.customFurniture.map((c) => ({ ...c, shape: 'rect', custom: true }));
  html += `<details open><summary>Eigene Möbel</summary><div class="pal-grid">${custom.map(item).join('')}
    <button class="pal-item pal-add" id="btn-custom-add" title="Eigenes Möbel mit beliebigen Maßen anlegen"><span class="plus">+</span><span class="pal-name">Neu…</span></button></div></details>`;
  $('#palette-list').innerHTML = html;
}

function initPalette() {
  const list = $('#palette-list');
  let pd = null;

  list.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const type = del.dataset.del;
      mutate((plan) => (plan.customFurniture = plan.customFurniture.filter((c) => c.type !== type)));
      return;
    }
    if (e.target.closest('#btn-custom-add')) openCustomDialog();
  });

  list.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn || e.target.closest('[data-del]') || e.button !== 0) return;
    pd = { type: btn.dataset.type, x: e.clientX, y: e.clientY, ghost: null, btn };
  });

  window.addEventListener('pointermove', (e) => {
    if (!pd) return;
    if (!pd.ghost && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 6) {
      pd.ghost = document.createElement('div');
      pd.ghost.className = 'drag-ghost';
      pd.ghost.innerHTML = pd.btn.querySelector('svg').outerHTML;
      document.body.appendChild(pd.ghost);
      document.body.classList.add('dragging');
    }
    if (pd.ghost) pd.ghost.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`;
  });

  const end = (e, cancelled) => {
    if (!pd) return;
    const { type, ghost } = pd;
    pd = null;
    if (ghost) {
      ghost.remove();
      document.body.classList.remove('dragging');
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!cancelled && el && svg.parentElement.contains(el)) tools.addFurniture(type, view.screenToWorld(e.clientX, e.clientY));
    } else if (!cancelled) {
      tools.addFurniture(type, view.center());
      document.body.classList.remove('show-palette');
    }
  };
  window.addEventListener('pointerup', (e) => end(e, false));
  window.addEventListener('pointercancel', (e) => end(e, true));
}

// ---------- Eigene Möbel ----------
function initCustomDialog() {
  const dlg = $('#dlg-custom');
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
    const name = $('#custom-name').value.trim() || 'Eigenes Möbel';
    const w = Math.max(1, parseFloat($('#custom-w').value) || 50);
    const h = Math.max(1, parseFloat($('#custom-h').value) || 50);
    const color = $('#custom-color').value;
    mutate((plan) => plan.customFurniture.push({ type: uid('custom-'), name, w, h, color }));
    toast(`„${name}“ wurde unter „Eigene Möbel“ angelegt.`);
  });
}

function openCustomDialog() {
  $('#custom-name').value = '';
  $('#custom-w').value = 100;
  $('#custom-h').value = 50;
  $('#dlg-custom').returnValue = '';
  $('#dlg-custom').showModal();
}

// ---------- Eigenschaften ----------
const num = (v) => (Number.isFinite(v) ? round1(v) : '');

function roomBox(room) {
  const b = bounds(room.points);
  return { b, w: b.maxX - b.minX, h: b.maxY - b.minY };
}

// Feld-Definitionen: get liefert den Anzeigewert, set schreibt ihn (innerhalb von mutate).
const FIELDS = {
  'plan.name': { get: (p) => p.name, set: (p, _, v) => (p.name = v.trim() || 'Meine Wohnung') },
  'plan.wallThickness': { get: (p) => p.settings.wallThickness, set: (p, _, v) => (p.settings.wallThickness = Math.min(60, Math.max(1, v))) },
  'plan.showDimensions': { get: (p) => p.settings.showDimensions, set: (p, _, v) => (p.settings.showDimensions = v), noUndo: true },
  'room.name': { get: (_, r) => r.name, set: (_, r, v) => (r.name = v.trim() || r.name) },
  'room.color': { get: (_, r) => r.color, set: (_, r, v) => (r.color = v) },
  'room.width': {
    get: (_, r) => num(roomBox(r).w),
    set: (_, r, v) => {
      const { b, w } = roomBox(r);
      if (v > 0 && w > 0) r.points = r.points.map(([x, y]) => [round1(b.minX + ((x - b.minX) * v) / w), y]);
    },
  },
  'room.depth': {
    get: (_, r) => num(roomBox(r).h),
    set: (_, r, v) => {
      const { b, h } = roomBox(r);
      if (v > 0 && h > 0) r.points = r.points.map(([x, y]) => [x, round1(b.minY + ((y - b.minY) * v) / h)]);
    },
  },
  'vertex.x': { get: (_, r) => num(r.points[ui.selection.vertex]?.[0]), set: (_, r, v) => (r.points[ui.selection.vertex][0] = v) },
  'vertex.y': { get: (_, r) => num(r.points[ui.selection.vertex]?.[1]), set: (_, r, v) => (r.points[ui.selection.vertex][1] = v) },
  'f.name': { get: (_, f) => f.name, set: (_, f, v) => (f.name = v.trim() || f.name) },
  'f.w': { get: (_, f) => num(f.w), set: (_, f, v) => (f.w = Math.max(1, v)) },
  'f.h': { get: (_, f) => num(f.h), set: (_, f, v) => (f.h = Math.max(1, v)) },
  'f.rotation': { get: (_, f) => num(f.rotation), set: (_, f, v) => (f.rotation = normalizeAngle(v)) },
  'f.color': { get: (_, f) => f.color, set: (_, f, v) => (f.color = v) },
  'f.x': { get: (_, f) => num(f.x), set: (_, f, v) => (f.x = v) },
  'f.y': { get: (_, f) => num(f.y), set: (_, f, v) => (f.y = v) },
  'o.type': { get: (_, o) => o.type, set: (_, o, v) => (o.type = v === 'window' ? 'window' : 'door') },
  'o.width': { get: (_, o) => num(o.width), set: (_, o, v) => (o.width = Math.max(10, v)) },
  'o.swing': { get: (_, o) => o.swing, set: (_, o, v) => (o.swing = v) },
  'o.flip': { get: (_, o) => (o.flip ? 'out' : 'in'), set: (_, o, v) => (o.flip = v === 'out') },
};

let panelKey = '';

const input = (field, label, type = 'number', attrs = '') =>
  `<label class="field"><span>${label}</span><input data-field="${field}" type="${type}" ${type === 'number' ? 'step="any"' : ''} ${attrs}></label>`;
const selectField = (field, label, options) =>
  `<label class="field"><span>${label}</span><select data-field="${field}">${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>`;
const btn = (action, label, cls = '') => `<button type="button" data-action="${action}" class="${cls}">${label}</button>`;

function buildPanel(plan, item) {
  const sel = ui.selection;
  if (!item) {
    const total = plan.rooms.reduce((s, r) => s + Math.abs(polygonArea(r.points)), 0);
    return `<h2>Plan</h2>
      ${input('plan.name', 'Name', 'text')}
      ${input('plan.wallThickness', 'Wandstärke (cm)', 'number', 'min="1" max="60"')}
      <label class="check"><input type="checkbox" data-field="plan.showDimensions"> Wandmaße aller Räume anzeigen</label>
      <dl class="stats"><dt>Räume</dt><dd>${plan.rooms.length}</dd><dt>Wohnfläche</dt><dd>${formatArea(total)}</dd><dt>Möbel</dt><dd>${plan.furniture.length}</dd></dl>
      <div class="help">
        <p><b>So geht's:</b></p>
        <ol>
          <li><b>Raum zeichnen</b> (W): Eckpunkte anklicken, mit Klick auf den ersten Punkt, Doppelklick oder Enter abschließen.</li>
          <li><b>Tür/Fenster</b> (T/F): auf eine Wand klicken.</li>
          <li><b>Möbel</b> aus der Liste links auf den Plan ziehen oder anklicken.</li>
          <li>Verschieben per Ziehen – <b>Alt</b> gedrückt halten fängt nicht am Raster.</li>
        </ol>
      </div>`;
  }
  if (sel.kind === 'room') {
    const area = Math.abs(polygonArea(item.points));
    let html = `<h2>Raum</h2>
      ${input('room.name', 'Name', 'text')}
      ${input('room.color', 'Farbe', 'color')}
      <div class="row2">${input('room.width', 'Breite (cm)', 'number', 'min="1"')}${input('room.depth', 'Tiefe (cm)', 'number', 'min="1"')}</div>
      <dl class="stats"><dt>Fläche</dt><dd>${formatArea(area)}</dd><dt>Umfang</dt><dd>${formatLength(polygonPerimeter(item.points))}</dd><dt>Ecken</dt><dd>${item.points.length}</dd></dl>`;
    if (sel.vertex != null && item.points[sel.vertex]) {
      html += `<h3>Eckpunkt ${sel.vertex + 1}</h3>
        <div class="row2">${input('vertex.x', 'X (cm)')}${input('vertex.y', 'Y (cm)')}</div>
        <div class="actions">${btn('delete', 'Eckpunkt löschen', 'danger')}</div>`;
    }
    html += `<p class="hint">Ecken ziehen zum Verformen, die kleinen Kreise auf den Kanten ziehen, um Ecken einzufügen.</p>
      <div class="actions">${btn('delete-room', 'Raum löschen', 'danger')}</div>`;
    return html;
  }
  if (sel.kind === 'furniture') {
    return `<h2>Möbel</h2>
      ${input('f.name', 'Bezeichnung', 'text')}
      <div class="row2">${input('f.w', 'Breite (cm)', 'number', 'min="1"')}${input('f.h', 'Tiefe (cm)', 'number', 'min="1"')}</div>
      <div class="row2">${input('f.rotation', 'Drehung (°)')}${input('f.color', 'Farbe', 'color')}</div>
      <div class="row2">${input('f.x', 'X (cm)')}${input('f.y', 'Y (cm)')}</div>
      <div class="actions">
        ${btn('rotate', '↻ 90° drehen')}${btn('duplicate', 'Duplizieren')}
        ${btn('front', 'Nach vorne')}${btn('back', 'Nach hinten')}
        ${btn('save-custom', 'Als eigenes Möbel merken')}
        ${btn('delete', 'Löschen', 'danger')}
      </div>`;
  }
  if (sel.kind === 'opening') {
    let html = `<h2>${item.type === 'door' ? 'Tür' : 'Fenster'}</h2>
      ${selectField('o.type', 'Art', [['door', 'Tür'], ['window', 'Fenster']])}
      ${input('o.width', 'Breite (cm)', 'number', 'min="10"')}`;
    if (item.type === 'door') {
      html += selectField('o.swing', 'Anschlag', [['left', 'Links'], ['right', 'Rechts']]);
      html += selectField('o.flip', 'Öffnet', [['in', 'Nach innen'], ['out', 'Nach außen']]);
    }
    return html + `<p class="hint">Zum Verschieben entlang der Wand ziehen.</p><div class="actions">${btn('delete', 'Löschen', 'danger')}</div>`;
  }
  return '';
}

export function renderPanel() {
  const plan = getPlan();
  const item = selectedItem();
  const sel = item ? ui.selection : null;
  const key = sel ? `${sel.kind}:${sel.id}:${sel.vertex}:${item.type || ''}` : `plan:${plan.rooms.length}:${plan.furniture.length}:${plan.rooms.map((r) => r.points.length).join()}`;
  const panel = $('#panel-body');
  if (key !== panelKey) {
    panelKey = key;
    panel.innerHTML = buildPanel(plan, item);
  }
  // Werte aktualisieren (außer im gerade bearbeiteten Feld)
  for (const el of panel.querySelectorAll('[data-field]')) {
    if (el === document.activeElement) continue;
    const def = FIELDS[el.dataset.field];
    const v = def.get(plan, item);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (String(el.value) !== String(v)) el.value = v;
  }
  if (sel?.kind === 'room') {
    const dds = panel.querySelectorAll('.stats dd');
    if (dds.length >= 3) {
      dds[0].textContent = formatArea(polygonArea(item.points));
      dds[1].textContent = formatLength(polygonPerimeter(item.points));
    }
  }
}

function initPanel() {
  const panel = $('#panel-body');
  panel.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    const def = FIELDS[field];
    if (!def) return;
    let v;
    if (e.target.type === 'checkbox') v = e.target.checked;
    else if (e.target.type === 'number') {
      v = parseFloat(e.target.value);
      if (!Number.isFinite(v)) return renderPanel();
    } else v = e.target.value;
    const apply = (plan) => def.set(plan, selectedItem(), v);
    if (def.noUndo) {
      apply(getPlan());
      changed();
    } else mutate(apply);
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  });
  panel.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const sel = ui.selection;
    switch (action) {
      case 'delete':
      case 'delete-room':
        if (action === 'delete-room') sel.vertex = null;
        tools.deleteSelection();
        break;
      case 'rotate':
        tools.rotateSelection(90);
        break;
      case 'duplicate':
        tools.duplicateSelection();
        break;
      case 'front':
      case 'back':
        mutate((plan) => {
          const i = plan.furniture.findIndex((f) => f.id === sel.id);
          if (i < 0) return;
          const [f] = plan.furniture.splice(i, 1);
          if (action === 'front') plan.furniture.push(f);
          else plan.furniture.unshift(f);
        });
        break;
      case 'save-custom': {
        const f = selectedItem();
        mutate((plan) => plan.customFurniture.push({ type: uid('custom-'), name: f.name, w: f.w, h: f.h, color: f.color }));
        toast(`„${f.name}“ ist jetzt unter „Eigene Möbel“ verfügbar.`);
        break;
      }
    }
  });
}
