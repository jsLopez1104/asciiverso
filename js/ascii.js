// Motor ASCII: convierte cualquier fuente dibujable (imagen, video, canvas) en arte ASCII
// sobre un <canvas>, con animaciones por celda. Todo corre en el navegador.

export const CHARSETS = {
  clasico: " .:-=+*#%@",
  detallado: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  bloques: " ░▒▓█",
  puntos: " ·:•●",
  binario: " 01",
  matrix: " ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ",
};

export const FONT_STACK = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export class AsciiRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sample = document.createElement("canvas");
    this.sctx = this.sample.getContext("2d", { willReadFrequently: true });
    this.colorCanvas = document.createElement("canvas");
    this.cctx = this.colorCanvas.getContext("2d");
    this.source = null;
    this.srcW = 0;
    this.srcH = 0;
    this.opts = {
      cols: 120,
      charset: "clasico",
      custom: "",
      colorMode: "original", // original | mono
      mono: "#ffb347",
      bg: "#07070b",
      invert: false,
      contrast: 1.2,
      brightness: 1.0,
      animation: "ensamblar", // ninguna | ensamblar | respirar | glitch | lluvia
      speed: 1,
      fontSize: 12,
    };
    this.atlasKey = "";
    this.seeds = null;
    this.chars = null;
    this.rows = 0;
  }

  setSource(source, w, h) {
    this.source = source;
    this.srcW = w;
    this.srcH = h;
  }

  set(partial) { Object.assign(this.opts, partial); }

  get ramp() {
    const o = this.opts;
    const r = o.charset === "custom" ? " " + (o.custom || "#").replace(/\s/g, "") : CHARSETS[o.charset];
    return [...r];
  }

  // Duración de un ciclo de animación (para exportar imágenes animadas)
  get loopSeconds() {
    return { ensamblar: 7, respirar: 4, glitch: 4, lluvia: 6, ninguna: 3 }[this.opts.animation] / this.opts.speed;
  }

  buildAtlas() {
    const ramp = this.ramp;
    const fs = this.opts.fontSize;
    const key = ramp.join("") + "|" + fs;
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    const font = `${fs}px ${FONT_STACK}`;
    const m = document.createElement("canvas").getContext("2d");
    m.font = font;
    this.gw = Math.max(1, Math.ceil(m.measureText("M").width));
    this.gh = Math.ceil(fs * 1.15);
    this.atlas = document.createElement("canvas");
    this.atlas.width = this.gw * ramp.length;
    this.atlas.height = this.gh;
    const a = this.atlas.getContext("2d");
    a.font = font;
    a.textBaseline = "middle";
    a.textAlign = "center";
    a.fillStyle = "#fff";
    ramp.forEach((ch, i) => a.fillText(ch, i * this.gw + this.gw / 2, this.gh / 2));
  }

  layout() {
    this.buildAtlas();
    const cols = Math.round(this.opts.cols);
    const aspect = this.srcH / this.srcW;
    const rows = Math.max(1, Math.round(cols * aspect * (this.gw / this.gh)));
    if (cols !== this.sample.width || rows !== this.sample.height) {
      this.sample.width = this.colorCanvas.width = cols;
      this.sample.height = this.colorCanvas.height = rows;
      this.seeds = new Float32Array(cols * rows);
      for (let i = 0; i < this.seeds.length; i++) this.seeds[i] = Math.random();
      this.colorData = this.cctx.createImageData(cols, rows);
    }
    this.cols = cols;
    this.rows = rows;
    const W = cols * this.gw;
    const H = rows * this.gh;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
  }

  render(t = 0) {
    if (!this.source || !this.srcW) return;
    this.layout();
    const { cols, rows, gw, gh, ctx, opts } = this;
    const ramp = this.ramp;
    const n = ramp.length;

    // 1. Reducir la fuente a una celda por carácter
    this.sctx.filter = `contrast(${opts.contrast}) brightness(${opts.brightness})`;
    this.sctx.drawImage(this.source, 0, 0, cols, rows);
    this.sctx.filter = "none";
    const src = this.sctx.getImageData(0, 0, cols, rows).data;
    const out = this.colorData.data;
    const chars = this.chars && this.chars.length === cols * rows ? this.chars : (this.chars = new Uint16Array(cols * rows));

    const mono = hexToRgb(opts.mono);
    const anim = opts.animation;
    const T = t * opts.speed;
    const loop = this.loopSeconds * opts.speed;
    const tl = T % loop;
    const cx = cols / 2, cy = rows / 2;
    const maxD = Math.hypot(cx, cy);

    // Filas desplazadas para "glitch"
    let shift = null;
    if (anim === "glitch") {
      shift = new Int16Array(rows);
      const frame = Math.floor(T * 12);
      for (let y = 0; y < rows; y++) {
        const h = hash(y * 7.31 + frame * 13.7);
        shift[y] = h > 0.93 ? Math.round((hash(y + frame) - 0.5) * cols * 0.25) : 0;
      }
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let sx = x;
        if (shift && shift[y]) sx = clamp(x + shift[y], 0, cols - 1);
        const p = (y * cols + sx) * 4;
        let r = src[p], g = src[p + 1], b = src[p + 2];
        let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (opts.invert) lum = 1 - lum;
        let alpha = 1;
        let ci = Math.round(lum * (n - 1));
        const seed = this.seeds[i];

        if (anim === "ensamblar") {
          // Aparece desde el centro hacia afuera, con caracteres al azar antes de "asentarse"
          const d = Math.hypot((x - cx) / cols, (y - cy) / rows) * 1.6;
          const reveal = 0.4 + d * 2.2 + seed * 1.2; // segundo en que se asienta la celda
          const p0 = smooth((tl - reveal + 0.9) / 0.9); // entra
          const settled = tl > reveal;
          const fade = 1 - smooth((tl - (loop - 0.8)) / 0.8); // se apaga al final del ciclo
          alpha = p0 * fade;
          if (!settled && ci > 0) ci = 1 + Math.floor(hash(seed * 97 + Math.floor(T * 14)) * (n - 1));
          if (settled) {
            const flash = Math.exp(-(((tl - reveal) / 0.25) ** 2));
            r = r + (255 - r) * flash; g = g + (255 - g) * flash; b = b + (255 - b) * flash;
          }
        } else if (anim === "respirar") {
          const d = Math.hypot(x - cx, y - cy) / maxD;
          alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(T * 2.4 - d * 7));
          if (ci > 0 && hash(seed * 31 + Math.floor(T * 6)) > 0.97) ci = clamp(ci + 1, 1, n - 1);
        } else if (anim === "glitch") {
          const frame = Math.floor(T * 12);
          if (ci > 0 && hash(seed * 51 + frame) > 0.96) ci = 1 + Math.floor(hash(seed + frame) * (n - 1));
          if (shift[y]) { r = Math.min(255, r * 1.4); b = Math.min(255, b + 60); }
        } else if (anim === "lluvia") {
          // Columnas que caen: la cabeza es brillante, la imagen se revela a su paso
          const speed = 6 + hash(x * 3.7) * 10;
          const head = ((T * speed + hash(x * 9.1) * rows * 2) % (rows * 1.6)) - rows * 0.3;
          const dist = head - y;
          const trail = dist >= 0 ? Math.exp(-dist / 7) : 0;
          const revealed = smooth((tl - 1 - hash(x * 1.3) * 2) / 1.5);
          alpha = clamp(0.12 + 0.88 * revealed + trail, 0, 1);
          if (trail > 0.5) {
            ci = 1 + Math.floor(hash(seed * 77 + Math.floor(T * 20)) * (n - 1));
            r = r * 0.3 + 0; g = Math.max(g, 230); b = b * 0.3 + 80;
          }
        }

        chars[i] = ci;
        const o = i * 4;
        if (opts.colorMode === "mono") {
          const k = 0.35 + 0.65 * lum;
          out[o] = mono[0] * k; out[o + 1] = mono[1] * k; out[o + 2] = mono[2] * k;
        } else {
          // Subir un poco el color para que los caracteres se lean sobre fondo oscuro
          const boost = 1.25;
          out[o] = Math.min(255, r * boost); out[o + 1] = Math.min(255, g * boost); out[o + 2] = Math.min(255, b * boost);
        }
        out[o + 3] = Math.round(clamp(alpha, 0, 1) * 255);
      }
    }
    this.cctx.putImageData(this.colorData, 0, 0);

    // 2. Dibujar los caracteres (máscara blanca)
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < rows; y++) {
      const dy = y * gh;
      for (let x = 0; x < cols; x++) {
        const ci = chars[y * cols + x];
        if (ci === 0) continue;
        ctx.drawImage(this.atlas, ci * gw, 0, gw, gh, x * gw, dy, gw, gh);
      }
    }
    // 3. Pintar cada carácter con el color de su celda
    ctx.globalCompositeOperation = "source-in";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.colorCanvas, 0, 0, this.canvas.width, this.canvas.height);
    // 4. Fondo
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }

  toText() {
    if (!this.chars) return "";
    const ramp = this.ramp;
    let s = "";
    for (let y = 0; y < this.rows; y++) {
      let line = "";
      for (let x = 0; x < this.cols; x++) line += ramp[this.chars[y * this.cols + x]] || " ";
      s += line.replace(/\s+$/, "") + "\n";
    }
    return s;
  }
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Imagen de demostración: un agujero negro dibujado con gradientes (sin archivos externos)
export function drawBlackHole(w = 960, h = 640) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const a = Math.random();
    g.fillStyle = `rgba(255,255,255,${0.35 + a * 0.65})`;
    g.fillRect(Math.random() * w, Math.random() * h, a > 0.9 ? 2 : 1, a > 0.9 ? 2 : 1);
  }
  const cx = w / 2, cy = h / 2, R = h * 0.21;
  const disk = (alphaMul) => {
    g.save();
    g.translate(cx, cy); g.rotate(-0.12); g.scale(1, 0.3);
    const grd = g.createRadialGradient(0, 0, R * 1.05, 0, 0, R * 4.4);
    grd.addColorStop(0, `rgba(255,250,230,${alphaMul})`);
    grd.addColorStop(0.18, `rgba(255,200,110,${alphaMul})`);
    grd.addColorStop(0.5, `rgba(220,110,30,${0.75 * alphaMul})`);
    grd.addColorStop(1, "rgba(80,20,0,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, R * 4.4, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  disk(1);
  // Halo con lente: la parte de atrás del disco curvada sobre la sombra
  g.save();
  g.translate(cx, cy);
  const halo = g.createRadialGradient(0, 0, R * 0.95, 0, 0, R * 1.9);
  halo.addColorStop(0, "rgba(255,235,190,1)");
  halo.addColorStop(0.25, "rgba(255,170,70,0.85)");
  halo.addColorStop(1, "rgba(120,40,0,0)");
  g.fillStyle = halo;
  g.beginPath(); g.arc(0, 0, R * 1.9, 0, Math.PI * 2); g.fill();
  // Sombra
  g.fillStyle = "#000";
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  g.restore();
  // Parte delantera del disco, por encima de la sombra
  g.save();
  g.beginPath(); g.rect(0, cy, w, h - cy); g.clip();
  disk(0.95);
  g.restore();
  return c;
}
