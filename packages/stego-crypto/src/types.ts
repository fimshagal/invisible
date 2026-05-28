export const MAGIC = new Uint8Array([0x49, 0x4e, 0x56, 0x53]); // "INVS"
export const VERSION = 1;

/** Header: magic(4) + version(1) + payloadLength(4) = 9 bytes */
export const HEADER_SIZE = 9;

/** AES-256-GCM: salt(16) + iv(12) + authTag(16) = 44 bytes overhead */
export const CRYPTO_OVERHEAD = 44;

/** PBKDF2 iterations for key derivation */
export const PBKDF2_ITERATIONS = 100_000;

/** Bits embedded per pixel (R, G, B LSB) */
export const BITS_PER_PIXEL = 3;

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface EmbedResult {
  pngBlob: Blob;
  image: RgbaImage;
}

export interface CapacityInfo {
  /** Bytes available for payload (header + encrypted data) */
  maxPayloadBytes: number;
  /** Maximum plaintext message length (approximate) */
  maxMessageChars: number;
  /** Minimum width×height in pixels */
  pixelCount: number;
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
