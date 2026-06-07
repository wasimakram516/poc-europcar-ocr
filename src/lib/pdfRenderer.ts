// Client-side only — uses pdfjs-dist and browser Canvas API.

import type { DocType } from './types';

// Page-to-doc-type mapping for the standard 6-page Europcar rental booklet.
// null = page has no matching doc type and will be skipped.
export const BOOKLET_PAGE_MAP: Record<number, DocType | null> = {
  1: 'rental_agreement',
  2: null, // passport / ID scans
  3: null, // back of passport / additional ID
  4: 'driver_details',
  5: 'vehicle_checklist',
  6: 'charge_slip',
};

export interface RenderedPage {
  pageNum: number;
  docType: DocType | null;
  dataUrl: string;
}

export async function renderAllPages(
  file: File,
  scale = 1.8,
  onProgress?: (done: number, total: number) => void
): Promise<RenderedPage[]> {
  const pdfjsLib = await import('pdfjs-dist');

  // Use unpkg CDN worker — avoids Next.js webpack bundling complexity
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const results: RenderedPage[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, viewport, canvas } as any).promise;

    results.push({
      pageNum: i,
      docType: BOOKLET_PAGE_MAP[i] ?? null,
      // JPEG (not PNG) keeps the base64 payload well under Vercel's 4.5 MB
      // serverless request-body limit. Dense colored scans (e.g. the pink
      // vehicle checklist) blow past that limit as lossless PNG and the OCR
      // request would 413 — silently dropping the page on the deployed site.
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    });

    onProgress?.(i, numPages);
  }

  return results;
}
