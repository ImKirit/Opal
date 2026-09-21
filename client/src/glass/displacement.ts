// Erzeugt Verschiebungskarten fuer echtes Liquid Glass.
//
// Idee: Jede Glasflaeche ist eine flache Scheibe mit gewoelbtem Rand (Squircle-Profil).
// Ein Lichtstrahl, der senkrecht durch den gewoelbten Rand faellt, wird nach dem
// Brechungsgesetz (Glas n = 1.5) Richtung Mitte abgelenkt. Wie weit, haengt von der
// Steigung der Oberflaeche ab. Diese Ablenkung wird pro Pixel in Rot (x) und Gruen (y)
// kodiert und spaeter von feDisplacementMap auf den Hintergrund angewendet.
//
// Optional wirkt die ganze Flaeche zusaetzlich wie eine Lupe (magnify > 1), das nutzt
// die gleitende Linse in Tabs und Umschaltern.

export interface MapSpec {
  w: number;
  h: number;
  radius: number;
  bezel: number;
  magnify: number;
}

export interface GlassMap {
  url: string;
  /** groesste Verschiebung in CSS-Pixeln, bestimmt den scale-Wert des Filters */
  maxShift: number;
}

const IOR = 1.5;
const LUT_SIZE = 256;
const cache = new Map<string, GlassMap>();

// Brechungsprofil einmal vorberechnen: t = 0 am Rand, t = 1 am Ende der Woelbung
const profile = (() => {
  const lut = new Float32Array(LUT_SIZE);
  let max = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const u = 1 - t;
    const base = 1 - u ** 4;
    // Ableitung der Hoehe h(t) = (1 - (1 - t)^4)^(1/4)
    const slope = base <= 1e-6 ? 1e6 : u ** 3 / base ** 0.75;
    const incidence = Math.atan(slope);
    const refracted = Math.asin(Math.sin(incidence) / IOR);
    const shift = Math.tan(incidence - refracted);
    lut[i] = shift;
    if (shift > max) max = shift;
  }
  for (let i = 0; i < LUT_SIZE; i++) lut[i] /= max;
  return lut;
})();

export function glassMap(spec: MapSpec): GlassMap {
  const key = `${spec.w}x${spec.h}|${spec.radius}|${spec.bezel}|${spec.magnify}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { w, h, magnify } = spec;
  // Grosse Flaechen in halber Aufloesung rechnen, der Browser skaliert die Karte weich hoch
  const res = w * h > 180_000 ? 0.5 : 1;
  const cw = Math.max(2, Math.round(w * res));
  const ch = Math.max(2, Math.round(h * res));

  const hw = w / 2;
  const hh = h / 2;
  const r = Math.max(0, Math.min(spec.radius, hw, hh));
  const bezel = Math.max(1, Math.min(spec.bezel, hw, hh));
  const bezelStrength = bezel * 0.75;
  const lens = magnify > 1 ? 1 - 1 / magnify : 0;

  const fx = new Float32Array(cw * ch);
  const fy = new Float32Array(cw * ch);
  let maxShift = 0.001;

  for (let py = 0; py < ch; py++) {
    const y = (py + 0.5) / res;
    const dy = y - hh;
    const qy = Math.abs(dy) - (hh - r);
    for (let px = 0; px < cw; px++) {
      const x = (px + 0.5) / res;
      const dx = x - hw;
      const qx = Math.abs(dx) - (hw - r);

      // Abstand zum Rand des abgerundeten Rechtecks und Randnormale
      let dist: number;
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy);
        dist = r - len;
        nx = (qx / len) * (dx < 0 ? -1 : 1);
        ny = (qy / len) * (dy < 0 ? -1 : 1);
      } else if (qx >= qy) {
        dist = r - qx;
        nx = dx < 0 ? -1 : 1;
      } else {
        dist = r - qy;
        ny = dy < 0 ? -1 : 1;
      }
      if (dist < 0) continue;

      let sx = 0;
      let sy = 0;
      if (dist < bezel) {
        const m = profile[Math.min(LUT_SIZE - 1, Math.round((dist / bezel) * (LUT_SIZE - 1)))] * bezelStrength;
        // Strahl wird nach innen gebrochen: wir sehen Hintergrund von weiter innen
        sx -= nx * m;
        sy -= ny * m;
      }
      if (lens) {
        sx -= dx * lens;
        sy -= dy * lens;
      }
      const i = py * cw + px;
      fx[i] = sx;
      fy[i] = sy;
      const a = Math.max(Math.abs(sx), Math.abs(sy));
      if (a > maxShift) maxShift = a;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { url: '', maxShift: 0 };
  const img = ctx.createImageData(cw, ch);
  const data = img.data;
  for (let i = 0; i < cw * ch; i++) {
    const o = i * 4;
    data[o] = 128 + (fx[i] / maxShift) * 127;
    data[o + 1] = 128 + (fy[i] / maxShift) * 127;
    data[o + 2] = 128;
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const result = { url: canvas.toDataURL('image/png'), maxShift };
  cache.set(key, result);
  if (cache.size > 120) cache.delete(cache.keys().next().value as string);
  return result;
}
