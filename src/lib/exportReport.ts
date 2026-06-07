// Client-side only — generates an .xlsx workbook from the extracted OCR results.

import * as XLSX from 'xlsx';
import { DocType, ExtractedField } from './types';
import { DOC_TYPE_OPTIONS } from './fieldParsers';

interface DocResult {
  rawText: string;
  fields: Record<string, ExtractedField>;
}

// Excel sheet names: max 31 chars, no : \ / ? * [ ]
function safeSheetName(label: string): string {
  return label.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function exportReport(
  docResults: Partial<Record<DocType, DocResult>>,
  fileNameHint?: string
): void {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  // Iterate in the canonical doc-type order
  for (const opt of DOC_TYPE_OPTIONS) {
    const result = docResults[opt.value];
    if (!result) continue;

    const rows: Array<Record<string, string>> = Object.values(result.fields).map((f: ExtractedField) => ({
      Field: f.label,
      'Extracted Value': f.value ?? '',
      Status: f.value ? 'Extracted' : 'Not detected',
    }));

    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: ['Field', 'Extracted Value', 'Status'],
    });

    // Column widths
    sheet['!cols'] = [{ wch: 32 }, { wch: 40 }, { wch: 16 }];

    // Ensure unique sheet name
    let name = safeSheetName(opt.label);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = safeSheetName(`${opt.label} ${suffix++}`);
    }
    usedNames.add(name);

    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }

  const base = fileNameHint?.replace(/\.[^.]+$/, '') ?? 'europcar-ocr-report';
  XLSX.writeFile(workbook, `${base}_${timestamp()}.xlsx`);
}
