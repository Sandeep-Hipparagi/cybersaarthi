export const UTR_PATTERN = /^\d{12}$/;
export const ACKNOWLEDGEMENT_PATTERN = /^\d{14}$/;
export const FORBIDDEN_INCIDENT_CHARACTERS = /[#$@^*\\'~|!`]/g;

export type AuditDisplayState =
  | "Pending"
  | "Under Investigation"
  | "Lien Enforced by Bank"
  | "Converted to FIR"
  | "Closed by Citizen";

export function exactUtr(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.replace(/\s/g, "") : "";
  return UTR_PATTERN.test(normalized) ? normalized : null;
}

export function exactAcknowledgement(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.replace(/\s/g, "") : "";
  return ACKNOWLEDGEMENT_PATTERN.test(normalized) ? normalized : null;
}

export function sanitizeIncidentDescription(value: unknown): {
  text: string;
  removedCharacters: number;
  validLength: boolean;
} {
  const input = typeof value === "string" ? value.normalize("NFKC") : "";
  const matches = input.match(FORBIDDEN_INCIDENT_CHARACTERS) ?? [];
  const text = input
    .replace(FORBIDDEN_INCIDENT_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8_000);
  return { text, removedCharacters: matches.length, validLength: text.length >= 200 };
}

export function chronologicalEvents(description: string): Array<{
  sequence: number;
  description: string;
}> {
  const parts = description
    .split(/(?<=[.;?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12)
    .slice(0, 20);
  return (parts.length ? parts : [description]).map((part, index) => ({
    sequence: index + 1,
    description: part,
  }));
}

export function goldenHourAssessment(
  occurredAt: string | null,
  now = new Date(),
): {
  state: "WITHIN_GOLDEN_HOUR" | "OUTSIDE_GOLDEN_HOUR" | "UNKNOWN";
  ageMinutes: number | null;
  reason: string;
} {
  if (!occurredAt) {
    return { state: "UNKNOWN", ageMinutes: null, reason: "No explicit transaction timestamp is stored." };
  }
  const parsed = new Date(occurredAt);
  if (Number.isNaN(parsed.getTime())) {
    return { state: "UNKNOWN", ageMinutes: null, reason: "The stored timestamp cannot be parsed without guessing." };
  }
  const ageMinutes = Math.floor((now.getTime() - parsed.getTime()) / 60_000);
  if (ageMinutes < 0) {
    return { state: "UNKNOWN", ageMinutes, reason: "The stored timestamp is in the future and requires review." };
  }
  return ageMinutes <= 120
    ? { state: "WITHIN_GOLDEN_HOUR", ageMinutes, reason: "The explicit timestamp is within 120 minutes." }
    : { state: "OUTSIDE_GOLDEN_HOUR", ageMinutes, reason: "The explicit timestamp is more than 120 minutes old." };
}

export function auditDisplayState(status: string, events: string[] = []): AuditDisplayState {
  if (status === "CLOSED_SETTLED") return "Closed by Citizen";
  if (events.includes("FIR_CONVERSION_SIMULATED")) return "Converted to FIR";
  if (events.includes("LIEN_ENFORCED_SIMULATED")) return "Lien Enforced by Bank";
  if (["REVIEW_IN_PROGRESS", "INFORMATION_REQUESTED", "FOLLOW_UP_RECEIVED", "SYNTHETIC_RESOLVED"].includes(status)) {
    return "Under Investigation";
  }
  return "Pending";
}
