import {
  BITS_PER_PIXEL,
  CRYPTO_OVERHEAD,
  HEADER_SIZE,
  type CapacityInfo,
  type RgbaImage,
} from './types';

/** Total stego capacity in bytes for given image dimensions. */
export function getCapacityBytes(width: number, height: number): number {
  const totalBits = width * height * BITS_PER_PIXEL;
  return Math.floor(totalBits / 8);
}

/** Max encrypted payload that fits (excluding header). */
export function getMaxPayloadBytes(width: number, height: number): number {
  return getCapacityBytes(width, height) - HEADER_SIZE;
}

/** Approximate max plaintext length (UTF-8, worst-case expansion ~4× for AES). */
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
  };
}

/** Minimum image dimensions to embed a message of given UTF-8 byte length. */
export function getMinimumDimensions(messageByteLength: number): {
  minPixels: number;
  minSide: number;
} {
  const payloadBytes = HEADER_SIZE + CRYPTO_OVERHEAD + messageByteLength;
  const totalBits = payloadBytes * 8;
  const minPixels = Math.ceil(totalBits / BITS_PER_PIXEL);
  const minSide = Math.ceil(Math.sqrt(minPixels));
  return { minPixels, minSide };
}

/** Bytes required to embed encrypted payload of given size. */
export function bytesRequiredForPayload(encryptedPayloadSize: number): number {
  return HEADER_SIZE + encryptedPayloadSize;
}

export function bytesRequiredForMessage(messageUtf8Bytes: number): number {
  return bytesRequiredForPayload(CRYPTO_OVERHEAD + messageUtf8Bytes);
}

export function assertImageFits(
  image: RgbaImage,
  requiredPayloadBytes: number,
): void {
  const available = getMaxPayloadBytes(image.width, image.height);
  if (requiredPayloadBytes > available) {
    const { minSide } = getMinimumDimensions(
      requiredPayloadBytes - CRYPTO_OVERHEAD,
    );
    throw new Error(
      `Image ${image.width}×${image.height} is too small. ` +
        `Need ~${minSide}×${minSide} px or larger for this message.`,
    );
  }
}
