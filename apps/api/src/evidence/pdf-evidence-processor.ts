import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { Injectable } from '@nestjs/common';
import { getDocument } from 'pdfjs-dist';

export const PDF_EVIDENCE_PROCESSOR = Symbol('PDF_EVIDENCE_PROCESSOR');

export type ProcessedPdfEvidence =
  | { readonly kind: 'TEXT'; readonly text: string }
  | { readonly kind: 'IMAGE'; readonly image: Uint8Array; readonly mimeType: 'image/png' };

export interface PdfEvidenceProcessor {
  process(bytes: Uint8Array): Promise<ProcessedPdfEvidence>;
}

export class MultiPagePdfError extends Error {
  constructor() {
    super('MULTI_PAGE_PDF');
    this.name = 'MultiPagePdfError';
  }
}

@Injectable()
export class InMemoryPdfEvidenceProcessor implements PdfEvidenceProcessor {
  async process(bytes: Uint8Array): Promise<ProcessedPdfEvidence> {
    this.installCanvasGlobals();
    // Multer provides a Node.js Buffer, which PDF.js explicitly rejects even
    // though Buffer extends Uint8Array. Copy into a plain Uint8Array boundary.
    const pdfBytes = Uint8Array.from(bytes);
    const document = await getDocument({ data: pdfBytes, isEvalSupported: false }).promise;
    try {
      if (document.numPages !== 1) throw new MultiPagePdfError();
      const page = await document.getPage(1);
      const content = await page.getTextContent();
      const text = content.items
        .flatMap((item) => 'str' in item && typeof item.str === 'string' ? [item.str.trim()] : [])
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim();
      if (text.length >= 20) return { kind: 'TEXT', text };

      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: canvas.getContext('2d') as never,
        viewport,
      }).promise;
      return { kind: 'IMAGE', image: canvas.toBuffer('image/png'), mimeType: 'image/png' };
    } finally {
      await document.destroy();
    }
  }

  private installCanvasGlobals(): void {
    const globals = globalThis as typeof globalThis & {
      DOMMatrix?: typeof DOMMatrix;
      ImageData?: typeof ImageData;
      Path2D?: typeof Path2D;
    };
    globals.DOMMatrix ??= DOMMatrix;
    globals.ImageData ??= ImageData;
    globals.Path2D ??= Path2D;
  }
}
