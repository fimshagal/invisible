import { encryptMessage, decryptMessage } from './crypto';
import {
  loadAudioFromFile,
  embedMessageInAudio,
  extractMessageFromAudio,
} from './audio';
import {
  buildStegoPayload,
  embedBytesInImage,
  extractBytesFromImage,
  parseStegoPayload,
  pickRandomOffset,
  readHeader,
  readOffsetBootstrap,
  writeOffsetBootstrap,
  headerSizeFor,
} from './stego';
import {
  assertImageFits,
  bytesRequiredForMessage,
  getCapacityInfo,
  getMaxPayloadBytes,
} from './capacity';
import {
  HEADER_SIZE,
  HEADER_SIZE_V1,
  ImageTooSmallError,
  OFFSET_BOOTSTRAP_SIZE,
  VERSION,
  VERSION_V1,
  type EmbedResult,
  type RgbaImage,
  DecryptError,
} from './types';
import type { PcmAudio } from './audio-types';
import { flattenAlphaOntoWhite } from './image-normalize';

const encoder = new TextEncoder();

export async function loadImageFromFile(file: File | Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not available');

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = new Uint8ClampedArray(imageData.data);
  flattenAlphaOntoWhite(data);

  return {
    width: canvas.width,
    height: canvas.height,
    data,
  };
}

export async function rgbaToPngBlob(image: RgbaImage): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  const imageData = new ImageData(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
      'image/png',
    );
  });
}

export async function embedMessageInImage(
  image: RgbaImage,
  message: string,
  secret: string,
): Promise<EmbedResult> {
  const messageBytes = encoder.encode(message).length;
  const required = bytesRequiredForMessage(messageBytes);
  const available = getMaxPayloadBytes(image.width, image.height);

  if (required > available + HEADER_SIZE) {
    throw new ImageTooSmallError(required, available + HEADER_SIZE);
  }

  const encrypted = await encryptMessage(message, secret);
  assertImageFits(image, encrypted.length);

  const totalPixels = image.width * image.height;
  const offsetPixels = pickRandomOffset(totalPixels, HEADER_SIZE + encrypted.length);
  const stegoBytes = buildStegoPayload(encrypted, offsetPixels);
  const bootstrap = writeOffsetBootstrap(offsetPixels);

  let newData = embedBytesInImage(image.data, bootstrap, 0);
  newData = embedBytesInImage(newData, stegoBytes, offsetPixels * 4);

  const resultImage: RgbaImage = {
    width: image.width,
    height: image.height,
    data: newData,
  };

  const pngBlob = await rgbaToPngBlob(resultImage);
  return { pngBlob, image: resultImage, offsetPixels };
}

function resolveStegoLocation(image: RgbaImage): {
  offsetPixels: number;
  headerInfo: NonNullable<ReturnType<typeof readHeader>>;
} {
  const totalPixels = image.width * image.height;

  // Legacy v1: header starts at pixel (0,0)
  const legacyHeaderBytes = extractBytesFromImage(image.data, HEADER_SIZE_V1, 0);
  const legacyHeader = readHeader(legacyHeaderBytes);
  if (legacyHeader?.version === VERSION_V1) {
    const headerSize = headerSizeFor(VERSION_V1);
    const totalBytes = headerSize + legacyHeader.payloadLength;
    const maxAvailable = getMaxPayloadBytes(image.width, image.height) + headerSize;
    if (totalBytes <= maxAvailable) {
      return { offsetPixels: 0, headerInfo: legacyHeader };
    }
  }

  // v2: bootstrap at LSB stream start → main header at offsetPixels
  const bootstrapBytes = extractBytesFromImage(
    image.data,
    OFFSET_BOOTSTRAP_SIZE,
    0,
  );
  const offsetPixels = readOffsetBootstrap(bootstrapBytes);

  if (offsetPixels >= totalPixels) {
    throw new DecryptError('Invalid offset bootstrap in image');
  }

  const headerSize = headerSizeFor(VERSION);
  const headerBytes = extractBytesFromImage(
    image.data,
    headerSize,
    offsetPixels * 4,
  );
  const headerInfo = readHeader(headerBytes);

  if (!headerInfo || headerInfo.version !== VERSION) {
    throw new DecryptError(
      'No hidden message found in this image (invalid or missing stego header)',
    );
  }

  if (headerInfo.offsetPixels !== offsetPixels) {
    throw new DecryptError('Stego header offset mismatch — image may be corrupted');
  }

  return { offsetPixels, headerInfo };
}

export async function extractMessageFromImage(
  image: RgbaImage,
  secret: string,
): Promise<string> {
  const { offsetPixels, headerInfo } = resolveStegoLocation(image);
  const headerSize = headerSizeFor(headerInfo.version);
  const totalBytes = headerSize + headerInfo.payloadLength;
  const totalPixels = image.width * image.height;
  const maxAvailable =
    (totalPixels - offsetPixels) * 3 >= totalBytes * 8;

  if (!maxAvailable) {
    throw new DecryptError('Corrupted stego header — payload length exceeds image capacity');
  }

  const fullPayload = extractBytesFromImage(
    image.data,
    totalBytes,
    offsetPixels * 4,
  );
  const encrypted = parseStegoPayload(fullPayload, headerInfo);

  if (!encrypted) {
    throw new DecryptError('Failed to parse hidden payload');
  }

  return decryptMessage(encrypted, secret);
}

export async function decryptFromFile(
  file: File | Blob,
  secret: string,
): Promise<string> {
  if (detectMediaKind(file) === 'audio') {
    const { pcm } = await loadAudioFromFile(file);
    return extractMessageFromAudio(pcm, secret);
  }

  const image = await loadImageFromFile(file);
  return extractMessageFromImage(image, secret);
}

export async function encryptToFile(
  file: File | Blob,
  message: string,
  secret: string,
): Promise<Blob> {
  const kind = detectMediaKind(file);

  if (kind === 'audio') {
    const { pcm } = await loadAudioFromFile(file);
    const { wavBlob } = await embedMessageInAudio(pcm, message, secret);
    return wavBlob;
  }

  const image = await loadImageFromFile(file);
  const { pngBlob } = await embedMessageInImage(image, message, secret);
  return pngBlob;
}

export type MediaKind = 'image' | 'audio';

export interface MediaEmbedResult {
  kind: MediaKind;
  blob: Blob;
  extension: 'png' | 'wav';
}

export function detectMediaKind(
  file: File | Blob & { name?: string; type?: string },
): MediaKind {
  const type = 'type' in file ? file.type : '';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('image/')) return 'image';

  const name = ('name' in file ? file.name : '') ?? '';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'webm', 'opus'].includes(ext)) {
    return 'audio';
  }

  return 'image';
}

export async function embedMessageInMedia(
  kind: MediaKind,
  source: RgbaImage | PcmAudio,
  message: string,
  secret: string,
): Promise<MediaEmbedResult> {
  if (kind === 'audio') {
    const { wavBlob } = await embedMessageInAudio(source as PcmAudio, message, secret);
    return { kind: 'audio', blob: wavBlob, extension: 'wav' };
  }

  const { pngBlob } = await embedMessageInImage(source as RgbaImage, message, secret);
  return { kind: 'image', blob: pngBlob, extension: 'png' };
}

export {
  getCapacityInfo,
  getCapacityBytes,
  getMaxPayloadBytes,
  getMaxMessageLength,
  getMinimumDimensions,
  bytesRequiredForMessage,
  getMaxOffsetForPayload,
} from './capacity';

export { encryptMessage, decryptMessage } from './crypto';
export {
  embedBytesInImage,
  extractBytesFromImage,
  buildStegoPayload,
  parseStegoPayload,
  pickRandomOffset,
  readHeader,
  writeHeader,
  readOffsetBootstrap,
  writeOffsetBootstrap,
} from './stego';

export {
  loadAudioFromFile,
  embedMessageInAudio,
  extractMessageFromAudio,
  pcmToWavBlob,
  audioBufferToPcm,
  getAudioCapacityInfo,
  getAudioCapacityBytes,
  getAudioMaxPayloadBytes,
  getAudioMaxMessageLength,
  getMinimumAudioDuration,
} from './audio';

export * from './audio-types';

export { flattenAlphaOntoWhite, normalizeTransparentPixels } from './image-normalize';

export * from './types';
