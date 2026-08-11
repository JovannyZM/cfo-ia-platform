import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { InMemoryPdfEvidenceProcessor, MultiPagePdfError } from './pdf-evidence-processor';

async function pdfWithPages(count: number, text?: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < count; index += 1) {
    const page = pdf.addPage([400, 600]);
    if (text) page.drawText(text, { x: 30, y: 550, size: 12, font });
  }
  return pdf.save();
}

describe('InMemoryPdfEvidenceProcessor', () => {
  const processor = new InMemoryPdfEvidenceProcessor();

  it('extracts selectable text from a one-page invoice without persisting a file', async () => {
    const result = await processor.process(Buffer.from(await pdfWithPages(
      1,
      'Factura Costco total 598.20 MXN fecha 8 julio 2026',
    )));
    expect(result).toMatchObject({ kind: 'TEXT' });
    if (result.kind === 'TEXT') expect(result.text).toContain('Factura Costco total 598.20 MXN');
  });

  it('renders a scanned one-page PDF as an in-memory PNG', async () => {
    const result = await processor.process(await pdfWithPages(1));
    expect(result.kind).toBe('IMAGE');
    if (result.kind === 'IMAGE') {
      expect(result.mimeType).toBe('image/png');
      expect(Array.from(result.image.subarray(0, 4))).toEqual([137, 80, 78, 71]);
    }
  });

  it('rejects PDFs containing multiple pages', async () => {
    await expect(processor.process(await pdfWithPages(2))).rejects.toBeInstanceOf(MultiPagePdfError);
  });
});
