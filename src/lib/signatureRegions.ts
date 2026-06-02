import { DocType } from './types';

export interface SignatureRegion {
  key: string;
  label: string;
  x: number; // left edge (0–1)
  y: number; // top edge (0–1)
  w: number; // width fraction
  h: number; // height fraction
}

export const SIGNATURE_REGIONS: Record<DocType, SignatureRegion[]> = {
  // ── Rental Agreement (page 1) ────────────────────────────────────────────
  rental_agreement: [
    {
      key: 'ra_customer',
      label: 'Customer Signature',
      x: 0.02, y: 0.83, w: 0.40, h: 0.11,
    },
    {
      key: 'ra_staff',
      label: 'Staff Signature (Europcar)',
      x: 0.58, y: 0.83, w: 0.40, h: 0.11,
    },
  ],

  // ── Driver Details / Authorization Form (page 4) ────────────────────────
  driver_details: [
    {
      key: 'dd_renter',
      label: 'Renter Signature',
      x: 0.02, y: 0.77, w: 0.40, h: 0.10,
    },
    {
      key: 'dd_staff',
      label: 'Staff Signature',
      x: 0.55, y: 0.77, w: 0.40, h: 0.10,
    },
  ],

  // ── Vehicle Checklist (page 5) ───────────────────────────────────────────
  vehicle_checklist: [
    {
      key: 'vc_customer_out',
      label: 'Customer Signature (Check-out)',
      x: 0.02, y: 0.80, w: 0.42, h: 0.06,
    },
    {
      key: 'vc_renter_in',
      label: 'Renter Signature (Check-in)',
      x: 0.02, y: 0.84, w: 0.42, h: 0.06,
    },
  ],

  // ── Charge Slip — chip/PIN, no handwritten signature ────────────────────
  charge_slip: [],
};
