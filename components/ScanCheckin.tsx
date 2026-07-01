'use client';
import { useEffect, useRef, useState } from 'react';
import { checkInByQr, type CheckinResult } from '@/lib/actions/rewards';

// Self-scan check-in. The venue shows a rotating event QR (encodes `eventId.code`);
// the partygoer scans it here. Uses the native BarcodeDetector where available,
// with a manual paste fallback for accessibility / unsupported browsers.

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export default function ScanCheckin({ onClose }: { onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'submitting' | 'done'>('idle');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef(false);

  async function submit(raw: string) {
    setStatus('submitting');
    stopRef.current = true;
    const r = await checkInByQr(raw);
    setResult(r);
    setStatus('done');
    stopCamera();
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setError(null);
    const Ctor = (
      globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
    ).BarcodeDetector;
    if (!Ctor) {
      setError('Camera scanning is not supported here — paste the code below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new Ctor({ formats: ['qr_code'] });
      setStatus('scanning');
      stopRef.current = false;
      const tick = async () => {
        if (stopRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            await submit(codes[0].rawValue);
            return;
          }
        } catch {
          /* transient decode error — keep polling */
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setError('Could not open the camera — paste the code below.');
    }
  }

  useEffect(() => {
    startCamera();
    return () => {
      stopRef.current = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'done' && result) {
    return (
      <div className="scan-result">
        {result.ok ? (
          <>
            <div className="scan-big">✅</div>
            <div className="h-title">
              You&apos;re in{result.orgName ? ` at ${result.orgName}` : ''}!
            </div>
            <div className="scan-points">
              +{result.globalAwarded ?? 0} points
              {result.orgAwarded ? ` · +${result.orgAwarded} with this org` : ''}
            </div>
          </>
        ) : (
          <>
            <div className="scan-big">⚠️</div>
            <div className="h-title">{result.reason ?? 'Could not check in'}</div>
          </>
        )}
        <button className="btn solid block" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="scan">
      <div className="scan-frame">
        <video ref={videoRef} playsInline muted className="scan-video" />
        <div className="scan-reticle" />
      </div>
      <p className="sub" style={{ textAlign: 'center' }}>
        {status === 'submitting' ? 'Checking in…' : 'Point at the venue QR to check in'}
      </p>
      {error && <p className="scan-err">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) submit(manual.trim());
        }}
        className="scan-manual"
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="…or paste the code"
          aria-label="Paste check-in code"
        />
        <button className="btn sm" type="submit" disabled={!manual.trim()}>
          Submit
        </button>
      </form>
      {onClose && (
        <button className="btn block" onClick={onClose}>
          Cancel
        </button>
      )}
    </div>
  );
}
