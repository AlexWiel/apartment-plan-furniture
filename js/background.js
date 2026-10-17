// Foto-Vorlage: Bild laden/verkleinern, Bildspeicher, Drehen und Perspektivkorrektur.
// Die Bilddaten liegen bewusst nicht im Plan, damit Undo-Snapshots klein bleiben.

const IMAGES_KEY = 'wohnplaner.images.v1';
const MAX_SIDE = 2000;
const QUALITY = 0.82;

const images = new Map(); // id → { dataUrl, width, height }

try {
  const raw = JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}');
  for (const [id, img] of Object.entries(raw)) {
    if (img && typeof img.dataUrl === 'string' && img.width > 0 && img.height > 0) images.set(id, img);
  }
} catch {
  /* Browser-Speicher nicht verfügbar */
}

function persist() {
  try {
    localStorage.setItem(IMAGES_KEY, JSON.stringify(Object.fromEntries(images)));
    return true;
  } catch {
    return false;
  }
}

const newId = () => 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const getImage = (id) => images.get(id) || null;
export const hasImage = (id) => typeof id === 'string' && images.has(id);

// Legt ein Bild ab. persisted=false heißt: nur für diese Sitzung (Browser-Speicher voll).
export function putImage(img, id = newId()) {
  images.set(id, { dataUrl: img.dataUrl, width: img.width, height: img.height });
  return { id, persisted: persist() };
}

// Entfernt alle Bilder, die von keinem Plan mehr verwendet werden.
export function pruneImages(usedIds) {
  const used = new Set(usedIds);
  let removed = false;
  for (const id of [...images.keys()]) {
    if (!used.has(id)) {
      images.delete(id);
      removed = true;
    }
  }
  if (removed) persist();
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    img.src = src;
  });
}

function canvasToImage(canvas) {
  return { dataUrl: canvas.toDataURL('image/jpeg', QUALITY), width: canvas.width, height: canvas.height };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  return [c, ctx];
}

// Lädt eine Bilddatei und verkleinert sie auf max. MAX_SIDE Pixel.
export async function importImageFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei (JPG, PNG …) wählen.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const [c, ctx] = makeCanvas(img.naturalWidth * s, img.naturalHeight * s);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return canvasToImage(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function rotateImage90(src) {
  const img = await loadImageElement(src.dataUrl);
  const [c, ctx] = makeCanvas(src.height, src.width);
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0, src.width, src.height);
  return canvasToImage(c);
}

// Löst A·x = b (Gauß mit Pivotsuche).
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error('Die Eckpunkte liegen ungünstig (z. B. auf einer Linie).');
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Homographie, die Punkte aus `from` auf `to` abbildet (je 4 Punkte).
export function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = from[i];
    const [x, y] = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  return solve(A, b);
}

const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Entzerrt das Viereck `corners` (Bildpixel, Reihenfolge: oben links, oben rechts, unten rechts, unten links).
export async function warpPerspective(src, corners) {
  const [tl, tr, br, bl] = corners;
  let W = (len(tl, tr) + len(bl, br)) / 2;
  let H = (len(tl, bl) + len(tr, br)) / 2;
  const s = Math.min(1, MAX_SIDE / Math.max(W, H));
  W = Math.max(2, Math.round(W * s));
  H = Math.max(2, Math.round(H * s));
  const h = homography([[0, 0], [W, 0], [W, H], [0, H]], corners);

  const img = await loadImageElement(src.dataUrl);
  const [sc, sctx] = makeCanvas(src.width, src.height);
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, sc.width, sc.height).data;
  const sw = sc.width;
  const sh = sc.height;

  const [dc, dctx] = makeCanvas(W, H);
  const out = dctx.getImageData(0, 0, W, H);
  const od = out.data;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const den = h[6] * u + h[7] * v + 1;
      const x = (h[0] * u + h[1] * v + h[2]) / den;
      const y = (h[3] * u + h[4] * v + h[5]) / den;
      const o = (v * W + u) * 4;
      if (x < 0 || y < 0 || x > sw - 1 || y > sh - 1) {
        od[o] = od[o + 1] = od[o + 2] = 255;
        od[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
        const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
        od[o + c] = top * (1 - fy) + bot * fy;
      }
      od[o + 3] = 255;
    }
  }
  dctx.putImageData(out, 0, 0);
  return canvasToImage(dc);
}
