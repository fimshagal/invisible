import { BITS_PER_PIXEL, HEADER_SIZE, MAGIC, VERSION } from './types';

function writeHeader(payloadLength: number): Uint8Array {
  const header = new Uint8Array(HEADER_SIZE);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  const view = new DataView(header.buffer);
  view.setUint32(5, payloadLength, false);
  return header;
}

function readHeader(data: Uint8Array): { payloadLength: number } | null {
  if (data.length < HEADER_SIZE) return null;
  for (let i = 0; i < MAGIC.length; i++) {
    if (data[i] !== MAGIC[i]) return null;
  }
  if (data[4] !== VERSION) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const payloadLength = view.getUint32(5, false);
  return { payloadLength };
}

/** Embed raw bytes into RGB LSBs of pixel data (RGBA, row-major). */
export function embedBytesInImage(
  pixels: Uint8ClampedArray,
  bytes: Uint8Array,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  let bitIndex = 0;
  const totalBits = bytes.length * 8;

  for (let i = 0; i < out.length && bitIndex < totalBits; i += 4) {
    for (let c = 0; c < 3 && bitIndex < totalBits; c++) {
      const byteIdx = Math.floor(bitIndex / 8);
      const bitPos = 7 - (bitIndex % 8);
      const bit = (bytes[byteIdx] >> bitPos) & 1;
      out[i + c] = (out[i + c] & 0xfe) | bit;
      bitIndex++;
    }
  }

  return out;
}

/** Extract raw bytes from RGB LSBs. */
export function extractBytesFromImage(
  pixels: Uint8ClampedArray,
  byteCount: number,
): Uint8Array {
  const out = new Uint8Array(byteCount);
  let bitIndex = 0;
  const totalBits = byteCount * 8;

  for (let i = 0; i < pixels.length && bitIndex < totalBits; i += 4) {
    for (let c = 0; c < 3 && bitIndex < totalBits; c++) {
      const byteIdx = Math.floor(bitIndex / 8);
      const bitPos = 7 - (bitIndex % 8);
      const bit = pixels[i + c] & 1;
      out[byteIdx] |= bit << bitPos;
      bitIndex++;
    }
  }

  return out;
}

/** Build full stego blob: header + encrypted payload, then embed. */
export function buildStegoPayload(encryptedPayload: Uint8Array): Uint8Array {
  const header = writeHeader(encryptedPayload.length);
  const combined = new Uint8Array(header.length + encryptedPayload.length);
  combined.set(header, 0);
  combined.set(encryptedPayload, header.length);
  return combined;
}

/** Parse header from extracted bytes; returns payload slice or null. */
export function parseStegoPayload(extracted: Uint8Array): Uint8Array | null {
  const headerInfo = readHeader(extracted);
  if (!headerInfo) return null;

  const { payloadLength } = headerInfo;
  const totalNeeded = HEADER_SIZE + payloadLength;
  if (extracted.length < totalNeeded) return null;

  return extracted.slice(HEADER_SIZE, totalNeeded);
}

/** Minimum pixels needed for a byte array of given length. */
export function pixelsNeededForBytes(byteLength: number): number {
  return Math.ceil((byteLength * 8) / BITS_PER_PIXEL);
}

export { readHeader, writeHeader };
