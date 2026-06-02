import { NextRequest, NextResponse } from 'next/server';
import { annotateImage } from '@/services/googleVisionOcr';
import { parseFields } from '@/lib/fieldParsers';
import { DocType, OcrApiResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { base64, docType } = body as { base64: string; docType: DocType };

    if (!base64) {
      return NextResponse.json<OcrApiResponse>(
        {
          status: 'error',
          message: 'Missing base64 image content',
          error: { code: 'VALIDATION_ERROR' },
        },
        { status: 400 }
      );
    }

    if (!docType) {
      return NextResponse.json<OcrApiResponse>(
        {
          status: 'error',
          message: 'Missing document type',
          error: { code: 'VALIDATION_ERROR' },
        },
        { status: 400 }
      );
    }

    const rawText = await annotateImage(base64);
    const fields = parseFields(rawText, docType);

    return NextResponse.json<OcrApiResponse>({
      status: 'success',
      message: 'OCR completed successfully',
      data: { rawText, docType, fields },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json<OcrApiResponse>(
      {
        status: 'error',
        message: 'OCR processing failed',
        error: { code: 'OCR_ERROR', details: message },
      },
      { status: 500 }
    );
  }
}
