/** Lectura crua de posició (del GPS real o simulada). */
export interface PositionReading {
  lon: number;
  lat: number;
  /** Precisió horitzontal en metres. */
  accuracy: number;
  /** Mil·lisegons des de l'època. */
  timestamp: number;
  /** Rumb en graus si el proveïdor el dona. */
  heading?: number | null;
  /** Velocitat en m/s si el proveïdor la dona. */
  speed?: number | null;
}

export type PositionListener = (reading: PositionReading) => void;
export type PositionErrorListener = (error: PositionSourceError) => void;

export type PositionSourceErrorCode = 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'TIMEOUT';

export interface PositionSourceError {
  code: PositionSourceErrorCode;
  message: string;
}

/** Font de posició intercanviable: GPS real o simulació. */
export interface PositionSource {
  readonly kind: 'real' | 'sim';
  start(): void;
  stop(): void;
  onReading(listener: PositionListener): () => void;
  onError(listener: PositionErrorListener): () => void;
}

/** Orientació del dispositiu (ja filtrada o crua). */
export interface OrientationReading {
  /** Rumb geogràfic en graus [0, 360), 0 = nord. */
  heading: number;
  /** Inclinació en graus: 0 = horitzontal (apuntant a l'horitzó), positiu = cap amunt. */
  pitch: number;
  /** Magnitud de la velocitat de rotació (graus/s), si es coneix. */
  rotationRate: number;
  /** Precisió de la brúixola en graus (iOS), si es coneix. */
  compassAccuracy: number | null;
  timestamp: number;
}

export type OrientationListener = (reading: OrientationReading) => void;

export interface OrientationSource {
  readonly kind: 'real' | 'sim';
  /** Ha de cridar-se des d'un gest de l'usuari (iOS). */
  requestPermission(): Promise<'granted' | 'denied' | 'unsupported'>;
  start(): void;
  stop(): void;
  onReading(listener: OrientationListener): () => void;
}
