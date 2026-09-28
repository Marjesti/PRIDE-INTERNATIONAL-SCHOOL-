// Draws a QR code straight onto a <canvas>, synchronously, using only the
// low-level matrix model from qrcode.min.js (QRCode.Model). We deliberately
// avoid the `new QRCode(el, {...})` high-level API: on some mobile webviews
// its canvas-to-<img> conversion step depends on an async data-URI support
// check that can silently never resolve, leaving the box blank.
//
// displaySizePx is the size it should appear on screen/print. Internally we
// render each QR module as a whole number of pixels (e.g. 10px/module) at a
// much higher resolution, then scale down to displaySizePx in CSS -- this
// is what actually makes it scannable: real QR readers need crisp, sharply-
// bounded squares, not a handful of blurry anti-aliased pixels.
//
// Returns true if a QR code was drawn, false if it couldn't be (caller
// should show a text fallback in that case).
function renderQrCode(container, text, displaySizePx) {
  displaySizePx = displaySizePx || 100;
  container.innerHTML = '';

  if (!window.QRCode || !window.QRCode.Model || !window.QRCode.CorrectLevel) return false;

  // Low correction level (L) keeps the module count -- and therefore the
  // physical size needed per module -- as small as possible for a given
  // amount of text, which matters a lot at ID-card scale.
  let qr = null;
  for (let typeNumber = 1; typeNumber <= 20 && !qr; typeNumber++) {
    try {
      const candidate = new QRCode.Model(typeNumber, QRCode.CorrectLevel.L);
      candidate.addData(text);
      candidate.make();
      qr = candidate;
    } catch (e) {
      qr = null; // text too long for this type number -- try the next size up
    }
  }
  if (!qr) return false;

  const count = qr.getModuleCount();
  const modulePx = 10; // whole pixels per module -- keeps every edge crisp
  const quietModules = 4; // white margin required around a QR for reliable scanning
  const internal = (count + quietModules * 2) * modulePx;

  const canvas = document.createElement('canvas');
  canvas.width = internal;
  canvas.height = internal;
  canvas.style.width = displaySizePx + 'px';
  canvas.style.height = displaySizePx + 'px';
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, internal, internal);
  ctx.fillStyle = '#000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + quietModules) * modulePx, (row + quietModules) * modulePx, modulePx, modulePx);
      }
    }
  }

  container.appendChild(canvas);
  return true;
}
