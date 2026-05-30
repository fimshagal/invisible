import { convertIndexedToRgb, decode, encode, hasPngSignature } from 'fast-png';
import type { RgbaImage } from './types';

export function isPngBytes(data: Uint8Array): boolean {
  return hasPngSignature(data);
}

function rgbToRgba(rgb: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i];
    rgba[j + 1] = rgb[i + 1];
    rgba[j + 2] = rgb[i + 2];
    rgba[j + 3] = 255;
  }
  return rgba;
}

function indexedToRgba(png: ReturnType<typeof decode>): Uint8ClampedArray {
  const rgb = convertIndexedToRgb(png);
  const rgba = rgbToRgba(rgb, png.width, png.height);
  if (png.transparency) {
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      if (png.transparency[p] === 0) rgba[i + 3] = 0;
    }
  }
  return rgba;
}

function decodeLosslessRgba(data: Uint8Array): RgbaImage | null {
  const png = decode(data);
  if (png.depth !== 8) return null;

  if (png.channels === 4) {
    return {
      width: png.width,
      height: png.height,
      data: new Uint8ClampedArray(png.data as Uint8Array),
    };
  }

  if (png.channels === 3) {
    return {
      width: png.width,
      height: png.height,
      data: rgbToRgba(png.data as Uint8Array, png.width, png.height),
    };
  }

  if (png.palette) {
    return {
      width: png.width,
      height: png.height,
      data: indexedToRgba(png),
    };
  }

  return null;
}

/** Lossless PNG encode — preserves every RGBA byte (canvas does not). */
export function encodePngBytes(image: RgbaImage): Uint8Array {
  return encode({
    width: image.width,
    height: image.height,
    data: image.data,
    depth: 8,
    channels: 4,
  });
}

export async function loadImageViaCanvas(file: File | Blob): Promise<RgbaImage> {
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
  return {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8ClampedArray(imageData.data),
  };
}

export async function loadImageFromBytes(bytes: Uint8Array): Promise<RgbaImage> {
  if (isPngBytes(bytes)) {
    const lossless = decodeLosslessRgba(bytes);
    if (lossless) return lossless;
  }
  return loadImageViaCanvas(new Blob([Uint8Array.from(bytes)]));
}
