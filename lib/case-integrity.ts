export const ALLOWED_CASE_PROVIDERS = new Set([
  "CITIZEN_TYPED",
  "CYBERSAARTHI_MOCK_AGENT",
  "CYBERSAARTHI_GUIDED_VOICE",
  "VOICE_DEMO_FIXTURE",
  "SARVAM_AI",
  "DETERMINISTIC_DEMO",
  "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
]);

export type SubmissionCheck = {
  id: string;
  label: string;
  owner: "Citizen" | "AI + citizen" | "Prototype boundary";
  status: "READY" | "MISSING" | "BOUNDARY";
  detail: string;
};

export type SubmissionReadiness = {
  readyCount: number;
  requiredCount: number;
  outcome: "READY" | "GAPS_REMAIN";
  checks: SubmissionCheck[];
};

export type CaseIntegrityInput = {
  ownerEmail: string;
  route: string;
  district: string | null;
  lossAmount: number | null;
  narrativeEnglish: string;
  facts: Array<Record<string, unknown>>;
};

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function factValue(facts: Array<Record<string, unknown>>, fieldIds: string[]): unknown {
  return facts.find((fact) => fieldIds.includes(String(fact.fieldId)))?.value ?? null;
}

function transactionReferences(facts: Array<Record<string, unknown>>): string[] {
  const ids = new Set([
    "financial.transactionReference",
    "transaction.reference",
    "transaction.utr",
  ]);
  return [...new Set(facts
    .filter((fact) => ids.has(String(fact.fieldId)))
    .map((fact) => String(fact.value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase())
    .filter(Boolean))]
    .sort();
}

export function isAllowedCaseProvider(provider: string): boolean {
  return ALLOWED_CASE_PROVIDERS.has(provider) && !/(?:scrap|crawl|harvest|repository)/i.test(provider);
}

export function caseSourceLabel(provider: string): string {
  if (provider === "SARVAM_AI") return "Citizen voice · language auto-detected";
  if (provider === "CITIZEN_TYPED") return "Citizen-entered narration";
  if (provider.includes("VOICE") || provider.includes("AGENT")) return "Citizen-guided voice account";
  return "Reviewed synthetic citizen input";
}

export async function createCaseFingerprint(input: CaseIntegrityInput): Promise<string> {
  const references = transactionReferences(input.facts);
  const signature = references.length > 0
    ? {
        owner: input.ownerEmail.toLowerCase(),
        references,
      }
    : {
        owner: input.ownerEmail.toLowerCase(),
        route: input.route,
        district: normalizedText(input.district ?? ""),
        lossAmount: input.lossAmount,
        narrative: normalizedText(input.narrativeEnglish),
      };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(signature)),
  );
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function buildSubmissionReadiness(input: {
  route: string;
  district: string | null;
  narrative: string;
  facts: Array<Record<string, unknown>>;
  evidenceChecksums?: string[];
}): SubmissionReadiness {
  const isFinancial = input.route === "FINANCIAL_FRAUD";
  const narrativeReady = input.narrative.trim().length >= 200;
  const incidentDateTime = factValue(input.facts, ["incident.dateTime", "transaction.occurred_at"]);
  const institution = factValue(input.facts, ["financial.institution"]);
  const reference = factValue(input.facts, ["financial.transactionReference", "transaction.reference"]);
  const referenceDigits = String(reference ?? "").replace(/\D/g, "");
  const amount = factValue(input.facts, ["financial.lossAmount"]);
  const evidenceCount = new Set(input.evidenceChecksums ?? []).size;

  const checks: SubmissionCheck[] = [
    {
      id: "routing.route",
      label: "Top-level reporting route",
      owner: "AI + citizen",
      status: input.route && input.route !== "UNKNOWN" ? "READY" : "MISSING",
      detail: input.route && input.route !== "UNKNOWN"
        ? "AI proposed the route; the citizen must confirm it before saving."
        : "The reporting route still needs citizen confirmation.",
    },
    {
      id: "incident.narrative",
      label: "Incident account · 200+ characters",
      owner: "Citizen",
      status: narrativeReady ? "READY" : "MISSING",
      detail: narrativeReady ? "Narration is detailed enough for the filing checklist." : "Add the sequence of events in a little more detail.",
    },
    {
      id: "incident.dateTime",
      label: "Exact incident date and time",
      owner: "Citizen",
      status: incidentDateTime ? "READY" : "MISSING",
      detail: incidentDateTime ? String(incidentDateTime) : "No exact date and time is confirmed yet.",
    },
    {
      id: "routing.district",
      label: "Incident district for routing",
      owner: "Citizen",
      status: input.district?.trim() ? "READY" : "MISSING",
      detail: input.district?.trim() || "District must be supplied by the citizen; it is never inferred.",
    },
    ...(isFinancial
      ? [
          {
            id: "financial.institution",
            label: "Bank, wallet, or merchant",
            owner: "Citizen" as const,
            status: institution ? "READY" as const : "MISSING" as const,
            detail: institution ? String(institution) : "Financial institution is still missing.",
          },
          {
            id: "financial.transactionReference",
            label: "12-digit transaction ID / UTR",
            owner: "AI + citizen" as const,
            status: referenceDigits.length === 12 ? "READY" as const : "MISSING" as const,
            detail: referenceDigits.length === 12 ? referenceDigits : "A 12-digit reference must be confirmed by the citizen.",
          },
          {
            id: "financial.lossAmount",
            label: "Fraud amount",
            owner: "Citizen" as const,
            status: typeof amount === "number" && amount > 0 ? "READY" as const : "MISSING" as const,
            detail: typeof amount === "number" && amount > 0 ? `₹${amount.toLocaleString("en-IN")}` : "Fraud amount is still missing.",
          },
        ]
      : []),
    {
      id: "evidence.primary",
      label: "Primary evidence with SHA-256 fingerprint",
      owner: "AI + citizen",
      status: evidenceCount > 0 ? "READY" : "MISSING",
      detail: evidenceCount > 0 ? `${evidenceCount} citizen-confirmed evidence file${evidenceCount === 1 ? "" : "s"}.` : "Add and confirm a relevant screenshot if available.",
    },
    {
      id: "complainant.identity",
      label: "Complainant identity document",
      owner: "Prototype boundary",
      status: "BOUNDARY",
      detail: "Intentionally not collected in this public synthetic prototype.",
    },
    {
      id: "complainant.mobileOtp",
      label: "Working mobile number and portal OTP",
      owner: "Prototype boundary",
      status: "BOUNDARY",
      detail: "Judge Test Mode replaces live mobile verification; no SMS gateway is connected.",
    },
  ];
  const readyCount = checks.filter((check) => check.status === "READY").length;
  const prototypeChecks = checks.filter((check) => check.status !== "BOUNDARY");
  const requiredCount = prototypeChecks.length;
  return {
    readyCount,
    requiredCount,
    outcome: prototypeChecks.every((check) => check.status === "READY") ? "READY" : "GAPS_REMAIN",
    checks,
  };
}
