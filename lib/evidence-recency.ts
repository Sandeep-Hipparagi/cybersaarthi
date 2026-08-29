export type EvidenceRecencyWindow = "UNKNOWN" | "UNDER_2H" | "OVER_2H";

export type EvidenceRecencyReason =
  | "NO_TIMESTAMP"
  | "UNREADABLE_TIMESTAMP"
  | "FUTURE_TIMESTAMP"
  | "WITHIN_TWO_HOURS"
  | "OUTSIDE_TWO_HOURS";

export type EvidenceRecencyAssessment = {
  window: EvidenceRecencyWindow;
  observedAt: string | null;
  ageMinutes: number | null;
  reason: EvidenceRecencyReason;
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const IST_OFFSET_MINUTES = 330;
const FUTURE_CLOCK_TOLERANCE_MINUTES = 5;

function validIstDate(
  timestamp: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): boolean {
  const ist = new Date(timestamp + IST_OFFSET_MINUTES * 60_000);
  return ist.getUTCFullYear() === year
    && ist.getUTCMonth() === month
    && ist.getUTCDate() === day
    && ist.getUTCHours() === hour
    && ist.getUTCMinutes() === minute;
}

function parseExplicitTimestamp(value: string): number | null {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");

  // Accept ISO only when the OCR output includes an explicit UTC offset or Z.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  // Screenshot times without a timezone remain unresolved rather than assuming one.
  const match = normalized.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\s+IST$/i,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const meridiem = match[6]?.toUpperCase();

  if (month === undefined || day < 1 || hour < 0 || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }

  const timestamp = Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MINUTES * 60_000;
  return validIstDate(timestamp, year, month, day, hour, minute) ? timestamp : null;
}

export function assessEvidenceRecency(
  observedAt: string | null | undefined,
  now: Date = new Date(),
): EvidenceRecencyAssessment {
  const value = observedAt?.trim() || null;
  if (!value) {
    return { window: "UNKNOWN", observedAt: null, ageMinutes: null, reason: "NO_TIMESTAMP" };
  }

  const timestamp = parseExplicitTimestamp(value);
  if (timestamp === null || !Number.isFinite(now.getTime())) {
    return { window: "UNKNOWN", observedAt: value, ageMinutes: null, reason: "UNREADABLE_TIMESTAMP" };
  }

  const exactAgeMinutes = (now.getTime() - timestamp) / 60_000;
  if (exactAgeMinutes < -FUTURE_CLOCK_TOLERANCE_MINUTES) {
    return { window: "UNKNOWN", observedAt: value, ageMinutes: null, reason: "FUTURE_TIMESTAMP" };
  }

  const ageMinutes = Math.max(0, Math.floor(exactAgeMinutes));
  if (ageMinutes <= 120) {
    return { window: "UNDER_2H", observedAt: value, ageMinutes, reason: "WITHIN_TWO_HOURS" };
  }

  return { window: "OVER_2H", observedAt: value, ageMinutes, reason: "OUTSIDE_TWO_HOURS" };
}

export function recencyAgeLabel(ageMinutes: number | null): string | null {
  if (ageMinutes === null) return null;
  if (ageMinutes < 60) return `${Math.max(1, ageMinutes)} min ago`;
  if (ageMinutes < 24 * 60) {
    const hours = Math.floor(ageMinutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(ageMinutes / (24 * 60));
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
