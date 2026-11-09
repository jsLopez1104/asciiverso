import { AsciiRenderer, CHARSETS, drawBlackHole } from "./ascii.js";

const $ = (id) => document.getElementById(id);
const canvas = $("lienzo");
const renderer = new AsciiRenderer(canvas);
const estado = $("estado");
const video = $("video");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let kind = null;          // "imagen" | "video" | "camara"
let stream = null;
let objectUrl = null;
let startTime = performance.now();
let paused = false;
let pausedAt = 0;
let recording = false;

// ---------- Controles ----------
const controls = {
  cols: $("cols"), charset: $("charset"), custom: $("custom"), colorMode: $("colorMode"),
  mono: $("mono"), bg: $("bg"), invert: $("invert"), contrast: $("contrast"),
  brightness: $("brightness"), animation: $("animation"), speed: $("speed"), fontSize: $("fontSize"),
};

if (window.innerWidth < 700) controls.cols.value = 70;
if (reduceMotion) controls.animation.value = "ninguna";

function readControls() {
  renderer.set({
    cols: +controls.cols.value,
    charset: controls.charset.value,
    custom: controls.custom.value,
    colorMode: controls.colorMode.value,
    mono: controls.mono.value,
    bg: controls.bg.value,
    invert: controls.invert.checked,
    contrast: +controls.contrast.value,
    brightness: +controls.brightness.value,
    animation: kind === "imagen" ? controls.animation.value : controls.animation.value === "ensamblar" ? "ninguna" : controls.animation.value,
    speed: +controls.speed.value,
    fontSize: +controls.fontSize.value,
  });
  $("cols-v").textContent = controls.cols.value;
  $("contrast-v").textContent = (+controls.contrast.value).toFixed(1);
  $("brightness-v").textContent = (+controls.brightness.value).toFixed(1);
  $("speed-v").textContent = (+controls.speed.value).toFixed(1) + "×";
  $("fontSize-v").textContent = controls.fontSize.value + " px";
  $("custom-field").hidden = controls.charset.value !== "custom";
  $("mono-field").hidden = controls.colorMode.value !== "mono";
  if (paused) renderer.render(pausedAt);
}
Object.values(controls).forEach((el) => el.addEventListener("input", readControls));

$("restart").addEventListener("click", () => {
  startTime = performance.now();
  if (kind === "video") { video.currentTime = 0; video.play(); }
});
$("pause").addEventListener("click", togglePause);

function togglePause() {
  paused = !paused;
  $("pause").textContent = paused ? "Reanudar" : "Pausar";
  $("pause").setAttribute("aria-pressed", String(paused));
  if (paused) {
    pausedAt = (performance.now() - startTime) / 1000;
    if (kind !== "imagen") video.pause();
  } else {
    startTime = performance.now() - pausedAt * 1000;
    if (kind !== "imagen") video.play();
  }
}

// ---------- Cargar fuentes ----------
function stopStream() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  video.srcObject = null;
}

function showStage() {
  $("vacio").hidden = true;
  $("escenario").hidden = false;
  $("acciones").hidden = false;
  $("video-ctrls").hidden = kind === "imagen";
}

function loadFile(file) {
  if (!file) return;
  stopStream();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  if (file.type.startsWith("image/")) {
    const img = new Image();
    img.onload = () => useImage(img, img.naturalWidth, img.naturalHeight, file.name);
    img.onerror = () => say("No se pudo leer esa imagen. Prueba con JPG, PNG o WebP.");
    img.src = objectUrl;
  } else if (file.type.startsWith("video/")) {
    video.srcObject = null;
    video.src = objectUrl;
    video.loop = true;
    video.onloadeddata = () => {
      kind = "video";
      renderer.setSource(video, video.videoWidth, video.videoHeight);
      readControls(); showStage(); startTime = performance.now();
      video.play();
      say(`Video cargado: ${file.name}. Se convierte cuadro por cuadro.`);
    };
    video.onerror = () => say("Tu navegador no puede reproducir ese video. Prueba con MP4 o WebM.");
  } else {
    say("Ese archivo no es una imagen ni un video.");
  }
}

function useImage(drawable, w, h, name) {
  stopStream();
  video.removeAttribute("src");
  kind = "imagen";
  renderer.setSource(drawable, w, h);
  readControls(); showStage(); startTime = performance.now();
  const claro = averageLuminance(drawable) > 0.6 && !controls.invert.checked;
  say(`Imagen cargada: ${name}.` + (claro ? " Tiene fondo claro: si se ve como un bloque lleno, activa \"Invertir\"." : ""));
}

$("archivo").addEventListener("change", (e) => loadFile(e.target.files[0]));
$("archivo2").addEventListener("change", (e) => loadFile(e.target.files[0]));
$("demo").addEventListener("click", () => {
  controls.colorMode.value = "original";
  controls.charset.value = "clasico";
  if (!reduceMotion) controls.animation.value = "ensamblar";
  useImage(drawBlackHole(), 960, 640, "agujero negro de ejemplo");
});
$("camara").addEventListener("click", async () => {
  try {
    stopStream();
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    video.src = "";
    video.srcObject = stream;
    video.loop = false;
    await video.play();
    kind = "camara";
    renderer.setSource(video, video.videoWidth, video.videoHeight);
    if (controls.animation.value === "ensamblar") controls.animation.value = "ninguna";
    readControls(); showStage(); startTime = performance.now();
    say("Cámara activa. Nada sale de tu dispositivo.");
  } catch {
    say("No se pudo abrir la cámara. Revisa el permiso del navegador.");
  }
});

// Arrastrar y soltar en toda la página
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("activo"); }));
["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || e.target === document.documentElement) drop.classList.remove("activo"); }));
document.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});

function averageLuminance(drawable) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(drawable, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  return s / (d.length / 4);
}

// ---------- Bucle ----------
function frame(now) {
  if (kind && !paused) {
    const t = (now - startTime) / 1000;
    if (kind === "imagen" || video.readyState >= 2) renderer.render(t);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Exportar ----------
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

$("png").addEventListener("click", () => canvas.toBlob((b) => download(b, "asciiverso.png"), "image/png"));
$("txt").addEventListener("click", () => download(new Blob([renderer.toText()], { type: "text/plain;charset=utf-8" }), "asciiverso.txt"));
$("copiar").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(renderer.toText()); say("Texto copiado. Pégalo con una fuente monoespaciada."); }
  catch { say("No se pudo copiar. Usa \"Descargar .txt\"."); }
});

function pickMime() {
  const opts = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return opts.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
}

$("grabar").addEventListener("click", async () => {
  if (recording) return;
  if (!window.MediaRecorder || !canvas.captureStream) { say("Tu navegador no permite grabar video. Prueba con Chrome o Edge."); return; }
  if (kind === "camara") { recordFor(10); return; }
  if (kind === "video") {
    video.loop = false; video.currentTime = 0;
    await new Promise((r) => (video.onseeked = r));
    startTime = performance.now();
    const dur = Math.min(video.duration || 15, 60);
    video.play();
    recordFor(dur, () => { video.loop = true; video.play(); });
    return;
  }
  startTime = performance.now();
  recordFor(renderer.loopSeconds);
});

function recordFor(seconds, done) {
  if (paused) togglePause();
  const mime = pickMime();
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    recording = false;
    $("grabar").disabled = false;
    $("grabar").textContent = "Grabar video";
    const type = rec.mimeType || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    download(new Blob(chunks, { type }), `asciiverso.${ext}`);
    say(`Video listo (${ext.toUpperCase()}).` + (ext === "webm" ? " Para subirlo a Instagram o TikTok, conviértelo a MP4 o usa Chrome actualizado, que graba MP4 directo." : ""));
    done && done();
  };
  recording = true;
  $("grabar").disabled = true;
  rec.start(250);
  let left = Math.ceil(seconds);
  $("grabar").textContent = `Grabando… ${left}s`;
  say(`Grabando ${Math.ceil(seconds)} segundos.`);
  const iv = setInterval(() => {
    left -= 1;
    if (left > 0) $("grabar").textContent = `Grabando… ${left}s`;
  }, 1000);
  setTimeout(() => { clearInterval(iv); rec.stop(); stream.getTracks().forEach((t) => t.stop()); }, seconds * 1000);
}

// ---------- Estado accesible ----------
let sayTimer;
function say(msg) {
  estado.textContent = msg;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => (estado.textContent = ""), 6000);
}

// Lista de juegos de caracteres (vista previa en el select)
for (const [k, v] of Object.entries(CHARSETS)) {
  const o = controls.charset.querySelector(`option[value="${k}"]`);
  if (o) o.title = v.trim();
}
readControls();
