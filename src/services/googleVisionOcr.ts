const VISION_URL = process.env.GOOGLE_VISION_API_URL!;
const VISION_KEY = process.env.GOOGLE_VISION_API_KEY!;

export async function annotateImage(base64: string): Promise<string> {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;

  const response = await fetch(`${VISION_URL}?key=${VISION_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: clean },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['en', 'ar'] },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Vision API error: ${response.status}`);
  }

  const json = await response.json();
  const text: string =
    json.responses?.[0]?.fullTextAnnotation?.text ??
    json.responses?.[0]?.textAnnotations?.[0]?.description ??
    '';

  return normalizeArabicDigits(text);
}

function normalizeArabicDigits(text: string): string {
  const map: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };
  return text.replace(/[٠-٩۰-۹]/g, (c) => map[c] ?? c);
}
