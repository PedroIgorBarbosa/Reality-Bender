export type CameraFacingMode = 'environment' | 'user';

export type CameraErrorCode =
  | 'HTTPS_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_IN_USE'
  | 'OVERCONSTRAINED'
  | 'UNSUPPORTED_BROWSER'
  | 'UNKNOWN_CAMERA_ERROR';

export class CameraCaptureError extends Error {
  constructor(
    public readonly code: CameraErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CameraCaptureError';
  }
}

export interface MediaStreamConfig {
  facingMode: CameraFacingMode;
  widthIdeal: number;
  heightIdeal: number;
  frameRateIdeal: number;
}

export const DEFAULT_CAMERA_CONFIG: MediaStreamConfig = Object.freeze({
  facingMode: 'environment',
  widthIdeal: 1280,
  heightIdeal: 720,
  frameRateIdeal: 30,
});

export interface CameraEnvironmentDeps {
  isSecureContext?: boolean;
  hostname?: string;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

export function mapMediaError(error: unknown): CameraCaptureError {
  if (error instanceof CameraCaptureError) return error;
  const name = (error as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return new CameraCaptureError(
      'PERMISSION_DENIED',
      'Permissão da câmera negada. Autorize o acesso à câmera nas configurações do navegador.',
    );
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new CameraCaptureError('DEVICE_NOT_FOUND', 'Nenhuma câmera disponível foi encontrada no dispositivo.');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new CameraCaptureError('DEVICE_IN_USE', 'A câmera está ocupada por outro aplicativo.');
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return new CameraCaptureError('OVERCONSTRAINED', 'A câmera não suporta a resolução solicitada.');
  }
  return new CameraCaptureError('UNKNOWN_CAMERA_ERROR', 'Não foi possível iniciar a câmera do dispositivo.');
}

export class CameraCaptureService {
  private currentStream: MediaStream | null = null;
  private currentFacingMode: CameraFacingMode = 'environment';

  constructor(private readonly deps: CameraEnvironmentDeps = {}) {}

  public getStream(): MediaStream | null {
    return this.currentStream;
  }

  public getFacingMode(): CameraFacingMode {
    return this.currentFacingMode;
  }

  private resolveGetUserMedia(): (constraints: MediaStreamConstraints) => Promise<MediaStream> {
    const secure =
      this.deps.isSecureContext ??
      (typeof window !== 'undefined' ? Boolean(window.isSecureContext) : true);
    const host =
      this.deps.hostname ??
      (typeof window !== 'undefined' && window.location ? window.location.hostname : 'localhost');

    if (!secure && !isLocalhostHost(host)) {
      throw new CameraCaptureError(
        'HTTPS_REQUIRED',
        'A captura de câmera no celular exige conexão HTTPS segura (ou localhost).',
      );
    }

    if (this.deps.getUserMedia) {
      return this.deps.getUserMedia;
    }

    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    ) {
      return navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    }

    throw new CameraCaptureError(
      'UNSUPPORTED_BROWSER',
      'Este navegador não suporta navigator.mediaDevices.getUserMedia.',
    );
  }

  public async requestCamera(config: Partial<MediaStreamConfig> = {}): Promise<MediaStream> {
    const merged: MediaStreamConfig = { ...DEFAULT_CAMERA_CONFIG, ...config };
    const getUserMedia = this.resolveGetUserMedia();

    this.stopCamera();

    const primaryConstraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: merged.facingMode },
        width: { ideal: merged.widthIdeal },
        height: { ideal: merged.heightIdeal },
        frameRate: { ideal: merged.frameRateIdeal, max: 60 },
      },
    };

    try {
      const stream = await getUserMedia(primaryConstraints);
      this.currentStream = stream;
      this.currentFacingMode = merged.facingMode;
      return stream;
    } catch (err: unknown) {
      const mapped = mapMediaError(err);
      if (mapped.code === 'OVERCONSTRAINED') {
        try {
          const fallbackStream = await getUserMedia({
            audio: false,
            video: { facingMode: merged.facingMode },
          });
          this.currentStream = fallbackStream;
          this.currentFacingMode = merged.facingMode;
          return fallbackStream;
        } catch (fallbackErr) {
          throw mapMediaError(fallbackErr);
        }
      }
      throw mapped;
    }
  }

  public async switchCamera(): Promise<MediaStream> {
    const nextMode: CameraFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    return this.requestCamera({ facingMode: nextMode });
  }

  public stopCamera(): void {
    if (!this.currentStream) return;
    for (const track of this.currentStream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore already stopped track errors
      }
    }
    this.currentStream = null;
  }
}
