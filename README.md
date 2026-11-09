# Asciiverso

Convierte cualquier **imagen, video o tu cámara** en **arte ASCII animado**, directo en el navegador.

- Animaciones: ensamblar (los caracteres se "arman" desde el centro), respirar, lluvia tipo Matrix y glitch.
- Ajustes: detalle, juego de caracteres (clásico, bloques, puntos, binario, katakana o los tuyos), colores originales o un solo color, contraste, brillo e inversión para fondos claros.
- Exporta **PNG**, **.txt** y **video** (MP4 en Chrome/Edge, WebM en otros navegadores).
- **Privado**: no hay servidor. Las imágenes, los videos y la cámara se procesan solo en tu dispositivo.

## Cómo funciona

1. Cada cuadro se reduce a una grilla de una celda por carácter (`drawImage` a un canvas pequeño).
2. Se calcula el brillo de cada celda y se elige un carácter de la rampa (más denso = más brillante).
3. Los caracteres se dibujan desde un atlas de glifos y se colorean de una sola vez con `globalCompositeOperation = "source-in"`, así corre a 60 fps con miles de caracteres.
4. Las animaciones modifican cada celda en el tiempo (momento de aparición, brillo, carácter).
5. El video se graba con `canvas.captureStream()` + `MediaRecorder`.

## Correr en local

Es HTML, CSS y JavaScript sin dependencias ni compilación:

```bash
python -m http.server 8000
```

y abrir http://localhost:8000

## Despliegue

Sitio estático en Netlify. `_headers` define la CSP y los headers de seguridad.

---

Hecho por [Juan Sebastián López Valencia](https://github.com/jsLopez1104). Inspirado en el arte ASCII generativo de agujeros negros.
