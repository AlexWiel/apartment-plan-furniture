// Zoom und Verschieben der Ansicht. Bildschirm = Welt * scale + (x, y).

export function createView(svg, worldGroup, onChange) {
  const v = { x: 40, y: 40, scale: 1 };

  function apply() {
    worldGroup.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.scale})`);
    onChange();
  }

  const rect = () => svg.getBoundingClientRect();

  return {
    get scale() {
      return v.scale;
    },
    screenToWorld(clientX, clientY) {
      const r = rect();
      return [(clientX - r.left - v.x) / v.scale, (clientY - r.top - v.y) / v.scale];
    },
    zoomAt(clientX, clientY, factor) {
      const r = rect();
      const sx = clientX - r.left;
      const sy = clientY - r.top;
      const ns = Math.min(20, Math.max(0.05, v.scale * factor));
      const wx = (sx - v.x) / v.scale;
      const wy = (sy - v.y) / v.scale;
      v.x = sx - wx * ns;
      v.y = sy - wy * ns;
      v.scale = ns;
      apply();
    },
    zoomCenter(factor) {
      const r = rect();
      this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
    },
    panBy(dx, dy) {
      v.x += dx;
      v.y += dy;
      apply();
    },
    fit(b, padding = 50) {
      const r = rect();
      const w = Math.max(b.maxX - b.minX, 100);
      const h = Math.max(b.maxY - b.minY, 100);
      const s = Math.min((r.width - 2 * padding) / w, (r.height - 2 * padding) / h);
      v.scale = Math.min(4, Math.max(0.05, s));
      v.x = (r.width - w * v.scale) / 2 - b.minX * v.scale;
      v.y = (r.height - h * v.scale) / 2 - b.minY * v.scale;
      apply();
    },
    viewBounds() {
      const r = rect();
      return {
        minX: -v.x / v.scale,
        minY: -v.y / v.scale,
        maxX: (r.width - v.x) / v.scale,
        maxY: (r.height - v.y) / v.scale,
      };
    },
    center() {
      const b = this.viewBounds();
      return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    },
  };
}
