import {
  BITS_PER_PIXEL,
  CRYPTO_OVERHEAD,
  HEADER_SIZE,
  HEADER_SIZE_V1,
  MAX_OFFSET_PIXELS,
  OFFSET_BOOTSTRAP_SIZE,
  VERSION,
  VERSION_V1,
  type CapacityInfo,
  type RgbaImage,
  type StegoHeader,
} from './types';

function writeUint16BE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, false);
}

function writeUint32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false);
}

export function writeHeader(
  payloadLength: number,
  offsetPixels: number,
  version: number = VERSION,
): Uint8Array {
  const size = version === VERSION_V1 ? HEADER_SIZE_V1 : HEADER_SIZE;
  const header = new Uint8Array(size);
  const view = new DataView(header.buffer);

  header.set([0x49, 0x4e, 0x56, 0x53], 0);
  header[4] = version;

  if (version === VERSION_V1) {
    writeUint32BE(view, 5, payloadLength);
  } else {
    writeUint16BE(view, 5, offsetPixels);
    writeUint32BE(view, 7, payloadLength);
  }

  return header;
}

export function readHeader(data: Uint8Array): StegoHeader | null {
  if (data.length < HEADER_SIZE_V1) return null;

  if (data[0] !== 0x49 || data[1] !== 0x4e || data[2] !== 0x56 || data[3] !== 0x53) {
    return null;
  }

  const version = data[4];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (version === VERSION_V1) {
    if (data.length < HEADER_SIZE_V1) return null;
    return {
      version: VERSION_V1,
      offsetPixels: 0,
      payloadLength: view.getUint32(5, false),
    };
  }

  if (version === VERSION) {
    if (data.length < HEADER_SIZE) return null;
    return {
      version: VERSION,
      offsetPixels: view.getUint16(5, false),
      payloadLength: view.getUint32(7, false),
    };
  }

  return null;
}

export function writeOffsetBootstrap(offsetPixels: number): Uint8Array {
  const bytes = new Uint8Array(OFFSET_BOOTSTRAP_SIZE);
  new DataView(bytes.buffer).setUint16(0, offsetPixels, false);
  return bytes;
}

export function readOffsetBootstrap(data: Uint8Array): number {
  if (data.length < OFFSET_BOOTSTRAP_SIZE) return 0;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(0, false);
}

/** Embed raw bytes into RGB LSBs starting at a byte offset in the RGBA buffer. */
export function embedBytesInImage(
  pixels: Uint8ClampedArray,
  bytes: Uint8Array,
  startRgbaIndex = 0,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  let bitIndex = 0;
  const totalBits = bytes.length * 8;

  for (let i = startRgbaIndex; i < out.length && bitIndex < totalBits; i += 4) {
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

/** Extract raw bytes from RGB LSBs starting at a byte offset in the RGBA buffer. */
export function extractBytesFromImage(
  pixels: Uint8ClampedArray,
  byteCount: number,
  startRgbaIndex = 0,
): Uint8Array {
  const out = new Uint8Array(byteCount);
  let bitIndex = 0;
  const totalBits = byteCount * 8;

  for (let i = startRgbaIndex; i < pixels.length && bitIndex < totalBits; i += 4) {
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

export function buildStegoPayload(
  encryptedPayload: Uint8Array,
  offsetPixels: number,
): Uint8Array {
  const header = writeHeader(encryptedPayload.length, offsetPixels, VERSION);
  const combined = new Uint8Array(header.length + encryptedPayload.length);
  combined.set(header, 0);
  combined.set(encryptedPayload, header.length);
  return combined;
}

export function parseStegoPayload(
  extracted: Uint8Array,
  headerInfo: StegoHeader,
): Uint8Array | null {
  const headerSize = headerInfo.version === VERSION_V1 ? HEADER_SIZE_V1 : HEADER_SIZE;
  const totalNeeded = headerSize + headerInfo.payloadLength;
  if (extracted.length < totalNeeded) return null;
  return extracted.slice(headerSize, totalNeeded);
}

export function pixelsNeededForBytes(byteLength: number): number {
  return Math.ceil((byteLength * 8) / BITS_PER_PIXEL);
}

/** Pick a random pixel offset that still fits the stego blob in the image. */
export function pickRandomOffset(totalPixels: number, stegoByteLength: number): number {
  const pixelsNeeded = pixelsNeededForBytes(stegoByteLength);
  const maxBySize = totalPixels - pixelsNeeded;
  const maxOffset = Math.min(MAX_OFFSET_PIXELS, maxBySize);

  if (maxOffset < 0) {
    throw new Error('Image too small for payload even without offset');
  }

  return Math.floor(Math.random() * (maxOffset + 1));
}

export function headerSizeFor(version: number): number {
  return version === VERSION_V1 ? HEADER_SIZE_V1 : HEADER_SIZE;
}
