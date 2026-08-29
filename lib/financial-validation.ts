import type { PreparedFinancialFields } from "./narration-field-extraction";

export type FinancialDraft = {
  incidentDateTime: string;
  totalAmount: string;
  utrNumber: string;
  bankName: string;
  victimAccountNumber: string;
  suspectVpa: string;
  suspectPhone: string;
  suspectIfsc: string;
  suspectAccountNumber: string;
};

export type FinancialDraftField = keyof FinancialDraft;

/**
 * Reference data for the synthetic prototype form. This is a display catalog,
 * not a live bank directory and is never used to infer a bank from a UTR.
 */
export const INDIAN_BANK_CATALOG = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Kotak Mahindra Bank",
  "IndusInd Bank",
] as const;

export const EMPTY_FINANCIAL_DRAFT: FinancialDraft = {
  incidentDateTime: "",
  totalAmount: "",
  utrNumber: "",
  bankName: "",
  victimAccountNumber: "",
  suspectVpa: "",
  suspectPhone: "",
  suspectIfsc: "",
  suspectAccountNumber: "",
};

const UTR_PATTERN = /^\d{12}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const MOBILE_PATTERN = /^(?:\+91)?[6789]\d{9}$/;
const ACCOUNT_PATTERN = /^\d{9,18}$/;
const VPA_PATTERN = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export function digitsOnly(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

export function formatUtr(value: string): string {
  return digitsOnly(value, 12).replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function formatInrInput(value: string): string {
  const digits = digitsOnly(value, 12);
  return digits ? new Intl.NumberFormat("en-IN").format(Number(digits)) : "";
}

export function normalizeIndianMobile(value: string): string {
  const trimmed = value.trim();
  const hasCountryCode = /^\+91/.test(trimmed);
  const digits = digitsOnly(trimmed, hasCountryCode ? 12 : 10);
  return hasCountryCode && digits.startsWith("91") ? `+${digits}` : digits;
}

export function validateFinancialDraft(
  draft: FinancialDraft,
  now = new Date(),
): Partial<Record<FinancialDraftField, string>> {
  const errors: Partial<Record<FinancialDraftField, string>> = {};

  if (draft.incidentDateTime) {
    const parsed = new Date(draft.incidentDateTime);
    if (Number.isNaN(parsed.getTime())) {
      errors.incidentDateTime = "Enter a valid incident date and time.";
    } else if (parsed.getTime() > now.getTime() + 60_000) {
      errors.incidentDateTime = "The incident time cannot be in the future.";
    }
  }

  if (draft.totalAmount && Number(digitsOnly(draft.totalAmount)) <= 0) {
    errors.totalAmount = "Enter an amount greater than zero.";
  }
  if (draft.utrNumber && !UTR_PATTERN.test(digitsOnly(draft.utrNumber))) {
    errors.utrNumber = "Enter the exact 12-digit transaction reference.";
  }
  if (draft.victimAccountNumber && !ACCOUNT_PATTERN.test(digitsOnly(draft.victimAccountNumber))) {
    errors.victimAccountNumber = "Use 9 to 18 digits, or leave this unknown.";
  }
  if (draft.suspectVpa && !VPA_PATTERN.test(draft.suspectVpa.trim())) {
    errors.suspectVpa = "Enter a complete UPI ID such as name@bank, or leave it unknown.";
  }
  if (draft.suspectPhone && !MOBILE_PATTERN.test(normalizeIndianMobile(draft.suspectPhone))) {
    errors.suspectPhone = "Enter a valid Indian mobile number, or leave it unknown.";
  }
  if (draft.suspectIfsc && !IFSC_PATTERN.test(draft.suspectIfsc.trim().toUpperCase())) {
    errors.suspectIfsc = "IFSC must use four letters, 0, then six letters or digits.";
  }
  if (draft.suspectAccountNumber && !ACCOUNT_PATTERN.test(digitsOnly(draft.suspectAccountNumber))) {
    errors.suspectAccountNumber = "Use 9 to 18 digits, or leave this unknown.";
  }

  return errors;
}

export function financialDraftFacts(draft: FinancialDraft): Array<Record<string, unknown>> {
  const amount = Number(digitsOnly(draft.totalAmount));
  const values: Array<[string, string, string | number]> = [
    ["incident.dateTime", "Incident date and time", draft.incidentDateTime],
    ["financial.lossAmount", "Reported loss amount", amount > 0 ? amount : ""],
    ["financial.transactionReference", "Transaction reference / UTR", digitsOnly(draft.utrNumber, 12)],
    ["financial.institution", "Bank, wallet, or merchant", draft.bankName.trim()],
    ["victim.accountNumber", "Victim account number", digitsOnly(draft.victimAccountNumber, 18)],
    ["suspect.upi_id", "Suspect UPI ID", draft.suspectVpa.trim()],
    ["suspect.phone", "Suspect phone number", normalizeIndianMobile(draft.suspectPhone)],
    ["suspect.ifsc", "Suspect IFSC", draft.suspectIfsc.trim().toUpperCase()],
    ["suspect.accountNumber", "Suspect account number", digitsOnly(draft.suspectAccountNumber, 18)],
  ];

  return values
    .filter(([, , value]) => value !== "")
    .map(([fieldId, label, value]) => ({
      fieldId,
      label,
      value,
      source: "Citizen-confirmed structured input",
      status: "ACCEPTED",
    }));
}

function datetimeLocalValue(value: string | null): string {
  if (!value) return "";
  const trimmed = value.normalize("NFKC").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 16);

  const monthNumbers: Record<string, string> = {
    january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03",
    april: "04", apr: "04", may: "05", june: "06", jun: "06", july: "07", jul: "07",
    august: "08", aug: "08", september: "09", sep: "09", sept: "09", october: "10", oct: "10",
    november: "11", nov: "11", december: "12", dec: "12",
  };
  const englishDate = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*(?:,|at)?\s*(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?)?(?:\s+IST)?$/i,
  );
  if (englishDate) {
    const [, rawDay, rawMonth, year, rawHour = "00", minute = "00", meridiem] = englishDate;
    const month = monthNumbers[rawMonth.toLowerCase()];
    const monthNumber = Number(month);
    const dayNumber = Number(rawDay);
    let hour = Number(rawHour);
    const period = meridiem?.replace(/\./g, "").toLowerCase();
    const calendarDate = month
      ? new Date(Date.UTC(Number(year), monthNumber - 1, dayNumber))
      : null;
    const validCalendarDate = calendarDate !== null
      && calendarDate.getUTCFullYear() === Number(year)
      && calendarDate.getUTCMonth() === monthNumber - 1
      && calendarDate.getUTCDate() === dayNumber;
    const validHour = period ? hour >= 1 && hour <= 12 : hour >= 0 && hour <= 23;
    if (month && validCalendarDate && validHour && Number(minute) <= 59) {
      if (period === "pm" && hour < 12) hour += 12;
      if (period === "am" && hour === 12) hour = 0;
      const day = rawDay.padStart(2, "0");
      return `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${minute}`;
    }
    return "";
  }

  const parsed = new Date(trimmed.replace(/\bIST\b/i, "+05:30"));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 16);
}

export function mergePreparedFinancialDraft(
  current: FinancialDraft,
  proposed: PreparedFinancialFields,
): FinancialDraft {
  const candidate: FinancialDraft = {
    incidentDateTime: datetimeLocalValue(proposed.incidentDateTime),
    totalAmount: proposed.totalAmount && proposed.totalAmount > 0
      ? formatInrInput(String(Math.round(proposed.totalAmount)))
      : "",
    utrNumber: proposed.utrNumber && UTR_PATTERN.test(digitsOnly(proposed.utrNumber))
      ? digitsOnly(proposed.utrNumber, 12)
      : "",
    bankName: proposed.bankName?.trim().slice(0, 100) ?? "",
    victimAccountNumber: proposed.victimAccountNumber && ACCOUNT_PATTERN.test(digitsOnly(proposed.victimAccountNumber))
      ? digitsOnly(proposed.victimAccountNumber, 18)
      : "",
    suspectVpa: proposed.suspectVpa && VPA_PATTERN.test(proposed.suspectVpa.trim())
      ? proposed.suspectVpa.trim()
      : "",
    suspectPhone: proposed.suspectPhone && MOBILE_PATTERN.test(normalizeIndianMobile(proposed.suspectPhone))
      ? normalizeIndianMobile(proposed.suspectPhone)
      : "",
    suspectIfsc: proposed.suspectIfsc && IFSC_PATTERN.test(proposed.suspectIfsc.trim().toUpperCase())
      ? proposed.suspectIfsc.trim().toUpperCase()
      : "",
    suspectAccountNumber: proposed.suspectAccountNumber && ACCOUNT_PATTERN.test(digitsOnly(proposed.suspectAccountNumber))
      ? digitsOnly(proposed.suspectAccountNumber, 18)
      : "",
  };
  return Object.fromEntries(
    (Object.keys(current) as FinancialDraftField[]).map((field) => [
      field,
      current[field].trim() ? current[field] : candidate[field],
    ]),
  ) as FinancialDraft;
}
