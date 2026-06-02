// Client-side only — uses browser Canvas API.
// Import this only inside 'use client' components.

import { DocType, SignatureEntry } from './types';
import { SIGNATURE_REGIONS, SignatureRegion } from './signatureRegions';
import { DOC_TYPE_OPTIONS } from './fieldParsers';

function cropRegion(
  img: HTMLImageElement,
  region: SignatureRegion
): string {
  const sw = Math.round(img.naturalWidth  * region.w);
  const sh = Math.round(img.naturalHeight * region.h);
  const sx = Math.round(img.naturalWidth  * region.x);
  const sy = Math.round(img.naturalHeight * region.y);

  const canvas = document.createElement('canvas');
  canvas.width  = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d')!;

  // White background so transparent PNGs look clean
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function extractSignatures(
  blobUrl: string,
  docType: DocType,
  fileName: string
): Promise<Omit<SignatureEntry, 'id' | 'status'>[]> {
  const regions = SIGNATURE_REGIONS[docType];
  if (!regions?.length) return [];

  const docLabel =
    DOC_TYPE_OPTIONS.find((o) => o.value === docType)?.label ?? docType;

  const img = await loadImage(blobUrl);

  return regions.map((region) => ({
    docType,
    docLabel,
    fileName,
    signatureKey: region.key,
    label: region.label,
    imageDataUrl: cropRegion(img, region),
  }));
}
