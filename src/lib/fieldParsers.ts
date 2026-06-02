import { DocType, ExtractedField } from './types';

type Fields = Record<string, ExtractedField>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}


function firstMatch(rows: string[], pattern: RegExp, group = 1): string | null {
  for (const row of rows) {
    const m = row.match(pattern);
    if (m) return (m[group] ?? '').trim() || null;
  }
  return null;
}

function field(label: string, value: string | null): ExtractedField {
  return { label, value };
}

// Signature fields cannot be detected by OCR — they are always null and start
// as "Flagged" so the auditor must visually confirm and click to verify.
function sig(label: string): ExtractedField {
  return { label: `${label} (visual check)`, value: null };
}

// ── Rental Agreement ──────────────────────────────────────────────────────────
//
// OCR structure (Google Vision reads this bilingual 2-column form in reading order):
//   • "رقم عقد / Rental agreement nr | المستأجر / Client |" — label row
//   • Arabic line ("الايجار")
//   • "TRAVELUIGSAW LTD"           ← client name
//   • "35 FOUNTAIN STREET"
//   • "152786"                      ← RA number (standalone 6-digit line)
//   • "M22AN MANCHESTER ..."        ← manual RA ref
//   • ...
//   • "السائق / Driver |"           ← driver label
//   • "MrSHERAZI,LEYLA"            ← driver name (next line)
//   • "Passport: X8736456"
//   • "رخصة السائق / Driver license |"
//   • "006412579003"                ← DL number (standalone digits)
//   • "Check-out / الخروج"
//   • "02-03-2024 07:56 AM"         ← date on its own line
//   • "Foreseen check-in/ الدخول المتوقع |"
//   • "08-03-2024 12:30 PM"
//   • "8 MG RX موديل / Model"       ← value BEFORE the bilingual label
//   • "TA رقم التسجيل: 2292 / Plate nr"  ← same pattern
//   • standalone OMR amounts: 40.00, 2.00, 42.00 (sub-total, VAT, total)
//   • "CDW excess 150.00 OMR"
//   • "المبلغ / Amount" → "42.00 OMR"  ← payment amount

function parseRentalAgreement(text: string): Fields {
  const rows = lines(text);
  const n = rows.length;

  // Helper: first row index matching a pattern
  function idx(pattern: RegExp): number {
    return rows.findIndex((r) => pattern.test(r));
  }

  // Helper: value on the next non-Arabic, non-empty line after a label index
  function nextValue(labelIdx: number, skip: RegExp, limit = 5): string | null {
    for (let i = labelIdx + 1; i < Math.min(labelIdx + limit, n); i++) {
      const r = rows[i].trim();
      if (!r || skip.test(r)) continue;
      return r;
    }
    return null;
  }

  // ── RA Number ──
  // Standalone 6-digit line (no slashes → excludes "1/19202/7")
  const raNumber = (() => {
    const labelIdx = idx(/rental agreement nr|رقم عقد الايجار/i);
    const searchStart = labelIdx >= 0 ? Math.max(0, labelIdx - 2) : 0;
    for (let i = searchStart; i < Math.min(searchStart + 12, n); i++) {
      if (/^\d{6,7}$/.test(rows[i])) return rows[i];
    }
    // Fallback: first standalone 6-digit line in the whole document
    return rows.find((r) => /^\d{6,7}$/.test(r)) ?? null;
  })();

  // ── Client Name ──
  // First non-Arabic, non-numeric line after the "Client" label
  const clientName = (() => {
    const labelIdx = idx(/المستأجر\s*\/\s*Client|Client\s*[|\/]/i);
    if (labelIdx < 0) return null;
    return nextValue(labelIdx, /^[؀-ۿ\s]+$|^\d|^(Rate|BRK|TERMINAL|FULL YEAR)/i);
  })();

  // ── Driver Name ──
  // Line immediately after "السائق / Driver" label
  const driverName = (() => {
    const labelIdx = idx(/السائق\s*\/\s*Driver|Driver\s*[|\/]/iu);
    if (labelIdx < 0) return null;
    return nextValue(labelIdx, /^(Passport|رخصة|Mobile:|Additional)/i);
  })();

  // ── Passport ──
  const passport = firstMatch(rows, /[Pp]assport[:\s]+([A-Z][A-Z0-9]{5,11})/);

  // ── Driver License ──
  // Standalone digit string after "رخصة السائق / Driver license" label
  const dlNumber = (() => {
    const labelIdx = idx(/رخصة السائق\s*\/\s*Driver license|Driver license\s*\/\s*رخصة/iu);
    if (labelIdx < 0) return null;
    for (let i = labelIdx + 1; i < Math.min(labelIdx + 4, n); i++) {
      if (/^\d{6,15}$/.test(rows[i])) return rows[i];
    }
    return null;
  })();

  // ── Check-out Date ──
  const checkoutDate = (() => {
    const labelIdx = idx(/Check-?out|الخروج/i);
    if (labelIdx < 0) return null;
    for (let i = labelIdx + 1; i < Math.min(labelIdx + 4, n); i++) {
      const m = rows[i].match(/(\d{2}[-\/]\d{2}[-\/]\d{4}(?:\s+\d{2}:\d{2}(?:\s*(?:AM|PM))?)?)/i);
      if (m) return m[1].trim();
    }
    return null;
  })();

  // ── Foreseen Check-in Date ──
  const checkinDate = (() => {
    const labelIdx = idx(/[Ff]oreseen\s*check-?in|الدخول\s*المتوقع/iu);
    if (labelIdx < 0) return null;
    for (let i = labelIdx + 1; i < Math.min(labelIdx + 6, n); i++) {
      const m = rows[i].match(/(\d{2}[-\/]\d{2}[-\/]\d{4}(?:\s+\d{2}:\d{2}(?:\s*(?:AM|PM))?)?)/i);
      if (m) return m[1].trim();
    }
    return null;
  })();

  // ── Vehicle Model ──
  // OCR: "8 MG RX موديل / Model" — value appears BEFORE the label on the same line
  const vehicleModel = (() => {
    for (const row of rows) {
      const m1 = row.match(/^(.+?)\s+(?:موديل\s*\/\s*Model|Model\s*\/\s*موديل)/iu);
      if (m1 && m1[1].trim()) return m1[1].trim();
      const m2 = row.match(/(?:موديل\s*\/\s*Model|Model\s*\/\s*موديل)[:\s]+(.+)/iu);
      if (m2 && m2[1].trim()) return m2[1].trim();
    }
    return firstMatch(rows, /\b(MG\s+[A-Z]+\s*\d*)\b/i);
  })();

  // ── Plate No. ──
  // OCR: "TA رقم التسجيل: 2292 / .Plate nr" — value prefix before the label
  const plateNumber = (() => {
    for (const row of rows) {
      const m1 = row.match(/^([A-Z]{1,3}\s+\d{3,4}|\d{3,4}\s+[A-Z]{1,3})\s+(?:رقم التسجيل|Plate)/iu);
      if (m1) return m1[1].trim();
      const m2 = row.match(/(?:[Pp]late\s*nr\.?|رقم التسجيل)[:\s.]*([A-Z0-9][\w\s]{2,10})/i);
      if (m2) return m2[1].trim();
    }
    return null;
  })();

  // ── Total Amount ──
  // Standalone "42.00 OMR" lines appear in sequence: 40.00 (sub), 2.00 (VAT), 42.00 (total).
  // The total is the LAST standalone OMR line before the "المبلغ / Amount" payment label.
  const totalAmount = (() => {
    const amountLabelIdx = idx(/المبلغ\s*\/\s*Amount|Amount\s*\/\s*المبلغ/iu);
    const searchEnd = amountLabelIdx > 0 ? amountLabelIdx : n;
    for (let i = searchEnd - 1; i >= 0; i--) {
      const m = rows[i].match(/^([\d.]+)\s*OMR$/i);
      if (m) return m[1] + ' OMR';
    }
    return null;
  })();

  // ── CDW Deductible ──
  const deductible = firstMatch(rows, /CDW\s+excess\s+([\d.]+\s*OMR)/i);

  // ── Payment Amount ──
  // Standalone OMR line immediately after "المبلغ / Amount" label
  const paymentAmount = (() => {
    const labelIdx = idx(/المبلغ\s*\/\s*Amount|Amount\s*\/\s*المبلغ/iu);
    if (labelIdx >= 0) {
      for (let i = labelIdx + 1; i < Math.min(labelIdx + 4, n); i++) {
        const m = rows[i].match(/^([\d.]+)\s*OMR$/i);
        if (m) return m[1] + ' OMR';
      }
    }
    // Fallback: from "Visa / Final Payment" line
    for (const row of rows) {
      const m = row.match(/(?:Visa|Final\s*Payment)[^(]*?([\d.]+)\s*OMR/i);
      if (m) return m[1] + ' OMR';
    }
    return null;
  })();

  return {
    ra_number: field('Rental Agreement No.', raNumber),
    client_name: field('Client Name', clientName),
    driver_name: field('Driver Name', driverName),
    passport_number: field('Passport No.', passport),
    dl_number: field('Driver License No.', dlNumber),
    checkout_date: field('Check-out Date & Time', checkoutDate),
    checkin_date: field('Foreseen Check-in Date & Time', checkinDate),
    vehicle_model: field('Vehicle Model', vehicleModel),
    plate_number: field('Plate No.', plateNumber),
    total_amount: field('Total Amount', totalAmount),
    deductible: field('CDW Deductible', deductible),
    payment_amount: field('Payment Amount', paymentAmount),
    sig_customer: sig('Customer Signature'),
    sig_staff: sig('Staff Signature (Europcar)'),
  };
}

// ── Driver Details Form ───────────────────────────────────────────────────────

function parseDriverDetails(text: string): Fields {
  const rows = lines(text);

  // The Europcar driver-details form is 2-column (labels left, handwritten values right).
  // Google Vision reads all left-column labels first under the "DETAILS" heading,
  // then switches to the right column starting after a standalone "DRIVER" heading.
  // Structure in OCR output:
  //   DETAILS → Name, Oman Address, (First or last, Hotel Name) → DRIVER → Sherazi Leyla → Radisson...
  //   E-mail Address → Safina / or@hotmail.co / com → (Capital Letters) → Mobile No. → +41795848093

  const LABEL_LINES =
    /^(DETAILS|DRIVER|E-mail Address|Mobile No\.|Signature|Capital Letters|This is|Oman Address|First or|Hotel Name|Name\b|RENTER|STAFF)/i;

  // Find the standalone "DRIVER" column header
  const driverColIdx = rows.findIndex((r) => /^DRIVER\s*$/i.test(r.trim()));

  let driverName: string | null = null;
  let hotel: string | null = null;

  if (driverColIdx >= 0) {
    const valueLines: string[] = [];
    for (let i = driverColIdx + 1; i < rows.length; i++) {
      const r = rows[i].trim();
      if (!r) continue;
      if (LABEL_LINES.test(r)) break; // hit next label section
      valueLines.push(r);
    }
    driverName = valueLines[0] ?? null;
    hotel = valueLines[1] ?? null;
  }

  // Email — OCR often splits handwritten emails across 2–3 lines:
  //   line N-1: "Safina"  (username prefix)
  //   line N  : "or@hotmail.co"  (@ and domain, username suffix may be misread)
  //   line N+1: "com" or ".com"  (TLD fragment)
  let email: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].includes('@')) continue;

    const prev = (rows[i - 1] ?? '').trim();
    const curr = rows[i].trim();
    const next = (rows[i + 1] ?? '').trim();

    // Prepend username prefix from line above if it looks like a name fragment
    let combined = curr;
    if (prev && /^[a-zA-Z0-9._%+\-]+$/.test(prev) && !LABEL_LINES.test(prev)) {
      combined = prev + curr;
    }
    // Append TLD if next line is just "com" / ".com"
    if (/^\.?com$/i.test(next)) {
      combined = combined.replace(/\.?com$/i, '') + '.com';
    }

    const m = combined.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    if (m) { email = m[1]; break; }
  }

  // Mobile — E.164-style or local number
  const mobile = firstMatch(rows, /(\+?\d[\d\s\-]{6,18}\d)/);

  return {
    driver_name: field('Driver Name', driverName),
    hotel_name: field('Hotel / Oman Address', hotel),
    email: field('Email Address', email),
    mobile: field('Mobile No.', mobile),
    sig_renter: sig('Renter Signature'),
    sig_staff: sig('Staff Signature'),
  };
}

// ── Vehicle Checklist ─────────────────────────────────────────────────────────
//
// OCR structure (page contains both a bank-slip on the left AND the checklist):
//   Top section: bank slip fields (RECEIPT No, AMOUNT, card numbers, etc.)
//     followed by: Date / MGRXS / 229214 Time  ← model + plate near top
//   Middle: R.A./ Reservation No. 152786
//   Checklist columns (bilingual interior items)
//   Bottom: KM 52278 / Fuel / E 14 / 1/2 3/4 F / KM / 3331917 / Fuel / E 4 ...
//   Signatures: Date & Time: / Checked OUT by: ... / Date & Time: / Checked IN by:
//               8/3/24 / Da / 1050

function parseVehicleChecklist(text: string): Fields {
  const rows = lines(text);
  const n = rows.length;

  // ── RA Number ──
  const raNumber = firstMatch(rows, /R\.A\.?\s*[\/|]?\s*Reservation\s*No\.?\s*[:\-.]?\s*(\d{5,7})/i);

  // ── Vehicle Model ──
  // OCR reads "MGRXS" (= MG RX8 misread) as a standalone line near the top.
  // Only match lines that start with "MG" to avoid false positives like "SAYR".
  const vehicleModel = (() => {
    for (const row of rows) {
      if (/^MG[A-Z0-9\s]+$/i.test(row.trim())) return row.trim();
    }
    // Fallback: inline before Model label
    for (const row of rows) {
      const m = row.match(/^(MG[A-Z0-9\s]+?)\s+(?:موديل|Model)/iu);
      if (m) return m[1].trim();
    }
    return null;
  })();

  // ── Plate No. ──
  // OCR: "229214 Time" where "229214" = plate "2292 TA" (TA misread as 14).
  // Extract the digit block that immediately precedes the word "Time".
  const plateNumber = (() => {
    for (const row of rows) {
      const m = row.match(/^(\d{4,6})\s+Time\b/i);
      if (m) return m[1]; // raw OCR value; auditor verifies
    }
    // Fallback: standalone plate pattern
    return firstMatch(rows, /^([A-Z]{2}\s*\d{3,4}|\d{3,4}\s*[A-Z]{2})$/i);
  })();

  // ── KM readings ──
  // Look ONLY for explicit "KM NNNNN" or "KM\nNNNNN" lines — not any digit sequence.
  // This avoids picking up bank-slip numbers (card/receipt/amount).
  const kmValues: string[] = [];
  for (let i = 0; i < n; i++) {
    const inlineM = rows[i].match(/^KM\s+(\d{4,7})\b/);
    if (inlineM) {
      kmValues.push(inlineM[1]);
      continue;
    }
    if (/^KM\s*$/.test(rows[i]) && i + 1 < n && /^\d{4,7}$/.test(rows[i + 1])) {
      kmValues.push(rows[i + 1]);
    }
  }
  const kmOut = kmValues[0] ?? null;
  const kmIn  = kmValues[1] ?? null;

  // ── Fuel levels ──
  // The gauge (E · ¼ · ½ · ¾ · F) has one option circled by hand.
  // Text OCR reads all the printed labels but cannot detect which circle is filled —
  // that is a graphical element. We detect whether a gauge was present at all,
  // then surface a clear "inspect form" prompt so the auditor checks the physical doc.
  let fuelGaugeCount = 0;
  for (let i = 0; i < n; i++) {
    if (/^[Ff]uel$/.test(rows[i])) fuelGaugeCount++;
  }
  const FUEL_PROMPT = 'E · ¼ · ½ · ¾ · F — inspect circled level on form';
  const fuelOut = fuelGaugeCount >= 1 ? FUEL_PROMPT : null;
  const fuelIn  = fuelGaugeCount >= 2 ? FUEL_PROMPT : null;

  // ── Check-in Date & Time ──
  // Appears after "Checked IN by:" label — e.g. "8/3/24" then "1050" (= 10:50)
  const dateIn = (() => {
    const labelIdx = rows.findIndex((r) => /Checked\s+IN\s+by/i.test(r));
    if (labelIdx < 0) return null;
    let date: string | null = null;
    let time: string | null = null;
    for (let i = labelIdx + 1; i < Math.min(labelIdx + 10, n); i++) {
      const r = rows[i].trim();
      if (!date) {
        const dm = r.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dm) date = dm[1];
      }
      if (!time) {
        // "1050" → "10:50", or already formatted "10:50"
        const tm = r.match(/^(\d{2})(\d{2})$/) ?? r.match(/^(\d{1,2}):(\d{2})$/);
        if (tm) time = `${tm[1]}:${tm[2]}`;
      }
      if (date && time) break;
    }
    return [date, time].filter(Boolean).join(' ') || null;
  })();

  // ── Check-out Date & Time ──
  // Often blank on the checklist (filled at counter); attempt to find it anyway.
  const dateOut = (() => {
    const labelIdx = rows.findIndex((r) => /Checked\s+OUT\s+by/i.test(r));
    if (labelIdx < 0) return null;
    for (let i = labelIdx + 1; i < Math.min(labelIdx + 6, n); i++) {
      const m = rows[i].match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s+\d{1,2}:\d{2})?)/);
      if (m) return m[1];
    }
    return null;
  })();

  return {
    ra_number:     field('R.A. / Reservation No.', raNumber),
    vehicle_model: field('Vehicle Model', vehicleModel),
    plate_number:  field('Plate No.', plateNumber),
    km_out:        field('KM at Check-out', kmOut),
    km_in:         field('KM at Check-in', kmIn),
    fuel_out:      field('Fuel at Check-out', fuelOut),
    fuel_in:       field('Fuel at Check-in', fuelIn),
    date_out:      field('Date / Time Check-out', dateOut),
    date_in:       field('Date / Time Check-in', dateIn),
    sig_customer:  sig('Customer Signature (Check-out)'),
    sig_renter_in: sig('Renter Signature (Check-in)'),
  };
}

// ── Charge Slip ───────────────────────────────────────────────────────────────
//
// A single scanned page can contain TWO slips: PRE-AUTH and SALE (in that order).
// Key OCR quirks:
//  • "AMOUNT: OMR" is its own line; the actual number appears 4–6 lines later
//    (after a block of "VALID ONLY OMAN ARAB BANK…" noise lines)
//  • "APPROVAL CODE:" is its own line; the 6-digit code appears after
//    AID / LABEL / TVR / AC technical lines
//  • All labels are UPPERCASE — patterns need the /i flag
//  • "Reference number::" uses a double colon
//
// Expected extractions from the sample page:
//   PRE-AUTH  262.500 OMR  approval 034686  receipt 005355  (leading 0 sometimes misread)
//   SALE       42.000 OMR  approval 033545  receipt 005356

function parseChargeSlip(text: string): Fields {
  const rows = lines(text);
  const n = rows.length;

  // Scan forward from every match of labelPattern; for each, walk ahead up to
  // maxLines to find the first row matching valuePattern. Returns all found values.
  function collectAfterLabel(
    labelPattern: RegExp,
    valuePattern: RegExp,
    maxLines = 14
  ): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      if (!labelPattern.test(rows[i])) continue;
      for (let j = i + 1; j < Math.min(i + maxLines, n); j++) {
        const m = rows[j].match(valuePattern);
        if (m) { out.push((m[1] ?? m[0]).trim()); break; }
      }
    }
    return out;
  }

  // ── Transaction type blocks (PRE-AUTH first, SALE second) ──
  const typeLines = rows.filter((r) => /^(PRE-AUTH|SALE|VOID|REFUND)$/.test(r.trim()));
  const hasPreauth = typeLines.some((t) => /PRE-AUTH/i.test(t));
  const hasSale    = typeLines.some((t) => /^SALE$/i.test(t));

  // ── Amounts ──
  // "AMOUNT: OMR\n…noise…\n262.500"  OR  "AMOUNT: OMR 262.500" (one-liner)
  const amounts = collectAfterLabel(
    /^AMOUNT[:\s]*OMR\s*$/i,
    /^([\d]+[.,][\d]+)$/,
    14
  ).map((v) => v.replace(',', '.') + ' OMR');

  // Fallback: same-line "AMOUNT: OMR 262.500"
  if (amounts.length === 0) {
    for (const row of rows) {
      const m = row.match(/AMOUNT[:\s]*OMR\s+([\d.]+)/i);
      if (m) amounts.push(m[1] + ' OMR');
    }
  }

  // ── Approval codes ──
  // "APPROVAL CODE:\nAID:…\nLABEL:…\nTVR:…\nAC …\n034686"
  const approvalCodes = collectAfterLabel(
    /^APPROVAL\s*CODE[:\s]*$/i,
    /^(\d{5,8})$/,
    14
  );

  // Fallback: same-line "APPROVAL CODE: 034686"
  if (approvalCodes.length === 0) {
    for (const row of rows) {
      const m = row.match(/APPROVAL\s*CODE[:\s]+(\d{5,8})/i);
      if (m) approvalCodes.push(m[1]);
    }
  }

  // ── Receipt numbers ──
  const receiptNos: string[] = [];
  for (const row of rows) {
    const m = row.match(/RECEIPT\s*No\.?[:\s]*(\d{3,8})/i);
    if (m) receiptNos.push(m[1]);
  }

  // ── Card number (same on both slips) ──
  const cardNumber = firstMatch(rows, /(\d{4,6}\*{4,8}\d{4})/);

  // ── Date ──
  const date = firstMatch(rows, /DATE[:\s]*(\d{2}\/\d{2}\/\d{2,4})/i);

  // ── Reference numbers ──
  // "Reference number:: 152786" (note double colon)
  const refs: string[] = [];
  for (const row of rows) {
    const m = row.match(/[Rr]eference\s*number[:\s:]*(\d{5,7})/i);
    if (m) refs.push(m[1]);
  }

  // Map extracted arrays to PRE-AUTH (index 0) / SALE (index 1) positions
  const p = 0; // pre-auth index
  const s = hasPreauth ? 1 : 0; // sale index

  return {
    preauth_amount:   field('Pre-Auth Amount (OMR)',    hasPreauth ? (amounts[p] ?? null)       : null),
    preauth_approval: field('Pre-Auth Approval Code',   hasPreauth ? (approvalCodes[p] ?? null) : null),
    preauth_receipt:  field('Pre-Auth Receipt No.',     hasPreauth ? (receiptNos[p] ?? null)    : null),
    sale_amount:      field('Sale Amount (OMR)',         hasSale    ? (amounts[s] ?? null)       : null),
    sale_approval:    field('Sale Approval Code',        hasSale    ? (approvalCodes[s] ?? null) : null),
    sale_receipt:     field('Sale Receipt No.',          hasSale    ? (receiptNos[s] ?? null)    : null),
    card_number:      field('Card No. (masked)',         cardNumber),
    date:             field('Date',                      date),
    reference:        field('RA Reference No.',          refs[0] ?? null),
    sig_merchant:     sig('Signature on Sale Slip'),
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseFields(text: string, docType: DocType): Fields {
  switch (docType) {
    case 'rental_agreement':
      return parseRentalAgreement(text);
    case 'driver_details':
      return parseDriverDetails(text);
    case 'vehicle_checklist':
      return parseVehicleChecklist(text);
    case 'charge_slip':
      return parseChargeSlip(text);
  }
}

export const DOC_TYPE_OPTIONS = [
  {
    value: 'rental_agreement' as DocType,
    label: 'Rental Agreement (RA)',
    description: 'Main rental contract — RA number, client, driver, vehicle, payment',
  },
  {
    value: 'driver_details' as DocType,
    label: 'Driver Details Form',
    description: 'Driver authorization form — name, hotel, email, mobile',
  },
  {
    value: 'vehicle_checklist' as DocType,
    label: 'Vehicle Checklist',
    description: 'Check-in/out form — KM, fuel level, vehicle condition',
  },
  {
    value: 'charge_slip' as DocType,
    label: 'Charge Slip',
    description: 'Bank POS receipt — amount, approval code, card number',
  },
];
