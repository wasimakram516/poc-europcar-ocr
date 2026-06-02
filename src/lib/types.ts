export type DocType =
  | 'rental_agreement'
  | 'driver_details'
  | 'vehicle_checklist'
  | 'charge_slip';

export interface DocTypeOption {
  value: DocType;
  label: string;
  description: string;
  fields: string[];
}

export interface ExtractedField {
  label: string;
  value: string | null;
}

export interface OcrApiRequest {
  base64: string;
  docType: DocType;
  fileName?: string;
}

export interface OcrApiResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    rawText: string;
    docType: DocType;
    fields: Record<string, ExtractedField>;
  };
  error?: {
    code: string;
    details?: string;
  };
}

export interface FieldVerification {
  fieldKey: string;
  label: string;
  extractedValue: string | null;
  status: 'ok' | 'warning' | 'pending';
  note?: string;
}

export type SignatureStatus = 'pending' | 'ok' | 'warning';

export interface SignatureEntry {
  id: string;
  docType: DocType;
  docLabel: string;
  fileName: string;
  signatureKey: string;
  label: string;
  imageDataUrl: string;
  status: SignatureStatus;
}
