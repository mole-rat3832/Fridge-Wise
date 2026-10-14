// Photo input for every platform:
//  * phones: camera via <input type="file" accept="image/*" capture="environment"> (works in iOS Safari),
//    plus a separate input for the photo library
//  * desktop: file picker, drag and drop, and a webcam capture (getUserMedia)
import { Camera, ImagePlus, Upload, Video } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ErrorNote, Sheet } from './ui';

function hasWebcamApi(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export function ImagePicker({ onPick, disabled }: { onPick: (file: Blob) => void; disabled?: boolean }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touch = isTouchDevice();

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
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { take(e.target.files); e.target.value = ''; }} aria-hidden />
      <input ref={libraryInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { take(e.target.files); e.target.value = ''; }} aria-hidden />

      {touch ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" className="btn btn-primary min-h-16 text-base" disabled={disabled} onClick={() => cameraInput.current?.click()}>
            <Camera size={22} aria-hidden /> Take a photo
          </button>
          <button type="button" className="btn btn-secondary min-h-16 text-base" disabled={disabled} onClick={() => libraryInput.current?.click()}>
            <ImagePlus size={22} aria-hidden /> Choose from library
          </button>
        </div>
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
          <Upload size={32} className="text-fg-2" aria-hidden />
          <p className="font-semibold">Drag a photo here</p>
          <p className="text-sm text-fg-2">or</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => libraryInput.current?.click()}>
              <ImagePlus size={18} aria-hidden /> Choose a file
            </button>
            {hasWebcamApi() && (
              <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => setWebcamOpen(true)}>
                <Video size={18} aria-hidden /> Use webcam
              </button>
            )}
          </div>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <WebcamCapture
        open={webcamOpen}
        onClose={() => setWebcamOpen(false)}
        onCapture={(blob) => {
          setWebcamOpen(false);
          onPick(blob);
        }}
      />
    </div>
  );
}

function WebcamCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        active = s;
        setStream(s);
        if (video.current) video.current.srcObject = s;
      })
      .catch((err: Error) => {
        setError(err.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser to use the webcam.' : 'No camera was found.');
      });
    return () => {
      cancelled = true;
      active?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [open]);

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
            <Camera size={18} aria-hidden /> Capture
          </button>
        </>
      }
    >
      {error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : (
        <video ref={video} autoPlay playsInline muted className="aspect-video w-full rounded-2xl bg-ink object-contain" />
      )}
    </Sheet>
  );
}
