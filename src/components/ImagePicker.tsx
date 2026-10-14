// Photo input for every platform:
//  * phones: "Take a photo" and "Choose from library" are <label>s wrapping file inputs, so the
//    browser opens the camera or library natively, with no scripted .click(). That is more reliable
//    in iOS home-screen apps and in-app browsers (Instagram, Gmail, ...).
//    "Use the in-app camera" (getUserMedia) is there for when the camera app won't open.
//  * desktop: file picker, drag and drop, and a webcam capture (getUserMedia)
import { Camera, ImagePlus, Upload, Video } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { ErrorNote, Sheet } from './ui';

function hasCameraApi(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

function isIOS(): boolean {
  return typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}

/** A button-looking label around a hidden (but focusable) file input. */
function FileButton({
  children,
  capture,
  disabled,
  className,
  onFiles,
}: {
  children: ReactNode;
  capture?: boolean;
  disabled?: boolean;
  className: string;
  onFiles: (files: FileList | null) => void;
}) {
  function change(e: ChangeEvent<HTMLInputElement>) {
    onFiles(e.target.files);
    e.target.value = '';
  }
  return (
    <label
      className={`${className} cursor-pointer has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <input type="file" accept="image/*" capture={capture ? 'environment' : undefined} className="sr-only" disabled={disabled} onChange={change} />
      {children}
    </label>
  );
}

export function ImagePicker({ onPick, disabled }: { onPick: (file: Blob) => void; disabled?: boolean }) {
  const [dragging, setDragging] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touch = isTouchDevice();
  const camera = hasCameraApi();

  function take(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      setError('Please choose a photo (JPEG, PNG, HEIC or WebP).');
      return;
    }
    setError(null);
    onPick(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) take(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      {touch ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FileButton capture disabled={disabled} className="btn btn-primary min-h-16 text-base" onFiles={take}>
              <Camera size={22} aria-hidden data-anim="pop" /> Take a photo
            </FileButton>
            <FileButton disabled={disabled} className="btn btn-secondary min-h-16 text-base" onFiles={take}>
              <ImagePlus size={22} aria-hidden data-anim="pop" /> Choose from library
            </FileButton>
          </div>
          {camera && (
            <p className="text-center text-sm text-fg-2">
              Camera not opening?{' '}
              <button type="button" className="font-semibold text-fg underline underline-offset-2" disabled={disabled} onClick={() => setWebcamOpen(true)}>
                Use the in-app camera
              </button>
            </p>
          )}
        </>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? 'border-fg bg-tint' : 'border-line'
          }`}
        >
          <Upload size={32} className="text-fg-2" aria-hidden data-anim="bounce" />
          <p className="font-semibold">Drag a photo here</p>
          <p className="text-sm text-fg-2">or</p>
          <div className="flex flex-wrap justify-center gap-2">
            <FileButton disabled={disabled} className="btn btn-primary" onFiles={take}>
              <ImagePlus size={18} aria-hidden data-anim="pop" /> Choose a file
            </FileButton>
            {camera && (
              <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => setWebcamOpen(true)}>
                <Video size={18} aria-hidden data-anim="pop" /> Use webcam
              </button>
            )}
          </div>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <WebcamCapture
        open={webcamOpen}
        phone={touch}
        onClose={() => setWebcamOpen(false)}
        onCapture={(blob) => {
          setWebcamOpen(false);
          onPick(blob);
        }}
      />
    </div>
  );
}

/** Why the camera couldn't start, and what to do about it on this device. */
function cameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return isIOS()
      ? 'Camera access is blocked. On iPhone or iPad, open Settings, Safari (or the app you opened this link in), Camera, and choose Allow. Then try again.'
      : 'Camera access is blocked. Tap the icon to the left of the web address, open Permissions, allow Camera, and try again. If that does not help, allow the camera for your browser in your phone settings (Apps, your browser, Permissions).';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Choose a photo from your library instead.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is busy in another app. Close it and try again.';
  return 'The camera could not start here. Choose a photo from your library instead, or open FridgeWise in Safari or Chrome.';
}

function WebcamCapture({ open, phone, onClose, onCapture }: { open: boolean; phone: boolean; onClose: () => void; onCapture: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    const start = async () => {
      const wanted = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      try {
        return await navigator.mediaDevices.getUserMedia({ video: wanted, audio: false });
      } catch (err) {
        // Some devices reject the size hints; any camera is better than none.
        if (err instanceof Error && err.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        throw err;
      }
    };
    start()
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        active = s;
        setStream(s);
        if (video.current) video.current.srcObject = s;
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(cameraError(err));
      });
    return () => {
      cancelled = true;
      active?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [open]);

  // The <video> mounts after the stream arrives on some browsers; attach it then too.
  useEffect(() => {
    if (stream && video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.92);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Take a photo"
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={capture} disabled={!stream} data-autofocus>
            <Camera size={18} aria-hidden data-anim="pop" /> Capture
          </button>
        </>
      }
    >
      {error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : (
        <div className="relative">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            className={`w-full rounded-2xl bg-ink object-contain ${phone ? 'aspect-[3/4] max-h-[60dvh]' : 'aspect-video'}`}
          />
          {!stream && <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">Starting the camera…</p>}
        </div>
      )}
    </Sheet>
  );
}
