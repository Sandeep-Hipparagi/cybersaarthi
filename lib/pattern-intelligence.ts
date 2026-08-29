import { and, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import {
  caseGraphIdentifiers,
  casePatternMatches,
  caseRelationships,
  cases,
} from "../db/schema";
import { getDb } from "../db";

export const SAARTHIGRAPH_ENGINE_VERSION = 1;

export type PatternSignal = {
  id: string;
  code: string;
  label: string;
  confidence: number;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  evidence: string[];
  explanation: string;
  engineVersion: number;
  createdAt: string;
};

export type RelationshipSignal = {
  id: string;
  relationshipType: "SHARED_VERIFIED_IDENTIFIER" | "SHARED_TECHNICAL_IDENTIFIER" | "SAME_PATTERN";
  confidence: number;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  deterministic: boolean;
  explanation: string;
  sharedSignals: string[];
  peerCaseId: string | null;
  peerReference: string | null;
  peerTitle: string | null;
  peerDistrict: string | null;
  crossDistrict: boolean;
  createdAt: string;
};

export type CaseIntelligence = {
  engineVersion: number;
  patterns: PatternSignal[];
  relationships: RelationshipSignal[];
  topology: {
    connectedCaseCount: number;
    crossDistrictCount: number;
    proposedCount: number;
    confirmedCount: number;
    rejectedCount: number;
    sharedIdentifierCount: number;
    componentSize: number;
    activeCampaignCandidate: boolean;
  };
  boundary: string;
};

type IntelligenceInput = {
  id: string;
  narrativeEnglish: string;
  facts: Array<Record<string, unknown>>;
  intelligenceVersion: number;
};

type PatternDefinition = {
  code: string;
  label: string;
  minimumSignals: number;
  baseConfidenceBps: number;
  explanation: string;
  signals: Array<{ label: string; pattern: RegExp }>;
};

type IdentifierCandidate = {
  identifierType: string;
  normalizedValue: string;
  displayLabel: string;
  sourceFieldId: string;
  sourceLabel: string;
};

const PATTERNS: PatternDefinition[] = [
  {
    code: "APK_REMOTE_ACCESS_FRAUD",
    label: "APK or remote-access fraud",
    minimumSignals: 2,
    baseConfidenceBps: 7800,
    explanation: "The reviewed account follows an app-install or remote-access fraud sequence.",
    signals: [
      { label: "app or remote-access installation", pattern: /\b(?:apk|anydesk|teamviewer|remote access|screen shar|installed? (?:an? )?app)\b/i },
      { label: "urgent service or KYC pretext", pattern: /\b(?:electricity|bill|disconnect|kyc|courier|refund)\b/i },
      { label: "financial movement", pattern: /(?:₹|\bdebit(?:ed)?\b|\bupi\b|\bbank\b|\bpayment\b|\bmoney\b)/i },
    ],
  },
  {
    code: "TASK_JOB_SCAM",
    label: "Part-time task or job scam",
    minimumSignals: 2,
    baseConfidenceBps: 8000,
    explanation: "The reviewed account follows a task, deposit, and blocked-withdrawal scam sequence.",
    signals: [
      { label: "task or part-time job offer", pattern: /\b(?:part[ -]?time|job offer|online task|rating task|review task|commission task)\b/i },
      { label: "messaging-channel contact", pattern: /\b(?:telegram|whatsapp|message group|chat group)\b/i },
      { label: "deposit or recharge request", pattern: /\b(?:deposit|recharge|pay(?:ment)?|transfer|upi|commission)\b/i },
      { label: "withdrawal blocked", pattern: /\b(?:withdrawal blocked|cannot withdraw|release the amount|unlock withdrawal)\b/i },
    ],
  },
  {
    code: "DIGITAL_ARREST_IMPERSONATION",
    label: "Digital-arrest impersonation",
    minimumSignals: 2,
    baseConfidenceBps: 8200,
    explanation: "The reviewed account contains public-authority impersonation and coercive payment signals.",
    signals: [
      { label: "authority impersonation", pattern: /\b(?:cbi|police|customs|narcotics|court|public servant)\b/i },
      { label: "digital-arrest language", pattern: /\b(?:digital arrest|arrest warrant|money laundering case)\b/i },
      { label: "coercive video or secrecy demand", pattern: /\b(?:video call|stay on call|do not tell|secrecy)\b/i },
      { label: "fund-transfer demand", pattern: /\b(?:safe account|verification account|transfer|pay|deposit)\b/i },
    ],
  },
  {
    code: "PAYMENT_LINK_PHISHING",
    label: "Payment-link or collect-request fraud",
    minimumSignals: 2,
    baseConfidenceBps: 7600,
    explanation: "The reviewed account combines a payment-link or collect-request action with financial loss.",
    signals: [
      { label: "payment-link or QR action", pattern: /\b(?:payment link|collect request|qr code|scan(?:ned)? qr|refund link)\b/i },
      { label: "credential action", pattern: /\b(?:otp|pin|cvv|password|approve(?:d)? request)\b/i },
      { label: "financial loss", pattern: /(?:₹|\bdebit(?:ed)?\b|\bdeducted\b|\blost money\b)/i },
    ],
  },
  {
    code: "ACCOUNT_TAKEOVER",
    label: "Account takeover",
    minimumSignals: 2,
    baseConfidenceBps: 7700,
    explanation: "The reviewed account contains access-loss and credential-change signals.",
    signals: [
      { label: "account access lost", pattern: /\b(?:hacked|locked out|account takeover|cannot log in)\b/i },
      { label: "credential changed", pattern: /\b(?:password changed|email changed|phone changed|recovery changed)\b/i },
      { label: "unauthorised activity", pattern: /\b(?:unknown login|unauthorised post|unauthorized message|sent messages)\b/i },
    ],
  },
  {
    code: "SEXTORTION_BLACKMAIL",
    label: "Sextortion or intimate-media blackmail",
    minimumSignals: 2,
    baseConfidenceBps: 8400,
    explanation: "The reviewed account contains intimate-media and coercive threat signals.",
    signals: [
      { label: "intimate-media signal", pattern: /\b(?:intimate image|nude|private video|sexual video|morphed image)\b/i },
      { label: "blackmail or threat", pattern: /\b(?:blackmail|threat|publish|share with family|send to contacts)\b/i },
      { label: "payment demand", pattern: /\b(?:pay|money demand|transfer|extortion)\b/i },
    ],
  },
];

const FIELD_IDENTIFIER_TYPES: Record<string, string> = {
  "suspect.phone": "PHONE",
  "financial.suspectPhone": "PHONE",
  "suspect.upi_id": "UPI_ID",
  "financial.suspectVpa": "UPI_ID",
  "transaction.reference": "TRANSACTION_REFERENCE",
  "transaction.utr": "TRANSACTION_REFERENCE",
  "financial.transactionReference": "TRANSACTION_REFERENCE",
  "suspect.account": "ACCOUNT_NUMBER",
  "financial.suspectAccount": "ACCOUNT_NUMBER",
  "suspect.url": "URL",
  "incident.url": "URL",
  "evidence.templateFingerprint": "TEMPLATE_FINGERPRINT",
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function caseReference(caseId: string): string {
  return /^CYS-DEMO-(\d{14})$/.exec(caseId)?.[1] ?? caseId;
}

function intelligenceText(narrativeEnglish: string, facts: Array<Record<string, unknown>>): string {
  const factText = facts.map((fact) => `${String(fact.label ?? fact.fieldId ?? "")} ${String(fact.value ?? "")}`);
  return [narrativeEnglish, ...factText].join(" \n").normalize("NFKC");
}

export function recognisePatterns(
  narrativeEnglish: string,
  facts: Array<Record<string, unknown>>,
): Array<Omit<PatternSignal, "id" | "status" | "engineVersion" | "createdAt">> {
  const text = intelligenceText(narrativeEnglish, facts);
  return PATTERNS.flatMap((definition) => {
    const evidence = definition.signals
      .filter((signal) => signal.pattern.test(text))
      .map((signal) => signal.label);
    if (evidence.length < definition.minimumSignals) return [];
    return [{
      code: definition.code,
      label: definition.label,
      confidence: Math.min(0.98, (definition.baseConfidenceBps + evidence.length * 350) / 10_000),
      evidence,
      explanation: definition.explanation,
    }];
  });
}

function normalizeIdentifier(identifierType: string, rawValue: unknown): string | null {
  const value = String(rawValue ?? "").normalize("NFKC").trim();
  if (!value) return null;
  if (identifierType === "PHONE") {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 12 ? digits.slice(-10) : null;
  }
  if (identifierType === "UPI_ID") {
    const normalized = value.toLowerCase().replace(/\s/g, "");
    return /^[a-z0-9._-]{2,}@[a-z0-9.-]{2,}$/i.test(normalized) ? normalized : null;
  }
  if (identifierType === "TRANSACTION_REFERENCE") {
    const normalized = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    return normalized.length >= 8 && normalized.length <= 32 ? normalized : null;
  }
  if (identifierType === "ACCOUNT_NUMBER") {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 18 ? digits : null;
  }
  if (identifierType === "URL") {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
    } catch {
      return null;
    }
  }
  if (identifierType === "EVIDENCE_HASH") {
    const normalized = value.toLowerCase().replace(/[^a-f0-9]/g, "");
    return normalized.length === 64 ? normalized : null;
  }
  if (identifierType === "TEMPLATE_FINGERPRINT") {
    const normalized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return normalized.length >= 12 ? normalized : null;
  }
  return null;
}

function maskedIdentifier(identifierType: string, value: string): string {
  if (identifierType === "UPI_ID") {
    const [handle, provider] = value.split("@");
    const visible = handle.length <= 4 ? `${handle.slice(0, 1)}•••` : `${handle.slice(0, 2)}•••${handle.slice(-2)}`;
    return `${visible}@${provider}`;
  }
  if (identifierType === "URL") return value.split("/")[0];
  if (identifierType === "EVIDENCE_HASH" || identifierType === "TEMPLATE_FINGERPRINT") {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }
  return `••••${value.slice(-4)}`;
}

function identifierCandidates(facts: Array<Record<string, unknown>>): IdentifierCandidate[] {
  const candidates: IdentifierCandidate[] = [];
  for (const fact of facts) {
    const fieldId = String(fact.fieldId ?? "");
    const identifierType = FIELD_IDENTIFIER_TYPES[fieldId];
    if (identifierType) {
      const normalizedValue = normalizeIdentifier(identifierType, fact.value);
      if (normalizedValue) {
        candidates.push({
          identifierType,
          normalizedValue,
          displayLabel: maskedIdentifier(identifierType, normalizedValue),
          sourceFieldId: fieldId,
          sourceLabel: String(fact.label ?? fieldId),
        });
      }
    }
    const evidenceHash = normalizeIdentifier("EVIDENCE_HASH", fact.checksum);
    if (evidenceHash) {
      candidates.push({
        identifierType: "EVIDENCE_HASH",
        normalizedValue: evidenceHash,
        displayLabel: maskedIdentifier("EVIDENCE_HASH", evidenceHash),
        sourceFieldId: fieldId || "evidence.checksum",
        sourceLabel: "Citizen-confirmed evidence fingerprint",
      });
    }
  }
  const unique = new Map<string, IdentifierCandidate>();
  for (const candidate of candidates) {
    unique.set(`${candidate.identifierType}:${candidate.normalizedValue}`, candidate);
  }
  return [...unique.values()];
}

async function identifierFingerprint(identifierType: string, normalizedValue: string): Promise<string> {
  const secret = process.env.GRAPH_HMAC_SECRET ?? process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("GRAPH_HASH_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${identifierType}:${normalizedValue}`),
  );
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function relationshipIdentity(leftCaseId: string, rightCaseId: string): [string, string] {
  return leftCaseId.localeCompare(rightCaseId) <= 0
    ? [leftCaseId, rightCaseId]
    : [rightCaseId, leftCaseId];
}

export async function indexCaseIntelligence(input: IntelligenceInput): Promise<void> {
  if (input.intelligenceVersion >= SAARTHIGRAPH_ENGINE_VERSION) return;
  const db = getDb();
  const now = new Date().toISOString();
  await db.batch([
    db.delete(caseRelationships).where(or(
      eq(caseRelationships.sourceCaseId, input.id),
      eq(caseRelationships.targetCaseId, input.id),
    )),
    db.delete(caseGraphIdentifiers).where(eq(caseGraphIdentifiers.caseId, input.id)),
    db.delete(casePatternMatches).where(eq(casePatternMatches.caseId, input.id)),
  ]);

  const patterns = recognisePatterns(input.narrativeEnglish, input.facts);
  if (patterns.length > 0) {
    await db.insert(casePatternMatches).values(patterns.map((pattern) => ({
      id: crypto.randomUUID(),
      caseId: input.id,
      patternCode: pattern.code,
      label: pattern.label,
      confidenceBps: Math.round(pattern.confidence * 10_000),
      status: "PROPOSED",
      evidenceJson: JSON.stringify(pattern.evidence),
      explanation: pattern.explanation,
      engineVersion: SAARTHIGRAPH_ENGINE_VERSION,
      createdAt: now,
    }))).onConflictDoNothing();
  }

  const candidates = identifierCandidates(input.facts);
  const indexedCandidates = await Promise.all(candidates.map(async (candidate) => ({
    ...candidate,
    fingerprint: await identifierFingerprint(candidate.identifierType, candidate.normalizedValue),
  })));
  if (indexedCandidates.length > 0) {
    await db.insert(caseGraphIdentifiers).values(indexedCandidates.map((candidate) => ({
      id: crypto.randomUUID(),
      caseId: input.id,
      identifierType: candidate.identifierType,
      fingerprint: candidate.fingerprint,
      displayLabel: candidate.displayLabel,
      sourceFieldId: candidate.sourceFieldId,
      sourceLabel: candidate.sourceLabel,
      createdAt: now,
    }))).onConflictDoNothing();
  }

  const sharedByCase = new Map<string, Array<{ identifierType: string; displayLabel: string }>>();
  if (indexedCandidates.length > 0) {
    const fingerprints = indexedCandidates.map((candidate) => candidate.fingerprint);
    const existing = await db
      .select()
      .from(caseGraphIdentifiers)
      .where(and(
        inArray(caseGraphIdentifiers.fingerprint, fingerprints),
        ne(caseGraphIdentifiers.caseId, input.id),
      ));
    for (const row of existing) {
      if (!indexedCandidates.some((candidate) =>
        candidate.identifierType === row.identifierType && candidate.fingerprint === row.fingerprint)) continue;
      const signal = { identifierType: row.identifierType, displayLabel: row.displayLabel };
      const current = sharedByCase.get(row.caseId) ?? [];
      if (!current.some((item) => item.identifierType === signal.identifierType && item.displayLabel === signal.displayLabel)) {
        current.push(signal);
      }
      sharedByCase.set(row.caseId, current);
    }
  }

  for (const [otherCaseId, shared] of sharedByCase) {
    const [sourceCaseId, targetCaseId] = relationshipIdentity(input.id, otherCaseId);
    const hasVerified = shared.some((item) =>
      ["TRANSACTION_REFERENCE", "EVIDENCE_HASH", "TEMPLATE_FINGERPRINT"].includes(item.identifierType));
    const relationshipType = hasVerified ? "SHARED_VERIFIED_IDENTIFIER" : "SHARED_TECHNICAL_IDENTIFIER";
    const confidenceBps = hasVerified ? 9900 : shared.length > 1 ? 9600 : 9000;
    const sharedSignals = shared.map((item) => `${item.identifierType.replaceAll("_", " ")} · ${item.displayLabel}`);
    await db.insert(caseRelationships).values({
      id: crypto.randomUUID(),
      sourceCaseId,
      targetCaseId,
      relationshipType,
      confidenceBps,
      status: "PROPOSED",
      deterministic: true,
      evidenceJson: JSON.stringify(sharedSignals),
      explanation: "Citizen-confirmed technical identifiers are shared across separate synthetic cases. Human review is required.",
      engineVersion: SAARTHIGRAPH_ENGINE_VERSION,
      createdAt: now,
    }).onConflictDoNothing();
  }

  if (patterns.length > 0) {
    const patternCodes = patterns.map((pattern) => pattern.code);
    const peers = await db
      .select({ caseId: casePatternMatches.caseId, patternCode: casePatternMatches.patternCode, label: casePatternMatches.label })
      .from(casePatternMatches)
      .where(and(
        inArray(casePatternMatches.patternCode, patternCodes),
        ne(casePatternMatches.caseId, input.id),
      ));
    const samePatternByCase = new Map<string, Set<string>>();
    for (const peer of peers) {
      if (sharedByCase.has(peer.caseId)) continue;
      const labels = samePatternByCase.get(peer.caseId) ?? new Set<string>();
      labels.add(peer.label);
      samePatternByCase.set(peer.caseId, labels);
    }
    for (const [otherCaseId, labels] of samePatternByCase) {
      const [sourceCaseId, targetCaseId] = relationshipIdentity(input.id, otherCaseId);
      await db.insert(caseRelationships).values({
        id: crypto.randomUUID(),
        sourceCaseId,
        targetCaseId,
        relationshipType: "SAME_PATTERN",
        confidenceBps: 7200,
        status: "PROPOSED",
        deterministic: true,
        evidenceJson: JSON.stringify([...labels]),
        explanation: "The cases match the same deterministic scam playbook, but no shared identity is established.",
        engineVersion: SAARTHIGRAPH_ENGINE_VERSION,
        createdAt: now,
      }).onConflictDoNothing();
    }
  }

  await db
    .update(cases)
    .set({ intelligenceVersion: SAARTHIGRAPH_ENGINE_VERSION })
    .where(eq(cases.id, input.id));
}

export async function ensurePendingCaseIntelligence(): Promise<void> {
  const db = getDb();
  const pending = await db
    .select({
      id: cases.id,
      narrativeEnglish: cases.narrativeEnglish,
      factsJson: cases.factsJson,
      intelligenceVersion: cases.intelligenceVersion,
    })
    .from(cases)
    .where(lt(cases.intelligenceVersion, SAARTHIGRAPH_ENGINE_VERSION));
  for (const row of pending) {
    await indexCaseIntelligence({
      id: row.id,
      narrativeEnglish: row.narrativeEnglish,
      facts: parseJson<Array<Record<string, unknown>>>(row.factsJson, []),
      intelligenceVersion: row.intelligenceVersion,
    });
  }
}

export async function loadCaseIntelligence(
  caseIds: string[],
  role: "CITIZEN" | "EVALUATOR",
): Promise<Map<string, CaseIntelligence>> {
  const output = new Map<string, CaseIntelligence>();
  if (caseIds.length === 0) return output;
  const db = getDb();
  const patternRows = await db
    .select()
    .from(casePatternMatches)
    .where(inArray(casePatternMatches.caseId, caseIds))
    .orderBy(desc(casePatternMatches.confidenceBps));
  const relationshipRows = await db
    .select()
    .from(caseRelationships)
    .where(or(
      inArray(caseRelationships.sourceCaseId, caseIds),
      inArray(caseRelationships.targetCaseId, caseIds),
    ))
    .orderBy(desc(caseRelationships.confidenceBps));
  const allCaseIds = [...new Set([
    ...caseIds,
    ...relationshipRows.flatMap((row) => [row.sourceCaseId, row.targetCaseId]),
  ])];
  const peerRows = await db
    .select({
      id: cases.id,
      title: cases.title,
      district: cases.district,
    })
    .from(cases)
    .where(inArray(cases.id, allCaseIds));
  const peerMap = new Map(peerRows.map((row) => [row.id, row]));

  for (const caseId of caseIds) {
    const current = peerMap.get(caseId);
    const patterns: PatternSignal[] = patternRows
      .filter((row) => row.caseId === caseId)
      .map((row) => ({
        id: row.id,
        code: row.patternCode,
        label: row.label,
        confidence: row.confidenceBps / 10_000,
        status: row.status as PatternSignal["status"],
        evidence: parseJson<string[]>(row.evidenceJson, []),
        explanation: row.explanation,
        engineVersion: row.engineVersion,
        createdAt: row.createdAt,
      }));
    const relationships: RelationshipSignal[] = relationshipRows
      .filter((row) => row.sourceCaseId === caseId || row.targetCaseId === caseId)
      .map((row) => {
        const peerCaseId = row.sourceCaseId === caseId ? row.targetCaseId : row.sourceCaseId;
        const peer = peerMap.get(peerCaseId);
        const crossDistrict = Boolean(current?.district && peer?.district && current.district !== peer.district);
        return {
          id: row.id,
          relationshipType: row.relationshipType as RelationshipSignal["relationshipType"],
          confidence: row.confidenceBps / 10_000,
          status: row.status as RelationshipSignal["status"],
          deterministic: row.deterministic,
          explanation: role === "EVALUATOR"
            ? row.explanation
            : "A pattern or confirmed technical field in this case also appears in another synthetic case. Other citizen details remain hidden.",
          sharedSignals: parseJson<string[]>(row.evidenceJson, []),
          peerCaseId: role === "EVALUATOR" ? peerCaseId : null,
          peerReference: role === "EVALUATOR" ? caseReference(peerCaseId) : null,
          peerTitle: role === "EVALUATOR" ? peer?.title ?? "Synthetic case" : null,
          peerDistrict: role === "EVALUATOR" ? peer?.district ?? null : null,
          crossDistrict,
          createdAt: row.createdAt,
        };
      });
    const uniquePeers = new Set(relationships.map((relationship) =>
      relationship.peerCaseId ?? relationship.id));
    output.set(caseId, {
      engineVersion: SAARTHIGRAPH_ENGINE_VERSION,
      patterns,
      relationships,
      topology: {
        connectedCaseCount: uniquePeers.size,
        crossDistrictCount: relationships.filter((relationship) => relationship.crossDistrict).length,
        proposedCount: relationships.filter((relationship) => relationship.status === "PROPOSED").length,
        confirmedCount: relationships.filter((relationship) => relationship.status === "CONFIRMED").length,
        rejectedCount: relationships.filter((relationship) => relationship.status === "REJECTED").length,
        sharedIdentifierCount: relationships.filter((relationship) =>
          relationship.relationshipType !== "SAME_PATTERN").length,
        componentSize: uniquePeers.size + 1,
        activeCampaignCandidate: uniquePeers.size >= 2 && patterns.length > 0,
      },
      boundary: "Pattern and topology signals support review only. They never establish identity, guilt, jurisdiction, or an official outcome.",
    });
  }
  return output;
}

export async function reviewRelationship(input: {
  caseId: string;
  relationshipId: string;
  reviewerLabel: string;
  status: "CONFIRMED" | "REJECTED";
}): Promise<{ sourceCaseId: string; targetCaseId: string }> {
  const db = getDb();
  const [relationship] = await db
    .select()
    .from(caseRelationships)
    .where(and(
      eq(caseRelationships.id, input.relationshipId),
      or(
        eq(caseRelationships.sourceCaseId, input.caseId),
        eq(caseRelationships.targetCaseId, input.caseId),
      ),
    ))
    .limit(1);
  if (!relationship) throw new Error("RELATIONSHIP_NOT_FOUND");
  await db
    .update(caseRelationships)
    .set({
      status: input.status,
      reviewedAt: new Date().toISOString(),
      reviewerLabel: input.reviewerLabel,
    })
    .where(eq(caseRelationships.id, input.relationshipId));
  return {
    sourceCaseId: relationship.sourceCaseId,
    targetCaseId: relationship.targetCaseId,
  };
}
