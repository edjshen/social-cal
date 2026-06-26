/**
 * QR scanning from the camera. Prefers the native BarcodeDetector (Android
 * Chrome); falls back to jsQR (covers iOS Safari, which lacks BarcodeDetector).
 * Client-only; requires a user gesture + camera permission.
 */

export function qrScanSupported() {
  return typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia != null;
}

/**
 * Stream the rear camera into `videoEl` and call onResult(text) for each decoded
 * QR. The caller should stop() once it has a value it likes.
 * @returns {Promise<() => void>} a stop function
 */
export async function startQrScan(videoEl, onResult) {
  if (!qrScanSupported()) throw new Error('camera unavailable');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });
  videoEl.srcObject = stream;
  videoEl.setAttribute('playsinline', 'true');
  await videoEl.play().catch(() => {});

  let stopped = false;
  let detector = null;
  if (typeof BarcodeDetector !== 'undefined') {
    try {
      detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      detector = null;
    }
  }
  let canvas = null;
  let ctx = null;
  let jsQR = null;

  async function tick() {
    if (stopped) return;
    try {
      if (detector) {
        const codes = await detector.detect(videoEl);
        if (codes && codes.length && codes[0].rawValue) onResult(codes[0].rawValue);
      } else {
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;
        if (w && h) {
          if (!canvas) {
            canvas = document.createElement('canvas');
            ctx = canvas.getContext('2d', { willReadFrequently: true });
            jsQR = (await import('jsqr')).default;
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(videoEl, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h);
          if (code && code.data) onResult(code.data);
        }
      }
    } catch {
      /* transient decode error — keep scanning */
    }
    if (!stopped) setTimeout(tick, 140);
  }
  setTimeout(tick, 140);

  return function stop() {
    stopped = true;
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* noop */
    }
    if (videoEl) videoEl.srcObject = null;
  };
}
