import { encryptMessage, decryptMessage } from './crypto';
import {
  buildStegoPayload,
  embedBytesInImage,
  extractBytesFromImage,
  parseStegoPayload,
} from './stego';
import { readHeader } from './stego';
import {
  assertImageFits,
  bytesRequiredForMessage,
  getCapacityInfo,
  getMaxPayloadBytes,
} from './capacity';
import {
  HEADER_SIZE,
  ImageTooSmallError,
  type EmbedResult,
  type RgbaImage,
  DecryptError,
} from './types';

const encoder = new TextEncoder();

export async function loadImageFromFile(file: File | Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8ClampedArray(imageData.data),
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

  if (required > available) {
    throw new ImageTooSmallError(required, available);
  }

  const encrypted = await encryptMessage(message, secret);
  const stegoBytes = buildStegoPayload(encrypted);

  assertImageFits(image, encrypted.length);

  const newData = embedBytesInImage(image.data, stegoBytes);
  const resultImage: RgbaImage = {
    width: image.width,
    height: image.height,
    data: newData,
  };

  const pngBlob = await rgbaToPngBlob(resultImage);
  return { pngBlob, image: resultImage };
}

export async function extractMessageFromImage(
  image: RgbaImage,
  secret: string,
): Promise<string> {
  const headerBytes = extractBytesFromImage(image.data, HEADER_SIZE);
  const headerInfo = readHeader(headerBytes);

  if (!headerInfo) {
    throw new DecryptError(
      'No hidden message found in this image (invalid or missing stego header)',
    );
  }

  const totalBytes = HEADER_SIZE + headerInfo.payloadLength;
  const maxAvailable = getMaxPayloadBytes(image.width, image.height) + HEADER_SIZE;

  if (totalBytes > maxAvailable) {
    throw new DecryptError('Corrupted stego header — payload length exceeds image capacity');
  }

  const fullPayload = extractBytesFromImage(image.data, totalBytes);
  const encrypted = parseStegoPayload(fullPayload);

  if (!encrypted) {
    throw new DecryptError('Failed to parse hidden payload');
  }

  return decryptMessage(encrypted, secret);
}

export async function decryptFromFile(
  file: File | Blob,
  secret: string,
): Promise<string> {
  const image = await loadImageFromFile(file);
  return extractMessageFromImage(image, secret);
}

export async function encryptToFile(
  file: File | Blob,
  message: string,
  secret: string,
): Promise<Blob> {
  const image = await loadImageFromFile(file);
  const { pngBlob } = await embedMessageInImage(image, message, secret);
  return pngBlob;
}

export {
  getCapacityInfo,
  getMaxPayloadBytes,
  getMaxMessageLength,
  getMinimumDimensions,
  bytesRequiredForMessage,
} from './capacity';

export { encryptMessage, decryptMessage } from './crypto';
export {
  embedBytesInImage,
  extractBytesFromImage,
  buildStegoPayload,
  parseStegoPayload,
} from './stego';

export * from './types';
