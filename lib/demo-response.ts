import type { CandidateFact, CyberSaarthiResponse } from "./cybersaarthi-contract";
import { proposeNcrpTopLevelRoute } from "./ncrp-routing";

const amountPattern = /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i;
const phonePattern = /(?:^|[^\d])((?:\+91[-\s]?)?[6-9]\d{9})(?!\d)/;
const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/i;
const transactionReferencePattern = /\b(?:synthetic\s+)?(?:UTR|transaction(?:\s+(?:ID|reference))?)\s*(?:number|no\.?|is|:|-)?\s*([A-Z0-9][A-Z0-9-]{7,23})\b/i;
const dateTimePattern = /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}(?:\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?))?)/i;
const bankPattern = /\b((?:State Bank of India)|(?:[A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3}\s+Bank))\b/;
const upiPattern = /\b[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}\b/;
const ifscPattern = /\b[A-Z]{4}0[A-Z0-9]{6}\b/i;

function asNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function fact(
  fieldId: string,
  value: string | number | boolean | null,
  sourceText: string,
  explanation: string,
  createdAt: string,
): CandidateFact {
  return {
    fieldId,
    value,
    sourceType: "NARRATIVE",
    sourceText,
    evidenceIds: [],
    provider: "CyberSaarthi",
    method: "DETERMINISTIC_DEMO",
    model: null,
    confidence: 1,
    explanation,
    requiresHumanConfirmation: true,
    humanVerified: false,
    status: "PROPOSED",
    synthetic: true,
    createdAt,
  };
}

export function buildDemoResponse(
  story: string,
  selectedLanguage = "English",
): CyberSaarthiResponse {
  const amount = asNumber(story.match(amountPattern)?.[1]);
  const phone = story.match(phonePattern)?.[1] ?? null;
  const url = story.match(urlPattern)?.[0] ?? null;
  const transactionReference = story.match(transactionReferencePattern)?.[1] ?? null;
  const incidentDateTime = story.match(dateTimePattern)?.[1]?.replace(/[.,;:]$/, "") ?? null;
  const bank = story.match(bankPattern)?.[1] ?? null;
  const upiId = story.match(upiPattern)?.[0] ?? null;
  const ifsc = story.match(ifscPattern)?.[0]?.toUpperCase() ?? null;
  const hasFinancialSignal =
    amount !== null ||
    /debited|debit|transferred|paid|payment|upi|bank|money|रुपये|ಹಣ|డబ్బు/i.test(story);
  const routeProposal = proposeNcrpTopLevelRoute(story);
  const hasSms = /sms|message|text message|whatsapp/i.test(story);
  const installedApp = /installed|downloaded.+app|apk|remote access/i.test(story);
  const createdAt = new Date().toISOString();

  const topLevelRoute = routeProposal.topLevelRoute;

  const routeLabel =
    topLevelRoute === "FINANCIAL_FRAUD"
      ? "Financial fraud"
      : topLevelRoute === "WOMEN_CHILDREN_RELATED_CRIME"
        ? "Women/children-related crime"
        : topLevelRoute === "OTHER_CYBER_CRIME"
          ? "Other cyber crime"
          : "Unknown";

  const candidateFacts: CandidateFact[] = [
    fact(
      "incident.narrative",
      story,
      story,
      "Taken directly from the synthetic story.",
      createdAt,
    ),
  ];

  if (amount !== null) {
    candidateFacts.push(
      fact(
        "financial.lossAmount",
        amount,
        story.match(amountPattern)?.[0] ?? String(amount),
        "Amount is explicitly stated in the story.",
        createdAt,
      ),
    );
  }
  if (transactionReference) {
    candidateFacts.push(
      fact(
        "financial.transactionReference",
        transactionReference,
        transactionReference,
        "Transaction reference is explicitly stated in the story.",
        createdAt,
      ),
    );
  }
  if (incidentDateTime) {
    candidateFacts.push(
      fact(
        "incident.dateTime",
        incidentDateTime,
        incidentDateTime,
        "Date and time are explicitly stated in the story.",
        createdAt,
      ),
    );
  }
  if (bank) {
    candidateFacts.push(
      fact(
        "financial.institution",
        bank,
        bank,
        "Bank or financial institution is explicitly stated in the story.",
        createdAt,
      ),
    );
  }
  if (phone) {
    candidateFacts.push(
      fact("suspect.phone", phone, phone, "Phone number is explicitly stated.", createdAt),
    );
  }
  if (upiId) {
    candidateFacts.push(
      fact("suspect.upi_id", upiId, upiId, "UPI ID is explicitly stated.", createdAt),
    );
  }
  if (ifsc) {
    candidateFacts.push(
      fact("suspect.ifsc", ifsc, ifsc, "IFSC is explicitly stated.", createdAt),
    );
  }
  if (url) {
    candidateFacts.push(
      fact("suspect.url", url, url, "URL is explicitly stated.", createdAt),
    );
  }
  if (hasSms) {
    candidateFacts.push(
      fact("incident.initialContact", "SMS_OR_MESSAGE", "SMS/message", "Contact channel is stated.", createdAt),
    );
  }
  if (installedApp) {
    candidateFacts.push(
      fact("incident.installedApp", true, "installed/downloaded app", "App installation is stated.", createdAt),
    );
  }

  const timeline = [
    ...(hasSms
      ? [
          {
            sequence: 1,
            event: "A message was received.",
            dateTime: null,
            sourceType: "NARRATIVE" as const,
          },
        ]
      : []),
    ...(installedApp
      ? [
          {
            sequence: hasSms ? 2 : 1,
            event: "An app was installed after the contact.",
            dateTime: null,
            sourceType: "NARRATIVE" as const,
          },
        ]
      : []),
    ...(hasFinancialSignal
      ? [
          {
            sequence: (hasSms ? 1 : 0) + (installedApp ? 1 : 0) + 1,
            event: amount ? `An unauthorised debit of ₹${amount.toLocaleString("en-IN")} was noticed.` : "A financial loss was reported.",
            dateTime: incidentDateTime,
            sourceType: "NARRATIVE" as const,
          },
        ]
      : []),
  ];

  if (timeline.length === 0) {
    timeline.push({
      sequence: 1,
      event: "The reported cyber incident occurred.",
      dateTime: null,
      sourceType: "NARRATIVE",
    });
  }

  return {
    mode: "DEMO",
    integrationStatus: "DISCONNECTED",
    stage: "CLARIFICATION",
    reporterContext: "PRIMARY_VICTIM",
    frictionFlags: [
      "FILING_CONFUSION",
      ...(hasFinancialSignal ? ["URGENT_FINANCIAL_LOSS"] : []),
      "JURISDICTION_UNCERTAINTY",
    ],
    language: {
      detected: selectedLanguage,
      selected: selectedLanguage,
      mixedLanguage: false,
    },
    citizenMessage: hasFinancialSignal
      ? "I’m sorry this happened. Because money may have moved recently, act first: contact 1930 and your bank through an independently verified official channel. I can keep preparing the complaint while those steps are underway."
      : "Thank you for reporting it. I’ll keep unknown details visible instead of guessing.",
    citizenMessagePurpose: hasFinancialSignal ? "URGENT_GUIDANCE" : "ACKNOWLEDGEMENT",
    urgency: {
      level: hasFinancialSignal ? "TIME_SENSITIVE" : "ROUTINE",
      urgentFinancialAction: hasFinancialSignal,
      immediateDanger: false,
      selfHarmRisk: false,
      reason: hasFinancialSignal
        ? "The synthetic story reports a possible recent financial loss."
        : "No immediate danger or recent financial loss is stated.",
      recommendedAction: hasFinancialSignal
        ? "Call 1930 promptly and contact the bank or payment provider using an independently verified official channel. Do not share OTPs, PINs, or recovery fees."
        : "Continue reviewing the prepared facts and preserve available evidence.",
    },
    transcript: { text: story, confirmed: true, uncertainSegments: [] },
    incidentSummary: story,
    classification: {
      topLevelRoute,
      subcategory: null,
      confidence: routeProposal.confidence,
      explanation: `${routeProposal.explanation} Proposed route: “${routeLabel}”.`,
      alternatives: topLevelRoute === "OTHER_CYBER_CRIME" ? ["FINANCIAL_FRAUD"] : ["OTHER_CYBER_CRIME"],
      requiresHumanConfirmation: true,
    },
    timeline,
    candidateFacts,
    requirements: [
      {
        fieldId: "incident.narrative",
        label: "Incident description",
        required: true,
        status: "KNOWN",
        reason: "Supplied in the synthetic story.",
      },
      {
        fieldId: "routing.district",
        label: "District for routing",
        required: true,
        status: "UNKNOWN",
        reason: "A district cannot be inferred from language, phone code, or bank branch.",
      },
      {
        fieldId: "financial.transactionReference",
        label: "Transaction reference",
        required: hasFinancialSignal,
        status: transactionReference ? "KNOWN" : "UNKNOWN",
        reason: transactionReference
          ? "Explicitly supplied in the synthetic story."
          : "No transaction reference is stated.",
      },
      {
        fieldId: "incident.dateTime",
        label: "Incident date and time",
        required: true,
        status: incidentDateTime ? "KNOWN" : "UNKNOWN",
        reason: incidentDateTime
          ? "Explicitly supplied in the synthetic story."
          : "No precise date and time is stated.",
      },
      {
        fieldId: "financial.institution",
        label: "Bank, wallet, or merchant",
        required: hasFinancialSignal,
        status: bank ? "KNOWN" : "UNKNOWN",
        reason: bank
          ? "Explicitly supplied in the synthetic story."
          : "No bank, wallet, or merchant is stated.",
      },
    ],
    evidenceManifest: [],
    evidenceFindings: [],
    unknownFields: [
      {
        fieldId: "routing.district",
        label: "District",
        reason: "Not supplied; CyberSaarthi will not infer jurisdiction.",
      },
      ...(!incidentDateTime
        ? [{
            fieldId: "incident.dateTime",
            label: "Incident date and time",
            reason: "No precise date and time is supplied.",
          }]
        : []),
      ...(hasFinancialSignal
        ? [
            ...(!bank
              ? [{
                  fieldId: "financial.institution",
                  label: "Bank, wallet, or merchant",
                  reason: "Not supplied in the story.",
                }]
              : []),
            ...(!transactionReference
              ? [{
                  fieldId: "financial.transactionReference",
                  label: "Transaction reference",
                  reason: "Not supplied in the story.",
                }]
              : []),
          ]
        : []),
    ],
    conflicts: [],
    clarification: {
      required: true,
      fieldId: "routing.district",
      question: "Which district should be used for routing this complaint?",
      reason: "This helps prepare the routing field without guessing jurisdiction.",
    },
    routingSuggestion: {
      status: "HUMAN_REVIEW_REQUIRED",
      route: topLevelRoute,
      jurisdiction: null,
      automaticFirEligibility: "UNKNOWN",
      explanation:
        "Jurisdiction remains unknown. Any Zero FIR or e-Zero FIR pathway must be reviewed against current location-, threshold-, date-, and programme-specific rules.",
    },
    officialStatus: {
      value: "PREPARATION_ONLY",
      acknowledgementId: null,
      firNumber: null,
      sourceEvidenceIds: [],
      verifiedByCyberSaarthi: false,
      requiresHumanConfirmation: true,
      explanation:
        "CyberSaarthi is preparing a complaint only. No NCRP acknowledgement, FIR, or investigation is established.",
    },
    accountFreezeSupport: {
      applies: false,
      bank: null,
      maskedAccount: null,
      freezeOrLienAmount: null,
      noticeDate: null,
      noticeReference: null,
      policeOrIoDetails: null,
      transactionPurpose: null,
      nextOfficialChannel: null,
    },
    registryMatch: {
      status: "NOT_CHECKED",
      result: null,
      synthetic: true,
      explanation: "No suspect-repository integration was called.",
    },
    readiness: {
      outcome: "READY_WITH_KNOWN_GAPS",
      readyForReview: true,
      reviewCompleted: false,
      readyToRecord: false,
      blockingReasons: ["Confirm the proposed route.", "Provide or mark the routing district unknown."],
    },
    reviewPayload: {
      incidentNarrative: null,
      incidentDate: null,
      lossAmount: null,
      transactionReference: null,
      suspectPhone: null,
      suspectUrl: null,
      district: null,
    },
    followUp: {
      needed: false,
      reason: null,
      draftAvailable: false,
      requiresCitizenReview: true,
    },
    warnings: [
      "Synthetic demonstration only. Do not enter real personal, banking, or identity information.",
      "CyberSaarthi is not connected to NCRP, I4C, a bank, police, or a suspect repository.",
    ],
    nextAction: "Confirm the proposed reporting route and answer the single routing question.",
  };
}
