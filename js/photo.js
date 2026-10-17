// Aktionen rund um die Foto-Vorlage: laden, Maßstab festlegen, Perspektive korrigieren, drehen, entfernen.
import { getPlan, ui, mutate, changed } from './state.js';
import { planBounds, dist, round1 } from './geometry.js';
import { getImage, putImage, importImageFile, rotateImage90, warpPerspective, loadImageElement } from './background.js';
import * as tools from './tools.js';
import { toast } from './ui.js';

const $ = (sel) => document.querySelector(sel);
const STORAGE_WARNING = 'Das Foto ist zu groß für den Browser-Speicher und geht beim Neuladen verloren – bitte mit „Export“ als Datei sichern.';

let fitView = () => {};
let measured = null; // [p1, p2] in Weltkoordinaten

export function initPhoto(fit) {
  fitView = fit;
  $('#file-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) loadPhotoFile(file);
  });
  tools.setCalibrationHandler((p1, p2) => {
    measured = [p1, p2];
    $('#calibrate-length').value = Math.round(dist(p1, p2));
    $('#dlg-calibrate').returnValue = '';
    $('#dlg-calibrate').showModal();
    $('#calibrate-length').select();
  });
  $('#dlg-calibrate').addEventListener('close', applyCalibration);
  initPerspectiveDialog();
}

export function choosePhoto() {
  $('#file-photo').click();
}

export async function loadPhotoFile(file) {
  const plan = getPlan();
  if (plan.background && !confirm('Die vorhandene Vorlage ersetzen?')) return;
  try {
    const img = await importImageFile(file);
    const { id, persisted } = putImage(img);
    // Vorläufige Größe: so breit wie der bisherige Plan, sonst 10 m
    const b = planBounds(plan);
    const widthCm = b ? Math.max(b.maxX - b.minX, 300) : 1000;
    mutate((p) => {
      p.background = {
        imageId: id,
        x: b ? round1(b.minX) : 0,
        y: b ? round1(b.minY) : 0,
        cmPerPx: widthCm / img.width,
        opacity: 0.6,
        visible: true,
        locked: true,
      };
    });
    fitView();
    startCalibration();
    toast(persisted ? 'Foto geladen. Klicke jetzt zwei Punkte einer bekannten Strecke an.' : STORAGE_WARNING, persisted ? 'info' : 'error');
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function startCalibration() {
  const plan = getPlan();
  if (!plan.background) return;
  if (!plan.background.visible) {
    plan.background.visible = true;
    changed();
  }
  ui.tool = 'select'; // damit setTool die Kalibrierung frisch startet
  tools.setTool('calibrate');
}

function applyCalibration() {
  const dlg = $('#dlg-calibrate');
  const pts = measured;
  measured = null;
  tools.setTool('select');
  const L = parseFloat($('#calibrate-length').value);
  const plan = getPlan();
  if (dlg.returnValue !== 'ok' || !pts || !plan.background || !(L > 0)) return;
  const [p1, p2] = pts;
  const factor = L / dist(p1, p2);
  mutate((p) => {
    const b = p.background;
    // Der erste Punkt bleibt an seiner Stelle, das Foto wird um ihn skaliert.
    b.x = round1(p1[0] - (p1[0] - b.x) * factor);
    b.y = round1(p1[1] - (p1[1] - b.y) * factor);
    b.cmPerPx *= factor;
  });
  fitView();
  toast('Maßstab übernommen. Jetzt mit „Raum“ nachzeichnen – tipp: Magnet (M) ggf. ausschalten.');
}

export async function rotatePhoto() {
  const b = getPlan().background;
  const img = b && getImage(b.imageId);
  if (!img) return;
  try {
    const rotated = await rotateImage90(img);
    const { id, persisted } = putImage(rotated);
    mutate((p) => {
      const bg = p.background;
      const cx = bg.x + (img.width * bg.cmPerPx) / 2;
      const cy = bg.y + (img.height * bg.cmPerPx) / 2;
      bg.imageId = id;
      bg.x = round1(cx - (rotated.width * bg.cmPerPx) / 2);
      bg.y = round1(cy - (rotated.height * bg.cmPerPx) / 2);
    });
    if (!persisted) toast(STORAGE_WARNING, 'error');
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function removePhoto() {
  if (!getPlan().background || !confirm('Die Foto-Vorlage entfernen? Die gezeichneten Räume bleiben erhalten.')) return;
  if (ui.tool === 'calibrate') tools.setTool('select');
  mutate((p) => (p.background = null));
}

// ---------- Perspektive ----------
const persp = { img: null, src: null, corners: null, scale: 1, drag: -1 };

function drawPerspective() {
  const c = $('#persp-canvas');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const s = persp.scale * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(persp.img, 0, 0, c.width, c.height);
  const pts = persp.corners.map(([x, y]) => [x * s, y * s]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(30,136,229,0.12)';
  ctx.fill();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = '#1e88e5';
  ctx.stroke();
  pts.forEach(([x, y], i) => {
    ctx.beginPath();
    ctx.arc(x, y, 9 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = i === persp.drag ? '#1e88e5' : '#fff';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === persp.drag ? '#fff' : '#1e88e5';
    ctx.font = `bold ${11 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
  });
}

function canvasPoint(e) {
  const r = $('#persp-canvas').getBoundingClientRect();
  const k = persp.src.width / r.width;
  return [
    Math.min(persp.src.width, Math.max(0, (e.clientX - r.left) * k)),
    Math.min(persp.src.height, Math.max(0, (e.clientY - r.top) * k)),
  ];
}

function initPerspectiveDialog() {
  const c = $('#persp-canvas');
  c.addEventListener('pointerdown', (e) => {
    if (!persp.corners) return;
    const p = canvasPoint(e);
    const r = c.getBoundingClientRect();
    const thr = (28 * persp.src.width) / r.width;
    let best = -1;
    let bd = thr;
    persp.corners.forEach((q, i) => {
      const d = dist(p, q);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    persp.drag = best;
    c.setPointerCapture(e.pointerId);
    drawPerspective();
  });
  c.addEventListener('pointermove', (e) => {
    if (persp.drag < 0) return;
    persp.corners[persp.drag] = canvasPoint(e);
    drawPerspective();
  });
  const end = () => {
    if (persp.drag < 0) return;
    persp.drag = -1;
    drawPerspective();
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  $('#dlg-perspective').addEventListener('close', async () => {
    const src = persp.src;
    const corners = persp.corners;
    persp.img = persp.corners = null;
    if ($('#dlg-perspective').returnValue !== 'ok' || !src || !getPlan().background) return;
    try {
      const warped = await warpPerspective(src, corners);
      const { id, persisted } = putImage(warped);
      mutate((p) => {
        const bg = p.background;
        bg.cmPerPx = (src.width * bg.cmPerPx) / warped.width; // ungefähr gleiche Breite behalten
        bg.imageId = id;
      });
      fitView();
      startCalibration();
      toast(persisted ? 'Foto entzerrt. Bitte jetzt den Maßstab neu festlegen.' : STORAGE_WARNING, persisted ? 'info' : 'error');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export async function openPerspective() {
  const b = getPlan().background;
  const src = b && getImage(b.imageId);
  if (!src) return;
  persp.src = src;
  persp.img = await loadImageElement(src.dataUrl);
  const ix = src.width * 0.08;
  const iy = src.height * 0.08;
  persp.corners = [[ix, iy], [src.width - ix, iy], [src.width - ix, src.height - iy], [ix, src.height - iy]];
  persp.drag = -1;
  const dlg = $('#dlg-perspective');
  dlg.returnValue = '';
  dlg.showModal();
  // Anzeigegröße an den Dialog anpassen
  const maxW = Math.min(840, dlg.clientWidth - 60);
  const maxH = Math.max(200, window.innerHeight * 0.6);
  persp.scale = Math.min(maxW / src.width, maxH / src.height, 1);
  const c = $('#persp-canvas');
  const dpr = window.devicePixelRatio || 1;
  c.style.width = `${Math.round(src.width * persp.scale)}px`;
  c.style.height = `${Math.round(src.height * persp.scale)}px`;
  c.width = Math.round(src.width * persp.scale * dpr);
  c.height = Math.round(src.height * persp.scale * dpr);
  drawPerspective();
}
