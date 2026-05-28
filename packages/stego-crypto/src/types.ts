export const MAGIC = new Uint8Array([0x49, 0x4e, 0x56, 0x53]); // "INVS"

/** Legacy format: header starts at pixel (0,0), no offset field */
export const VERSION_V1 = 1;

/** Current format: random pixel offset + offset stored in header */
export const VERSION = 2;

/** v1: magic(4) + version(1) + payloadLength(4) */
export const HEADER_SIZE_V1 = 9;

/** v2: magic(4) + version(1) + offsetPixels(2) + payloadLength(4) */
export const HEADER_SIZE = 11;

/**
 * Fixed 2-byte bootstrap at the start of the LSB stream (always pixel 0).
 * Stores offsetPixels so the decoder knows where the main header lives.
 * This is NOT the PNG file header and NOT the filename — just hidden bits in the image.
 */
export const OFFSET_BOOTSTRAP_SIZE = 2;

/** Max random start offset — roughly a 10×10 px zone (100 pixels) */
export const MAX_OFFSET_PIXELS = 100;

/** AES-256-GCM: salt(16) + iv(12) + authTag(16) = 44 bytes overhead */
export const CRYPTO_OVERHEAD = 44;

/** PBKDF2 iterations for key derivation */
export const PBKDF2_ITERATIONS = 100_000;

/** Bits embedded per pixel (R, G, B LSB) */
export const BITS_PER_PIXEL = 3;

export interface StegoHeader {
  version: number;
  offsetPixels: number;
  payloadLength: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface EmbedResult {
  pngBlob: Blob;
  image: RgbaImage;
  /** Pixel offset where the main stego header was written */
  offsetPixels: number;
}

export interface CapacityInfo {
  maxPayloadBytes: number;
  maxMessageChars: number;
  pixelCount: number;
  /** Reserved pixels at the top-left due to max random offset */
  maxOffsetPixels: number;
}

export class StegoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StegoError';
  }
}

export class ImageTooSmallError extends StegoError {
  readonly requiredBytes: number;
  readonly availableBytes: number;

  constructor(required: number, available: number) {
    super(
      `Image too small: need ${required} bytes capacity, have ${available}. ` +
        `Try a larger image or a shorter message.`,
    );
    this.name = 'ImageTooSmallError';
    this.requiredBytes = required;
    this.availableBytes = available;
  }
}

export class DecryptError extends StegoError {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptError';
  }
}
