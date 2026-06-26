/**
 * Chirp cast/catch — data-over-sound via ggwave (WASM, client-only). The
 * fragment payload (~60–70 bytes base64url) is well within ggwave's capacity;
 * at audible-fast speed a full transmit takes a few seconds, so the cast loops
 * while the sheet is open and a latecomer still catches it (idempotent — the
 * same room id catches once).
 *
 * Defaults to an AUDIBLE protocol (robust in loud venues; becomes the ritual
 * sound); an ULTRASOUND mode is offered for quiet rooms. The catch path is
 * identical to the link path once decoded.
 *
 * ggwave is loaded as a self-hosted <script> from /mayfly/ggwave.js (vendored
 * via scripts/vendor-ggwave.mjs), NOT bundled: it's an Emscripten module whose
 * Node-env branch does require("fs"), which Turbopack can't resolve in a client
 * bundle. The script-tag load sidesteps the bundler; the fs branch is guarded by
 * ENVIRONMENT_IS_NODE and never runs in the browser, and the WASM is embedded as
 * a data URI (no separate asset). VERIFY the call shape if the version changes.
 */

const GGWAVE_SRC = '/mayfly/ggwave.js';
let _ggwavePromise = null;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('ggwave: no document'));
      return;
    }
    if (window.ggwave_factory) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[data-mayfly-ggwave]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('ggwave failed to load')));
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.mayflyGgwave = '1';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('ggwave failed to load'));
    document.head.appendChild(el);
  });
}

async function loadGgwave() {
  if (!_ggwavePromise) {
    _ggwavePromise = loadScriptOnce(GGWAVE_SRC).then(() => {
      if (!window.ggwave_factory) throw new Error('ggwave_factory missing after load');
      return window.ggwave_factory();
    });
  }
  return _ggwavePromise;
}

export function chirpSupported() {
  return (
    typeof window !== 'undefined' &&
    (window.AudioContext || window.webkitAudioContext) != null &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia != null
  );
}

// Copy bytes then reinterpret as another typed-array view (ggwave's wire format
// is the byte-reinterpretation of Float32 audio samples).
function convertTypedArray(src, Type) {
  const buffer = new ArrayBuffer(src.byteLength);
  new src.constructor(buffer).set(src);
  return new Type(buffer);
}

function protoFor(ggwave, mode) {
  return mode === 'ultrasonic'
    ? ggwave.TxProtocolId.GGWAVE_TX_PROTOCOL_ULTRASOUND_FAST
    : ggwave.TxProtocolId.GGWAVE_TX_PROTOCOL_AUDIBLE_FAST;
}

function makeContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return new Ctx();
}

function makeInstance(ggwave, ctx) {
  const params = ggwave.getDefaultParameters();
  params.sampleRateInp = ctx.sampleRate;
  params.sampleRateOut = ctx.sampleRate;
  return ggwave.init(params);
}

/**
 * Emit the payload on a loop. Returns a stop() function.
 * @param {string} payload  the fragment string (e.g. "i=..&k=..&v=1")
 * @param {'audible'|'ultrasonic'} mode
 */
export async function castPayload(payload, mode = 'audible') {
  const ggwave = await loadGgwave();
  const ctx = makeContext();
  await ctx.resume?.();
  const instance = makeInstance(ggwave, ctx);

  let stopped = false;
  let activeSource = null;
  let timer = null;

  function playOnce() {
    if (stopped) return;
    const waveform = ggwave.encode(instance, payload, protoFor(ggwave, mode), 10);
    const float = convertTypedArray(waveform, Float32Array);
    const buffer = ctx.createBuffer(1, float.length, ctx.sampleRate);
    buffer.copyToChannel(float, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (stopped) return;
      // Re-emit after a short gap so a latecomer still catches it.
      timer = setTimeout(playOnce, 600);
    };
    activeSource = source;
    source.start();
  }

  playOnce();

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    try {
      activeSource?.stop();
    } catch {
      /* already stopped */
    }
    ctx.close?.();
  };
}

/**
 * Listen on the mic and decode chirps. Calls onPayload(decodedString) on each
 * successful decode. Requires a user gesture + mic permission. Returns a stop()
 * function. Throws if unsupported or permission denied.
 */
export async function listenForPayload(onPayload) {
  if (!chirpSupported()) throw new Error('chirp catch unsupported');
  const ggwave = await loadGgwave();
  const ctx = makeContext();
  await ctx.resume?.();
  const instance = makeInstance(ggwave, ctx);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessorNode is deprecated but the simplest portable mic tap for v1.
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const samples = e.inputBuffer.getChannelData(0);
    try {
      const bytes = convertTypedArray(new Float32Array(samples), Int8Array);
      const res = ggwave.decode(instance, bytes);
      if (res && res.length > 0) {
        const text = new TextDecoder().decode(res);
        if (text) onPayload(text);
      }
    } catch {
      /* decode hiccup — ignore this frame */
    }
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return function stop() {
    try {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close?.();
    } catch {
      /* noop */
    }
  };
}
