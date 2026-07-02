// The camera controller: owns the MediaStream, exposes reactive state, and maps
// getUserMedia failures to friendly error kinds for the fallback screen.

export type CameraStatus = 'idle' | 'requesting' | 'live' | 'error';
export type CameraError =
  | 'unsupported'
  | 'insecure'
  | 'notfound'
  | 'denied'
  | 'inuse'
  | 'disconnected'
  | 'overconstrained'
  | 'unknown';

type CameraState = {
  status: CameraStatus;
  error: CameraError | null;
  devices: MediaDeviceInfo[];
  deviceId: string | null;
};

export const camera = $state<CameraState>({
  status: 'idle',
  error: null,
  devices: [],
  deviceId: null,
});

let stream: MediaStream | null = null;
let videoEl: HTMLVideoElement | null = null;

function stopStream(): void {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
}

function attachToVideo(): void {
  if (videoEl && stream) {
    videoEl.srcObject = stream;
    void videoEl.play?.().catch(() => {});
  }
}

export function bindVideo(el: HTMLVideoElement | null): void {
  videoEl = el;
  attachToVideo();
}

/** The live camera stream, so extra previews (e.g. the effects grid) can share it. */
export function cameraStream(): MediaStream | null {
  return stream;
}

function mapError(e: unknown): CameraError {
  const name = e instanceof DOMException ? e.name : '';
  switch (name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'notfound';
    case 'OverconstrainedError':
      return 'overconstrained';
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'inuse';
    default:
      return 'unknown';
  }
}

async function refreshDevices(): Promise<void> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    camera.devices = all.filter((d) => d.kind === 'videoinput');
  } catch {
    /* ignore — device list is a nicety, not required */
  }
}

export async function startCamera(deviceId?: string): Promise<void> {
  if (!window.isSecureContext) {
    camera.status = 'error';
    camera.error = 'insecure';
    return;
  }
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    camera.status = 'error';
    camera.error = 'unsupported';
    return;
  }

  camera.status = 'requesting';
  camera.error = null;
  stopStream();

  const video: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'OverconstrainedError') {
      // Retry once without resolution hints for stubborn cameras.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        });
      } catch (e2) {
        camera.status = 'error';
        camera.error = mapError(e2);
        return;
      }
    } else {
      camera.status = 'error';
      camera.error = mapError(e);
      return;
    }
  }

  const track = stream.getVideoTracks()[0];
  camera.deviceId = track?.getSettings().deviceId ?? deviceId ?? null;
  track?.addEventListener('ended', () => {
    camera.status = 'error';
    camera.error = 'disconnected';
    stopStream();
  });

  camera.status = 'live';
  attachToVideo();
  await refreshDevices();
}

export async function switchCamera(deviceId: string): Promise<void> {
  await startCamera(deviceId);
}

export function stopCamera(): void {
  stopStream();
  camera.status = 'idle';
}
