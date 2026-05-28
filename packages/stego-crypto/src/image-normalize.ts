import type { RgbaImage } from './types';

/**
 * Composite every non-opaque pixel onto white (source-over).
 * Semi-transparent areas look as if the image were placed on a white background.
 */
export function flattenAlphaOntoWhite(data: Uint8ClampedArray): boolean {
  let hadTransparency = false;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255) continue;

    hadTransparency = true;
    const alpha = a / 255;
    const inv = 1 - alpha;
    data[i] = Math.round(data[i] * alpha + 255 * inv);
    data[i + 1] = Math.round(data[i + 1] * alpha + 255 * inv);
    data[i + 2] = Math.round(data[i + 2] * alpha + 255 * inv);
    data[i + 3] = 255;
  }

  return hadTransparency;
}

/** @deprecated Use flattenAlphaOntoWhite */
export const normalizeTransparentPixels = flattenAlphaOntoWhite;

export function cloneRgbaImage(image: RgbaImage): RgbaImage {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}
