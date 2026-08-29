import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  caseEvents,
  caseGraphIdentifiers,
  casePatternMatches,
  caseRelationships,
  cases,
  supportMessages,
} from "../db/schema";
import { getDb } from "../db";
import type { DemoSession } from "./demo-auth";
import {
  buildSubmissionReadiness,
  caseSourceLabel,
  createCaseFingerprint,
  type CaseIntegrityInput,
} from "./case-integrity";
import {
  ensurePendingCaseIntelligence,
  indexCaseIntelligence,
  loadCaseIntelligence,
  reviewRelationship,
  type CaseIntelligence,
} from "./pattern-intelligence";
import {
  deleteCaseWorkflowRecords,
  resetCaseWorkflowRecords,
  syncCaseWorkflowRecords,
} from "./workflow-repository";

export type CaseStatus =
  | "SYNTHETIC_RECORDED"
  | "REVIEW_IN_PROGRESS"
  | "INFORMATION_REQUESTED"
  | "FOLLOW_UP_RECEIVED"
  | "SYNTHETIC_RESOLVED"
  | "CLOSED_SETTLED";

export type CaseEvent = {
  id: string;
  eventType: string;
  title: string;
  description: string;
  actorRole: string;
  actorLabel: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SupportMessage = {
  id: string;
  senderEmail: string;
  senderRole: string;
  languageCode: string;
  body: string;
  synthetic: boolean;
  createdAt: string;
};

export type SupportCaseContext = {
  title: string;
  status: string;
  route: string;
  district: string | null;
  facts: Array<Record<string, unknown>>;
  unknowns: Array<Record<string, unknown>>;
  recentMessages: Array<{ senderRole: string; body: string }>;
  latestCitizenMessage: string;
};

export type CaseRecord = {
  id: string;
  demoReference: string | null;
  ownerEmail: string;
  reporterName: string;
  title: string;
  narrativeNative: string;
  narrativeEnglish: string;
  languageCode: string;
  provider: string;
  model: string | null;
  route: string;
  district: string | null;
  lossAmount: number | null;
  status: CaseStatus;
  urgency: string;
  facts: Array<Record<string, unknown>>;
  unknowns: Array<Record<string, unknown>>;
  assignedTo: string | null;
  synthetic: boolean;
  createdAt: string;
  updatedAt: string;
  events: CaseEvent[];
  messages: SupportMessage[];
  intelligence: CaseIntelligence;
};

export type NewCaseInput = {
  title: string;
  narrativeNative: string;
  narrativeEnglish: string;
  languageCode: string;
  provider: string;
  model: string | null;
  route: string;
  district: string | null;
  lossAmount: number | null;
  urgency: string;
  facts: Array<Record<string, unknown>>;
  unknowns: Array<Record<string, unknown>>;
};

type CaseRow = typeof cases.$inferSelect;

export class DuplicateCaseError extends Error {
  constructor(
    readonly existingCaseId: string,
    readonly demoReference: string | null,
  ) {
    super("DUPLICATE_CASE");
  }
}

const SEED_CASES: Array<typeof cases.$inferInsert> = [
  {
    id: "CYS-DEMO-26082200000001",
    ownerEmail: "citizen@test.com",
    reporterName: "Sandeep Hipparagi",
    title: "Electricity bill message and unauthorised debit",
    narrativeNative:
      "I received a message saying my electricity service would be disconnected. I called the number, installed an app, and later noticed an unauthorised debit of ₹25,000.",
    narrativeEnglish:
      "I received a message saying my electricity service would be disconnected. I called the number, installed an app, and later noticed an unauthorised debit of ₹25,000.",
    languageCode: "unknown",
    provider: "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
    model: "saaras:v3-compatible mock",
    route: "FINANCIAL_FRAUD",
    district: "Bengaluru Urban",
    lossAmount: 25000,
    status: "INFORMATION_REQUESTED",
    urgency: "TIME_SENSITIVE",
    factsJson: JSON.stringify([
      { fieldId: "financial.lossAmount", label: "Reported loss", value: 25000, source: "Citizen-reviewed transcript" },
      { fieldId: "financial.institution", label: "Bank", value: "State Bank of India", source: "Synthetic fixture" },
      { fieldId: "transaction.reference", label: "Transaction reference", value: "409823771204", source: "Synthetic fixture" },
      { fieldId: "transaction.occurred_at", label: "Transaction time", value: "22 Aug 2026, 10:32 IST", source: "Synthetic fixture" },
      { fieldId: "incident.initialContact", label: "Initial contact", value: "SMS", source: "Citizen-reviewed transcript" },
      { fieldId: "incident.installedApp", label: "App installed", value: true, source: "Citizen-reviewed transcript" },
    ]),
    unknownsJson: "[]",
    assignedTo: "Demo review desk",
    synthetic: true,
    createdAt: "2026-08-22T05:35:00.000Z",
    updatedAt: "2026-08-23T07:20:00.000Z",
  },
  {
    id: "CYS-DEMO-26082200000002",
    ownerEmail: "ravi.synthetic@example.test",
    reporterName: "Ravi S. (synthetic)",
    title: "Marketplace payment link",
    narrativeNative:
      "I listed a used phone for sale. After opening a payment link sent by the buyer, ₹8,500 was debited.",
    narrativeEnglish:
      "I listed a used phone for sale. After opening a payment link sent by the buyer, ₹8,500 was debited.",
    languageCode: "unknown",
    provider: "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
    model: "saaras:v3-compatible mock",
    route: "FINANCIAL_FRAUD",
    district: "Mysuru",
    lossAmount: 8500,
    status: "REVIEW_IN_PROGRESS",
    urgency: "TIME_SENSITIVE",
    factsJson: JSON.stringify([
      { fieldId: "financial.lossAmount", label: "Reported loss", value: 8500, source: "Synthetic fixture" },
      { fieldId: "financial.institution", label: "Bank", value: "HDFC Bank", source: "Synthetic fixture" },
      { fieldId: "transaction.reference", label: "Transaction reference", value: "409823771215", source: "Synthetic fixture" },
      { fieldId: "incident.channel", label: "Channel", value: "Marketplace link", source: "Synthetic fixture" },
    ]),
    unknownsJson: JSON.stringify([
      { fieldId: "suspect.phone", label: "Suspect phone", reason: "Not supplied" },
    ]),
    assignedTo: "Demo review desk",
    synthetic: true,
    createdAt: "2026-08-22T09:10:00.000Z",
    updatedAt: "2026-08-23T06:00:00.000Z",
  },
  {
    id: "CYS-DEMO-26082100000003",
    ownerEmail: "priya.synthetic@example.test",
    reporterName: "Priya M. (synthetic)",
    title: "Impersonation profile and threatening messages",
    narrativeNative:
      "Someone created a fake social media account in my name and sent threatening messages to my friends.",
    narrativeEnglish:
      "Someone created a fake social media account in my name and sent threatening messages to my friends.",
    languageCode: "unknown",
    provider: "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
    model: "saaras:v3-compatible mock",
    route: "OTHER_CYBER_CRIME",
    district: "Chennai",
    lossAmount: null,
    status: "SYNTHETIC_RESOLVED",
    urgency: "ROUTINE",
    factsJson: JSON.stringify([
      { fieldId: "incident.type", label: "Incident", value: "Impersonation", source: "Synthetic fixture" },
      { fieldId: "incident.platform", label: "Platform", value: "Unknown", source: "Synthetic fixture" },
    ]),
    unknownsJson: JSON.stringify([
      { fieldId: "suspect.identity", label: "Suspect identity", reason: "Unknown" },
    ]),
    assignedTo: "Demo review desk",
    synthetic: true,
    createdAt: "2026-08-21T11:45:00.000Z",
    updatedAt: "2026-08-22T15:30:00.000Z",
  },
];

const SAARTHIGRAPH_SEED_CASES: Array<typeof cases.$inferInsert> = [
  {
    id: "CYS-DEMO-26082400000004",
    ownerEmail: "kiran.synthetic@example.test",
    reporterName: "Kiran P. (synthetic)",
    title: "Part-time rating tasks and blocked withdrawal",
    narrativeNative:
      "A Telegram group offered part-time rating tasks. After two small commissions, I transferred ₹12,000 by UPI and the withdrawal was blocked.",
    narrativeEnglish:
      "A Telegram group offered part-time rating tasks. After two small commissions, I transferred ₹12,000 by UPI and the withdrawal was blocked.",
    languageCode: "unknown",
    provider: "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
    model: "saaras:v3-compatible mock",
    route: "FINANCIAL_FRAUD",
    district: "Pune",
    lossAmount: 12000,
    status: "REVIEW_IN_PROGRESS",
    urgency: "TIME_SENSITIVE",
    factsJson: JSON.stringify([
      { fieldId: "financial.lossAmount", label: "Reported loss", value: 12000, source: "Synthetic fixture" },
      { fieldId: "financial.institution", label: "Bank", value: "Axis Bank", source: "Synthetic fixture" },
      { fieldId: "suspect.upi_id", label: "Recipient UPI ID", value: "taskdesk42@okaxis", source: "Synthetic fixture" },
      { fieldId: "transaction.reference", label: "Transaction reference", value: "410020260841", source: "Synthetic fixture" },
      { fieldId: "incident.channel", label: "Initial channel", value: "Telegram", source: "Synthetic fixture" },
      { fieldId: "evidence.templateFingerprint", label: "Message-template fingerprint", value: "taskdesk-message-template-v1", source: "Synthetic fixture" },
    ]),
    unknownsJson: "[]",
    assignedTo: "Demo review desk",
    synthetic: true,
    createdAt: "2026-08-24T08:12:00.000Z",
    updatedAt: "2026-08-24T08:18:00.000Z",
  },
  {
    id: "CYS-DEMO-26082400000005",
    ownerEmail: "ananya.synthetic@example.test",
    reporterName: "Ananya R. (synthetic)",
    title: "Online review work required repeated deposits",
    narrativeNative:
      "I joined a WhatsApp review-task group for part-time work. They asked for deposits to unlock commission, and I cannot withdraw ₹18,500.",
    narrativeEnglish:
      "I joined a WhatsApp review-task group for part-time work. They asked for deposits to unlock commission, and I cannot withdraw ₹18,500.",
    languageCode: "unknown",
    provider: "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
    model: "saaras:v3-compatible mock",
    route: "FINANCIAL_FRAUD",
    district: "Hyderabad",
    lossAmount: 18500,
    status: "INFORMATION_REQUESTED",
    urgency: "TIME_SENSITIVE",
    factsJson: JSON.stringify([
      { fieldId: "financial.lossAmount", label: "Reported loss", value: 18500, source: "Synthetic fixture" },
      { fieldId: "financial.institution", label: "Bank", value: "ICICI Bank", source: "Synthetic fixture" },
      { fieldId: "suspect.upi_id", label: "Recipient UPI ID", value: "taskdesk42@okaxis", source: "Synthetic fixture" },
      { fieldId: "transaction.reference", label: "Transaction reference", value: "410020260852", source: "Synthetic fixture" },
      { fieldId: "incident.channel", label: "Initial channel", value: "WhatsApp", source: "Synthetic fixture" },
      { fieldId: "evidence.templateFingerprint", label: "Message-template fingerprint", value: "taskdesk-message-template-v1", source: "Synthetic fixture" },
    ]),
    unknownsJson: "[]",
    assignedTo: "Demo review desk",
    synthetic: true,
    createdAt: "2026-08-24T08:19:00.000Z",
    updatedAt: "2026-08-24T08:26:00.000Z",
  },
  {
    id: "CYS-DEMO-26082400000006",
    ownerEmail: "mohan.synthetic@example.test",
    reporterName: "Mohan D. (synthetic)",
    title: "Commission task account demanded a recharge",
    narrativeNative:
      "A part-time commission task message asked me to recharge a work account. I paid ₹9,600 by UPI, but they demanded another transfer before withdrawal.",
    narrativeEnglish:
      "A part-time commission task message asked me to recharge a work account. I paid ₹9,600 by UPI, but they demanded another transfer before withdrawal.",
    languageCode: "unknown",
    provider: "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
    model: "saaras:v3-compatible mock",
    route: "FINANCIAL_FRAUD",
    district: "Kolkata",
    lossAmount: 9600,
    status: "SYNTHETIC_RECORDED",
    urgency: "TIME_SENSITIVE",
    factsJson: JSON.stringify([
      { fieldId: "financial.lossAmount", label: "Reported loss", value: 9600, source: "Synthetic fixture" },
      { fieldId: "financial.institution", label: "Bank", value: "Punjab National Bank", source: "Synthetic fixture" },
      { fieldId: "suspect.upi_id", label: "Recipient UPI ID", value: "taskdesk42@okaxis", source: "Synthetic fixture" },
      { fieldId: "transaction.reference", label: "Transaction reference", value: "410020260863", source: "Synthetic fixture" },
      { fieldId: "incident.channel", label: "Initial channel", value: "Messaging app", source: "Synthetic fixture" },
      { fieldId: "evidence.templateFingerprint", label: "Message-template fingerprint", value: "taskdesk-message-template-v1", source: "Synthetic fixture" },
    ]),
    unknownsJson: "[]",
    assignedTo: "Demo review desk",
    synthetic: true,
    createdAt: "2026-08-24T08:31:00.000Z",
    updatedAt: "2026-08-24T08:38:00.000Z",
  },
];

const SEED_EVENTS: Array<typeof caseEvents.$inferInsert> = [
  {
    id: "EV-DEMO-001-1",
    caseId: "CYS-DEMO-26082200000001",
    eventType: "CASE_RECORDED",
    title: "Synthetic case recorded",
    description: "The citizen reviewed the transcript and saved this case inside CyberSaarthi.",
    actorRole: "CITIZEN",
    actorLabel: "Sandeep Hipparagi",
    metadataJson: JSON.stringify({ officialSubmission: false }),
    createdAt: "2026-08-22T05:35:00.000Z",
  },
  {
    id: "EV-DEMO-001-2",
    caseId: "CYS-DEMO-26082200000001",
    eventType: "REVIEW_STARTED",
    title: "Demo review started",
    description: "The evaluator opened the case and reviewed its source-linked facts.",
    actorRole: "EVALUATOR",
    actorLabel: "Competition Evaluator",
    metadataJson: "{}",
    createdAt: "2026-08-22T12:10:00.000Z",
  },
  {
    id: "EV-DEMO-001-3",
    caseId: "CYS-DEMO-26082200000001",
    eventType: "INFORMATION_REQUESTED",
    title: "One follow-up requested",
    description: "Please add the synthetic bank transaction reference if available.",
    actorRole: "EVALUATOR",
    actorLabel: "Competition Evaluator",
    metadataJson: "{}",
    createdAt: "2026-08-23T07:20:00.000Z",
  },
  {
    id: "EV-DEMO-002-1",
    caseId: "CYS-DEMO-26082200000002",
    eventType: "CASE_RECORDED",
    title: "Synthetic case recorded",
    description: "An auto-detected voice fixture was reviewed and recorded in the mock backend.",
    actorRole: "CITIZEN",
    actorLabel: "Ravi S. (synthetic)",
    metadataJson: JSON.stringify({ officialSubmission: false }),
    createdAt: "2026-08-22T09:10:00.000Z",
  },
  {
    id: "EV-DEMO-002-2",
    caseId: "CYS-DEMO-26082200000002",
    eventType: "REVIEW_STARTED",
    title: "Demo review in progress",
    description: "The evaluator is checking the proposed route and known gaps.",
    actorRole: "EVALUATOR",
    actorLabel: "Competition Evaluator",
    metadataJson: "{}",
    createdAt: "2026-08-23T06:00:00.000Z",
  },
  {
    id: "EV-DEMO-003-1",
    caseId: "CYS-DEMO-26082100000003",
    eventType: "CASE_RECORDED",
    title: "Synthetic case recorded",
    description: "An auto-detected voice fixture was reviewed and recorded in the mock backend.",
    actorRole: "CITIZEN",
    actorLabel: "Priya M. (synthetic)",
    metadataJson: JSON.stringify({ officialSubmission: false }),
    createdAt: "2026-08-21T11:45:00.000Z",
  },
  {
    id: "EV-DEMO-003-2",
    caseId: "CYS-DEMO-26082100000003",
    eventType: "SYNTHETIC_RESOLVED",
    title: "Demo review completed",
    description: "The synthetic workflow was marked complete; no official outcome is implied.",
    actorRole: "EVALUATOR",
    actorLabel: "Competition Evaluator",
    metadataJson: JSON.stringify({ officialOutcome: false }),
    createdAt: "2026-08-22T15:30:00.000Z",
  },
];

const SAARTHIGRAPH_SEED_EVENTS: Array<typeof caseEvents.$inferInsert> =
  SAARTHIGRAPH_SEED_CASES.map((item, index) => ({
    id: `EV-DEMO-00${index + 4}-1`,
    caseId: item.id,
    eventType: "CASE_RECORDED",
    title: "Synthetic case recorded",
    description: "A reviewed synthetic task-scam fixture was saved for relationship-analysis testing.",
    actorRole: "CITIZEN",
    actorLabel: item.reporterName,
    metadataJson: JSON.stringify({ officialSubmission: false, graphFixture: true }),
    createdAt: item.createdAt,
  }));

const SEED_MESSAGES: Array<typeof supportMessages.$inferInsert> = [
  {
    id: "MSG-DEMO-001-1",
    caseId: "CYS-DEMO-26082200000001",
    senderEmail: "evaluator@cybersaarthi.demo",
    senderRole: "EVALUATOR",
    languageCode: "unknown",
    body: "Please add a synthetic transaction reference so the reviewer can complete the example.",
    synthetic: true,
    createdAt: "2026-08-23T07:20:00.000Z",
  },
];

const LEGACY_SEED_ID_MAP = [
  ["CYS-DEMO-2026-001", "CYS-DEMO-26082200000001"],
  ["CYS-DEMO-2026-002", "CYS-DEMO-26082200000002"],
  ["CYS-DEMO-2026-003", "CYS-DEMO-26082100000003"],
  ["CYS-DEMO-2026-004", "CYS-DEMO-26082400000004"],
  ["CYS-DEMO-2026-005", "CYS-DEMO-26082400000005"],
  ["CYS-DEMO-2026-006", "CYS-DEMO-26082400000006"],
] as const;

async function removeExactSyntheticFixture(caseId: string): Promise<void> {
  const db = getDb();
  await deleteCaseWorkflowRecords(caseId);
  await db.delete(supportMessages).where(eq(supportMessages.caseId, caseId));
  await db.delete(caseEvents).where(eq(caseEvents.caseId, caseId));
  await db.delete(caseRelationships).where(or(
    eq(caseRelationships.sourceCaseId, caseId),
    eq(caseRelationships.targetCaseId, caseId),
  ));
  await db.delete(casePatternMatches).where(eq(casePatternMatches.caseId, caseId));
  await db.delete(caseGraphIdentifiers).where(eq(caseGraphIdentifiers.caseId, caseId));
  await db.delete(cases).where(and(eq(cases.id, caseId), eq(cases.synthetic, true)));
}

async function migrateLegacySeedReferences(): Promise<void> {
  const db = getDb();
  for (const [legacyId, nextId] of LEGACY_SEED_ID_MAP) {
    const [legacy] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, legacyId)).limit(1);
    if (!legacy) continue;
    const [next] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, nextId)).limit(1);
    if (next) {
      await removeExactSyntheticFixture(legacyId);
      continue;
    }
    await deleteCaseWorkflowRecords(legacyId);
    await db.update(supportMessages).set({ caseId: nextId }).where(eq(supportMessages.caseId, legacyId));
    await db.update(caseEvents).set({ caseId: nextId }).where(eq(caseEvents.caseId, legacyId));
    await db.update(caseGraphIdentifiers).set({ caseId: nextId }).where(eq(caseGraphIdentifiers.caseId, legacyId));
    await db.update(casePatternMatches).set({ caseId: nextId }).where(eq(casePatternMatches.caseId, legacyId));
    await db.update(caseRelationships).set({ sourceCaseId: nextId }).where(eq(caseRelationships.sourceCaseId, legacyId));
    await db.update(caseRelationships).set({ targetCaseId: nextId }).where(eq(caseRelationships.targetCaseId, legacyId));
    await db.update(cases).set({ id: nextId }).where(and(eq(cases.id, legacyId), eq(cases.synthetic, true)));
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureSeededCases(): Promise<void> {
  const db = getDb();
  await migrateLegacySeedReferences();
  const [existingCase] = await db.select({ id: cases.id }).from(cases).limit(1);
  if (!existingCase) {
    await db.insert(cases).values(SEED_CASES).onConflictDoNothing();
    await db.insert(caseEvents).values(SEED_EVENTS).onConflictDoNothing();
    await db.insert(supportMessages).values(SEED_MESSAGES).onConflictDoNothing();
  }
  // These evaluator-only fixtures demonstrate a three-district campaign. They
  // cannot be deleted by the public judge account, so restoring them does not
  // violate the citizen-owned delete lifecycle.
  await db.insert(cases).values(SAARTHIGRAPH_SEED_CASES).onConflictDoNothing();
  await db.insert(caseEvents).values(SAARTHIGRAPH_SEED_EVENTS).onConflictDoNothing();
  for (const seed of [...SEED_CASES, ...SAARTHIGRAPH_SEED_CASES]) {
    await db
      .update(cases)
      .set({
        narrativeNative: seed.narrativeNative,
        narrativeEnglish: seed.narrativeEnglish,
        languageCode: "unknown",
        provider: "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
        factsJson: seed.factsJson,
        unknownsJson: seed.unknownsJson,
      })
      .where(eq(cases.id, seed.id));
    await syncCaseWorkflowRecords({
      caseId: seed.id,
      facts: parseJson<Array<Record<string, unknown>>>(seed.factsJson, []),
      lossAmount: seed.lossAmount ?? null,
      createdAt: seed.createdAt,
    });
  }
  await db
    .update(caseEvents)
    .set({ description: "An auto-detected voice fixture was reviewed and recorded in the mock backend." })
    .where(inArray(caseEvents.id, ["EV-DEMO-002-1", "EV-DEMO-003-1"]));
  await db
    .update(supportMessages)
    .set({ languageCode: "unknown" })
    .where(eq(supportMessages.id, "MSG-DEMO-001-1"));
  // Align durable records created by earlier prototype versions.
  await db
    .update(cases)
    .set({ ownerEmail: "citizen@test.com", reporterName: "Sandeep Hipparagi" })
    .where(eq(cases.ownerEmail, "citizen@cybersaarthi.demo"));
  await db
    .update(cases)
    .set({ reporterName: "Sandeep Hipparagi" })
    .where(and(eq(cases.ownerEmail, "citizen@test.com"), eq(cases.reporterName, "Asha Rao")));
  await db
    .update(caseEvents)
    .set({ actorLabel: "Sandeep Hipparagi" })
    .where(and(eq(caseEvents.actorRole, "CITIZEN"), eq(caseEvents.actorLabel, "Asha Rao")));
  await ensurePendingCaseIntelligence();
}

function hydrateCase(
  row: CaseRow,
  eventsByCase: Map<string, CaseEvent[]>,
  messagesByCase: Map<string, SupportMessage[]>,
  intelligenceByCase: Map<string, CaseIntelligence>,
): CaseRecord {
  const { dedupeFingerprint, intelligenceVersion, ...publicRow } = row;
  void dedupeFingerprint;
  void intelligenceVersion;
  return {
    ...publicRow,
    demoReference: /^CYS-DEMO-(\d{14})$/.exec(row.id)?.[1] ?? null,
    status: row.status as CaseStatus,
    facts: parseJson<Array<Record<string, unknown>>>(row.factsJson, []),
    unknowns: parseJson<Array<Record<string, unknown>>>(row.unknownsJson, []),
    events: eventsByCase.get(row.id) ?? [],
    messages: messagesByCase.get(row.id) ?? [],
    intelligence: intelligenceByCase.get(row.id) ?? {
      engineVersion: 1,
      patterns: [],
      relationships: [],
      topology: {
        connectedCaseCount: 0,
        crossDistrictCount: 0,
        proposedCount: 0,
        confirmedCount: 0,
        rejectedCount: 0,
        sharedIdentifierCount: 0,
        componentSize: 1,
        activeCampaignCandidate: false,
      },
      boundary: "Pattern and topology signals support review only. They never establish identity, guilt, jurisdiction, or an official outcome.",
    },
  };
}

function demoReferenceFromId(caseId: string): string | null {
  return /^CYS-DEMO-(\d{14})$/.exec(caseId)?.[1] ?? null;
}

async function findDuplicateCase(
  session: DemoSession,
  fingerprint: string,
): Promise<{ id: string; demoReference: string | null } | null> {
  const db = getDb();
  const [indexedMatch] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.ownerEmail, session.email), eq(cases.dedupeFingerprint, fingerprint)))
    .limit(1);
  if (indexedMatch) {
    return { id: indexedMatch.id, demoReference: demoReferenceFromId(indexedMatch.id) };
  }

  // Compatibility path for records created before the fingerprint migration.
  // It disappears naturally as old demo data is reset or deleted.
  const rows = await db
    .select({
      id: cases.id,
      route: cases.route,
      district: cases.district,
      lossAmount: cases.lossAmount,
      narrativeEnglish: cases.narrativeEnglish,
      factsJson: cases.factsJson,
      dedupeFingerprint: cases.dedupeFingerprint,
    })
    .from(cases)
    .where(and(eq(cases.ownerEmail, session.email), isNull(cases.dedupeFingerprint)));
  for (const row of rows) {
    const existingFingerprint = row.dedupeFingerprint ?? await createCaseFingerprint({
      ownerEmail: session.email,
      route: row.route,
      district: row.district,
      lossAmount: row.lossAmount,
      narrativeEnglish: row.narrativeEnglish,
      facts: parseJson<Array<Record<string, unknown>>>(row.factsJson, []),
    });
    if (existingFingerprint === fingerprint) {
      return { id: row.id, demoReference: demoReferenceFromId(row.id) };
    }
  }
  return null;
}

export async function listCases(session: DemoSession): Promise<CaseRecord[]> {
  await ensureSeededCases();
  const db = getDb();
  const rows = session.role === "EVALUATOR"
    ? await db.select().from(cases).orderBy(desc(cases.updatedAt))
    : await db
        .select()
        .from(cases)
        .where(eq(cases.ownerEmail, session.email))
        .orderBy(desc(cases.updatedAt));

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const intelligenceByCase = await loadCaseIntelligence(ids, session.role);
  const eventRows = await db
    .select()
    .from(caseEvents)
    .where(inArray(caseEvents.caseId, ids))
    .orderBy(desc(caseEvents.createdAt));
  const messageRows = await db
    .select()
    .from(supportMessages)
    .where(inArray(supportMessages.caseId, ids))
    .orderBy(asc(supportMessages.createdAt));

  const eventsByCase = new Map<string, CaseEvent[]>();
  for (const event of eventRows) {
    const hydrated: CaseEvent = {
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      actorRole: event.actorRole,
      actorLabel: event.actorLabel,
      metadata: parseJson<Record<string, unknown>>(event.metadataJson, {}),
      createdAt: event.createdAt,
    };
    eventsByCase.set(event.caseId, [...(eventsByCase.get(event.caseId) ?? []), hydrated]);
  }

  const messagesByCase = new Map<string, SupportMessage[]>();
  for (const message of messageRows) {
    const hydrated: SupportMessage = {
      id: message.id,
      senderEmail: message.senderEmail,
      senderRole: message.senderRole,
      languageCode: message.languageCode,
      body: message.body,
      synthetic: message.synthetic,
      createdAt: message.createdAt,
    };
    messagesByCase.set(message.caseId, [...(messagesByCase.get(message.caseId) ?? []), hydrated]);
  }

  return rows.map((row) => hydrateCase(row, eventsByCase, messagesByCase, intelligenceByCase));
}

async function findAuthorisedCase(caseId: string, session: DemoSession): Promise<CaseRow> {
  const db = getDb();
  const where = session.role === "EVALUATOR"
    ? eq(cases.id, caseId)
    : and(eq(cases.id, caseId), eq(cases.ownerEmail, session.email));
  const [row] = await db.select().from(cases).where(where).limit(1);
  if (!row) throw new Error("CASE_NOT_FOUND");
  return row;
}

function randomEightDigits(): string {
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % 100_000_000);
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return String(value % 100_000_000).padStart(8, "0");
}

function datePrefix(now: Date): string {
  return [
    String(now.getUTCFullYear()).slice(-2),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
}

async function uniqueDemoIdentity(): Promise<{ caseId: string; demoReference: string }> {
  const db = getDb();
  const prefix = datePrefix(new Date());
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const demoReference = `${prefix}${randomEightDigits()}`;
    const caseId = `CYS-DEMO-${demoReference}`;
    const [existing] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!existing) return { caseId, demoReference };
  }
  throw new Error("DEMO_REFERENCE_COLLISION");
}

export async function createCase(
  session: DemoSession,
  input: NewCaseInput,
): Promise<{
  caseId: string;
  demoReference: string;
  integrity: {
    sourceGate: "PASSED";
    duplicateGate: "UNIQUE" | "SYNTHETIC_REPEAT_LINKED";
    routingGate: "CITIZEN_CONFIRMED";
    readiness: ReturnType<typeof buildSubmissionReadiness>;
  };
}> {
  if (session.role !== "CITIZEN") throw new Error("FORBIDDEN");
  const db = getDb();
  const now = new Date().toISOString();
  const integrityInput: CaseIntegrityInput = {
    ownerEmail: session.email,
    route: input.route,
    district: input.district,
    lossAmount: input.lossAmount,
    narrativeEnglish: input.narrativeEnglish,
    facts: input.facts,
  };
  const dedupeFingerprint = await createCaseFingerprint(integrityInput);
  const duplicate = await findDuplicateCase(session, dedupeFingerprint);
  const repeatableSyntheticDemo = [
    "VOICE_DEMO_FIXTURE",
    "CYBERSAARTHI_MOCK_AGENT",
    "SYNTHETIC_AUTO_LANGUAGE_FIXTURE",
  ].includes(input.provider);
  if (duplicate && !repeatableSyntheticDemo) {
    throw new DuplicateCaseError(duplicate.id, duplicate.demoReference);
  }
  const duplicateGate = duplicate ? "SYNTHETIC_REPEAT_LINKED" as const : "UNIQUE" as const;
  const storedDedupeFingerprint = duplicate ? null : dedupeFingerprint;
  const { caseId, demoReference } = await uniqueDemoIdentity();
  const evidenceChecksums = input.facts
    .map((fact) => String(fact.checksum ?? ""))
    .filter(Boolean);
  const readiness = buildSubmissionReadiness({
    route: input.route,
    district: input.district,
    narrative: input.narrativeEnglish,
    facts: input.facts,
    evidenceChecksums,
  });
  try {
    await db.insert(cases).values({
      id: caseId,
      ownerEmail: session.email,
      reporterName: session.name,
      title: input.title,
      narrativeNative: input.narrativeNative,
      narrativeEnglish: input.narrativeEnglish,
      languageCode: input.languageCode,
      provider: input.provider,
      model: input.model,
      route: input.route,
      district: input.district,
      lossAmount: input.lossAmount,
      status: "SYNTHETIC_RECORDED",
      urgency: input.urgency,
      factsJson: JSON.stringify(input.facts),
      unknownsJson: JSON.stringify(input.unknowns),
      dedupeFingerprint: storedDedupeFingerprint,
      assignedTo: "Demo review desk",
      synthetic: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (storedDedupeFingerprint) {
      const racedDuplicate = await findDuplicateCase(session, dedupeFingerprint);
      if (racedDuplicate) throw new DuplicateCaseError(racedDuplicate.id, racedDuplicate.demoReference);
    }
    throw error;
  }
  await db.insert(caseEvents).values({
    id: crypto.randomUUID(),
    caseId,
    eventType: "CASE_RECORDED",
    title: "Synthetic case recorded",
    description: "The citizen reviewed the prepared facts and saved this case inside CyberSaarthi.",
    actorRole: session.role,
    actorLabel: session.name,
    metadataJson: JSON.stringify({
      officialSubmission: false,
      provider: input.provider,
      rapidCaseIntegrity: {
        sourceGate: "PASSED",
        sourceLabel: caseSourceLabel(input.provider),
        duplicateGate,
        routingGate: "CITIZEN_CONFIRMED",
        readinessOutcome: readiness.outcome,
        ...(duplicate ? {
          canonicalSyntheticCaseId: duplicate.id,
          canonicalSyntheticReference: duplicate.demoReference,
        } : {}),
      },
    }),
    createdAt: now,
  });
  if (duplicate) {
    await db.insert(caseEvents).values({
      id: crypto.randomUUID(),
      caseId,
      eventType: "DEMO_REPEAT_RECORDED",
      title: "Repeat synthetic run recorded",
      description: "A repeated judge fixture was saved as a new run and linked to its earlier synthetic case without weakening live duplicate controls.",
      actorRole: "SYSTEM",
      actorLabel: "Rapid Case Integrity Gate",
      metadataJson: JSON.stringify({
        canonicalSyntheticCaseId: duplicate.id,
        canonicalSyntheticReference: duplicate.demoReference,
        liveDuplicateControlsBypassed: false,
      }),
      createdAt: now,
    });
  }
  await syncCaseWorkflowRecords({
    caseId,
    facts: input.facts,
    lossAmount: input.lossAmount,
    createdAt: now,
  });
  try {
    await indexCaseIntelligence({
      id: caseId,
      narrativeEnglish: input.narrativeEnglish,
      facts: input.facts,
      intelligenceVersion: 0,
    });
  } catch {
    // Case recording is the critical path. A later case-list read retries the
    // deterministic graph index instead of failing or losing the citizen case.
    await db.insert(caseEvents).values({
      id: crypto.randomUUID(),
      caseId,
      eventType: "INTELLIGENCE_DEFERRED",
      title: "Relationship analysis queued",
      description: "The case was saved safely; pattern and relationship analysis will retry on the next review.",
      actorRole: "SYSTEM",
      actorLabel: "SaarthiGraph",
      metadataJson: JSON.stringify({ officialOutcome: false }),
      createdAt: now,
    });
  }
  return {
    caseId,
    demoReference,
    integrity: {
      sourceGate: "PASSED",
      duplicateGate,
      routingGate: "CITIZEN_CONFIRMED",
      readiness,
    },
  };
}

export async function addSupportMessage(
  session: DemoSession,
  caseId: string,
  body: string,
  languageCode: string,
): Promise<SupportMessage> {
  const row = await findAuthorisedCase(caseId, session);
  if (row.status === "CLOSED_SETTLED") throw new Error("CASE_CLOSED");
  const db = getDb();
  const now = new Date().toISOString();
  const message: SupportMessage = {
    id: crypto.randomUUID(),
    senderEmail: session.email,
    senderRole: session.role,
    languageCode,
    body,
    synthetic: true,
    createdAt: now,
  };
  await db.batch([
    db.insert(supportMessages).values({
      id: message.id,
      caseId,
      senderEmail: message.senderEmail,
      senderRole: message.senderRole,
      languageCode: message.languageCode,
      body: message.body,
      synthetic: message.synthetic,
      createdAt: message.createdAt,
    }),
    db.insert(caseEvents).values({
      id: crypto.randomUUID(),
      caseId,
      eventType: session.role === "CITIZEN" ? "FOLLOW_UP_RECEIVED" : "SUPPORT_REPLY",
      title: session.role === "CITIZEN" ? "Citizen follow-up received" : "Evaluator support reply",
      description: body,
      actorRole: session.role,
      actorLabel: session.name,
      metadataJson: JSON.stringify({ synthetic: true, languageCode }),
      createdAt: now,
    }),
    db.update(cases).set({
      status: session.role === "CITIZEN" ? "FOLLOW_UP_RECEIVED" : "INFORMATION_REQUESTED",
      updatedAt: now,
    }).where(eq(cases.id, caseId)),
  ]);
  return message;
}

export async function getSupportCaseContext(
  session: DemoSession,
  caseId: string,
  latestCitizenMessage: string,
): Promise<SupportCaseContext> {
  const row = await findAuthorisedCase(caseId, session);
  const db = getDb();
  const recent = await db
    .select({
      senderRole: supportMessages.senderRole,
      body: supportMessages.body,
    })
    .from(supportMessages)
    .where(eq(supportMessages.caseId, caseId))
    .orderBy(desc(supportMessages.createdAt))
    .limit(6);
  const facts = parseJson<Array<Record<string, unknown>>>(row.factsJson, [])
    .slice(0, 12)
    .map((fact) => ({
      fieldId: fact.fieldId,
      label: fact.label,
      value: fact.value,
    }));
  const unknowns = parseJson<Array<Record<string, unknown>>>(row.unknownsJson, [])
    .slice(0, 8)
    .map((unknown) => ({
      fieldId: unknown.fieldId,
      label: unknown.label,
      reason: unknown.reason,
    }));
  return {
    title: row.title,
    status: row.status,
    route: row.route,
    district: row.district,
    facts,
    unknowns,
    recentMessages: recent.reverse().map((message) => ({
      senderRole: message.senderRole,
      body: message.body.slice(0, 500),
    })),
    latestCitizenMessage,
  };
}

export async function addAssistantSupportMessage(
  session: DemoSession,
  caseId: string,
  body: string,
  languageCode: string,
): Promise<SupportMessage> {
  await findAuthorisedCase(caseId, session);
  const db = getDb();
  const now = new Date().toISOString();
  const message: SupportMessage = {
    id: crypto.randomUUID(),
    senderEmail: "assistant@cybersaarthi.local",
    senderRole: "ASSISTANT",
    languageCode,
    body,
    synthetic: true,
    createdAt: now,
  };
  await db.batch([
    db.insert(supportMessages).values({ ...message, caseId }),
    db.insert(caseEvents).values({
      id: crypto.randomUUID(),
      caseId,
      eventType: "SUPPORT_ASSISTANT_REPLY",
      title: "CyberSaarthi replied",
      description: body,
      actorRole: "ASSISTANT",
      actorLabel: "CyberSaarthi",
      metadataJson: JSON.stringify({ synthetic: true, languageCode }),
      createdAt: now,
    }),
    db.update(cases).set({ updatedAt: now }).where(eq(cases.id, caseId)),
  ]);
  return message;
}

export async function updateCaseStatus(
  session: DemoSession,
  caseId: string,
  action: "START_REVIEW" | "REQUEST_INFORMATION" | "RESOLVE",
  note: string | null,
): Promise<void> {
  if (session.role !== "EVALUATOR") throw new Error("FORBIDDEN");
  const row = await findAuthorisedCase(caseId, session);
  if (row.status === "CLOSED_SETTLED") throw new Error("CASE_CLOSED");
  const db = getDb();
  const now = new Date().toISOString();
  const config = {
    START_REVIEW: {
      status: "REVIEW_IN_PROGRESS" as const,
      eventType: "REVIEW_STARTED",
      title: "Demo review started",
      description: note || "The evaluator started reviewing the source-linked facts.",
    },
    REQUEST_INFORMATION: {
      status: "INFORMATION_REQUESTED" as const,
      eventType: "INFORMATION_REQUESTED",
      title: "One follow-up requested",
      description: note || "Please add the missing synthetic detail requested by the reviewer.",
    },
    RESOLVE: {
      status: "SYNTHETIC_RESOLVED" as const,
      eventType: "SYNTHETIC_RESOLVED",
      title: "Demo review completed",
      description: note || "The evaluator marked this synthetic workflow complete; no official outcome is implied.",
    },
  }[action];

  const statements = [
    db.update(cases).set({ status: config.status, updatedAt: now }).where(eq(cases.id, caseId)),
    db.insert(caseEvents).values({
      id: crypto.randomUUID(),
      caseId,
      eventType: config.eventType,
      title: config.title,
      description: config.description,
      actorRole: session.role,
      actorLabel: session.name,
      metadataJson: JSON.stringify({ officialOutcome: false }),
      createdAt: now,
    }),
    ...(action === "REQUEST_INFORMATION" ? [db.insert(supportMessages).values({
      id: crypto.randomUUID(), caseId, senderEmail: session.email, senderRole: session.role,
      languageCode: "unknown", body: config.description, synthetic: true, createdAt: now,
    })] : []),
  ] as const;
  await db.batch(statements);
}

export async function reviewCaseRelationship(
  session: DemoSession,
  caseId: string,
  relationshipId: string,
  decision: "CONFIRMED" | "REJECTED",
  note: string | null,
): Promise<void> {
  if (session.role !== "EVALUATOR") throw new Error("FORBIDDEN");
  const row = await findAuthorisedCase(caseId, session);
  if (row.status === "CLOSED_SETTLED") throw new Error("CASE_CLOSED");
  await reviewRelationship({
    caseId,
    relationshipId,
    reviewerLabel: session.name,
    status: decision,
  });
  const db = getDb();
  const now = new Date().toISOString();
  const confirmed = decision === "CONFIRMED";
  await db.insert(caseEvents).values({
    id: crypto.randomUUID(),
    caseId,
    eventType: confirmed ? "RELATIONSHIP_CONFIRMED" : "RELATIONSHIP_REJECTED",
    title: confirmed ? "Proposed case relationship confirmed" : "Proposed case relationship rejected",
    description: note || (confirmed
      ? "The evaluator confirmed that the displayed evidence supports this relationship for prototype triage."
      : "The evaluator rejected this proposed relationship; it will not be treated as an active connection."),
    actorRole: session.role,
    actorLabel: session.name,
    metadataJson: JSON.stringify({
      relationshipId,
      decision,
      establishesIdentityOrGuilt: false,
      officialOutcome: false,
    }),
    createdAt: now,
  });
  await db.update(cases).set({ updatedAt: now }).where(eq(cases.id, caseId));
}

export async function closeSettledCase(
  session: DemoSession,
  caseId: string,
  note: string | null,
): Promise<void> {
  if (session.role !== "CITIZEN") throw new Error("FORBIDDEN");
  const row = await findAuthorisedCase(caseId, session);
  if (row.route !== "FINANCIAL_FRAUD") throw new Error("CASE_NOT_FINANCIAL");
  if (row.status === "CLOSED_SETTLED") throw new Error("CASE_ALREADY_CLOSED");
  const db = getDb();
  const now = new Date().toISOString();
  const description = note || "The citizen confirmed that the reported funds are settled and closed this prototype case.";
  await db.batch([
    db.update(cases).set({
      status: "CLOSED_SETTLED",
      assignedTo: "Closed by citizen",
      updatedAt: now,
    }).where(and(eq(cases.id, caseId), eq(cases.ownerEmail, session.email))),
    db.insert(caseEvents).values({
      id: crypto.randomUUID(),
      caseId,
      eventType: "CASE_CLOSED_SETTLED",
      title: "Citizen closed case after settlement",
      description,
      actorRole: session.role,
      actorLabel: session.name,
      metadataJson: JSON.stringify({ synthetic: true, officialWithdrawal: false }),
      createdAt: now,
    }),
  ]);
}

export async function deleteClosedCase(
  session: DemoSession,
  caseId: string,
): Promise<void> {
  if (session.role !== "CITIZEN") throw new Error("FORBIDDEN");
  const row = await findAuthorisedCase(caseId, session);
  if (row.status !== "CLOSED_SETTLED") throw new Error("CASE_NOT_CLOSED");
  const db = getDb();
  await deleteCaseWorkflowRecords(caseId);
  await db.batch([
    db.delete(supportMessages).where(eq(supportMessages.caseId, caseId)),
    db.delete(caseEvents).where(eq(caseEvents.caseId, caseId)),
    db.delete(caseRelationships).where(or(
      eq(caseRelationships.sourceCaseId, caseId),
      eq(caseRelationships.targetCaseId, caseId),
    )),
    db.delete(casePatternMatches).where(eq(casePatternMatches.caseId, caseId)),
    db.delete(caseGraphIdentifiers).where(eq(caseGraphIdentifiers.caseId, caseId)),
    db.delete(cases).where(and(eq(cases.id, caseId), eq(cases.ownerEmail, session.email))),
  ]);
}

export async function resetSyntheticCases(session: DemoSession): Promise<void> {
  if (session.role !== "EVALUATOR") throw new Error("FORBIDDEN");
  const db = getDb();
  await resetCaseWorkflowRecords();
  await db.delete(supportMessages);
  await db.delete(caseEvents);
  await db.delete(caseRelationships);
  await db.delete(casePatternMatches);
  await db.delete(caseGraphIdentifiers);
  await db.delete(cases);
  await ensureSeededCases();
}
