import {
  BITS_PER_PIXEL,
  CRYPTO_OVERHEAD,
  HEADER_SIZE,
  MAX_OFFSET_PIXELS,
  type CapacityInfo,
  type RgbaImage,
} from './types';
import { pixelsNeededForBytes } from './stego';

/** Usable pixel count after reserving max random offset. */
export function getUsablePixels(width: number, height: number): number {
  return Math.max(0, width * height - MAX_OFFSET_PIXELS);
}

/** Total stego capacity in bytes after max offset reserve. */
export function getCapacityBytes(width: number, height: number): number {
  const totalBits = getUsablePixels(width, height) * BITS_PER_PIXEL;
  return Math.floor(totalBits / 8);
}

/** Max encrypted payload that fits (excluding stego header). */
export function getMaxPayloadBytes(width: number, height: number): number {
  return getCapacityBytes(width, height) - HEADER_SIZE;
}

/** Approximate max plaintext length (conservative UTF-8 estimate). */
export function getMaxMessageLength(width: number, height: number): number {
  const maxPayload = getMaxPayloadBytes(width, height);
  const maxPlaintext = maxPayload - CRYPTO_OVERHEAD;
  return Math.max(0, Math.floor(maxPlaintext / 2));
}

export function getCapacityInfo(width: number, height: number): CapacityInfo {
  const maxPayloadBytes = getMaxPayloadBytes(width, height);
  return {
    maxPayloadBytes,
    maxMessageChars: getMaxMessageLength(width, height),
    pixelCount: width * height,
    maxOffsetPixels: MAX_OFFSET_PIXELS,
  };
}

/** Minimum image dimensions to embed a message of given UTF-8 byte length. */
export function getMinimumDimensions(messageByteLength: number): {
  minPixels: number;
  minSide: number;
} {
  const stegoBytes = HEADER_SIZE + CRYPTO_OVERHEAD + messageByteLength;
  const minPixels =
    MAX_OFFSET_PIXELS + pixelsNeededForBytes(stegoBytes);
  const minSide = Math.ceil(Math.sqrt(minPixels));
  return { minPixels, minSide };
}

/** Total stego blob size: header + encrypted payload. */
export function bytesRequiredForPayload(encryptedPayloadSize: number): number {
  return HEADER_SIZE + encryptedPayloadSize;
}

export function bytesRequiredForMessage(messageUtf8Bytes: number): number {
  return bytesRequiredForPayload(CRYPTO_OVERHEAD + messageUtf8Bytes);
}

/** Check that image fits payload with worst-case max offset reserved. */
export function assertImageFits(
  image: RgbaImage,
  encryptedPayloadBytes: number,
): void {
  const stegoBytes = HEADER_SIZE + encryptedPayloadBytes;
  const pixelsNeeded = MAX_OFFSET_PIXELS + pixelsNeededForBytes(stegoBytes);
  const totalPixels = image.width * image.height;

  if (pixelsNeeded > totalPixels) {
    const { minSide } = getMinimumDimensions(encryptedPayloadBytes - CRYPTO_OVERHEAD);
    throw new Error(
      `Image ${image.width}×${image.height} is too small. ` +
        `Need ~${minSide}×${minSide} px or larger for this message.`,
    );
  }
}

/** Max allowed random offset for a concrete stego blob size. */
export function getMaxOffsetForPayload(
  totalPixels: number,
  stegoByteLength: number,
): number {
  const pixelsNeeded = pixelsNeededForBytes(stegoByteLength);
  return Math.min(MAX_OFFSET_PIXELS, totalPixels - pixelsNeeded);
}
