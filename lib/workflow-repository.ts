import { and, asc, eq } from "drizzle-orm";
import {
  caseEvidenceMetadata,
  caseEvents,
  cases,
  caseTransactions,
} from "../db/schema";
import { getDb } from "../db";
import type { DemoSession } from "./demo-auth";
import {
  auditDisplayState,
  goldenHourAssessment,
  type AuditDisplayState,
} from "./workflow-validation";

type Fact = Record<string, unknown>;

function factValue(facts: Fact[], fieldIds: string[]): unknown {
  return facts.find((fact) => fieldIds.includes(String(fact.fieldId ?? "")))?.value;
}

function textFact(facts: Fact[], fieldIds: string[]): string | null {
  const value = factValue(facts, fieldIds);
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).normalize("NFKC").trim();
  return normalized || null;
}

function amountFact(facts: Fact[], fallback: number | null): number | null {
  const value = factValue(facts, ["financial.lossAmount"]);
  const number = typeof value === "number"
    ? value
    : Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function maskAccount(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : null;
}

function validChecksum(value: unknown): string | null {
  const checksum = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(checksum) ? checksum : null;
}

function isWorkflowSchemaUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:no such table|does not exist).*(?:case_transactions|case_evidence_metadata)/i.test(message);
}

export async function syncCaseWorkflowRecords(input: {
  caseId: string;
  facts: Fact[];
  lossAmount: number | null;
  createdAt: string;
}): Promise<void> {
  const db = getDb();
  try {
    const utrNumber = textFact(input.facts, ["financial.transactionReference", "transaction.reference"]);
    if (utrNumber && /^\d{12}$/.test(utrNumber)) {
      await db.insert(caseTransactions).values({
        id: crypto.randomUUID(),
        caseId: input.caseId,
        utrNumber,
        transactionId: textFact(input.facts, ["financial.transactionId"]) ?? utrNumber,
        originInstitution: textFact(input.facts, ["financial.institution"]),
        originAccountMasked: maskAccount(textFact(input.facts, ["victim.accountNumber"])),
        destinationWallet: textFact(input.facts, ["suspect.upi_id"]),
        occurredAt: textFact(input.facts, ["incident.dateTime", "transaction.occurred_at"]),
        amount: amountFact(input.facts, input.lossAmount),
        synthetic: true,
        createdAt: input.createdAt,
      }).onConflictDoNothing();
    }

    const seenEvidence = new Set<string>();
    for (const fact of input.facts) {
      const evidenceId = typeof fact.evidenceId === "string" ? fact.evidenceId.trim() : "";
      const sourceImageId = typeof fact.sourceImageId === "string" ? fact.sourceImageId.trim() : "";
      const checksum = validChecksum(fact.checksum);
      if (!evidenceId || !sourceImageId || !checksum) continue;
      const key = `${evidenceId}:${sourceImageId}`;
      if (seenEvidence.has(key)) continue;
      seenEvidence.add(key);
      const mediaType = typeof fact.mediaType === "string" && fact.mediaType.startsWith("image/")
        ? fact.mediaType.slice(0, 80)
        : "application/octet-stream";
      await db.insert(caseEvidenceMetadata).values({
        id: crypto.randomUUID(),
        caseId: input.caseId,
        evidenceId: evidenceId.slice(0, 180),
        sourceImageId: sourceImageId.slice(0, 180),
        mediaType,
        storagePath: `synthetic://evidence-metadata/${encodeURIComponent(evidenceId.slice(0, 180))}`,
        checksum,
        synthetic: true,
        createdAt: input.createdAt,
      }).onConflictDoNothing();
    }
  } catch (error) {
    // During a rolling Sites release the derived tables can appear one request
    // after the primary case tables. The canonical case still saves safely.
    if (isWorkflowSchemaUnavailable(error)) return;
    throw error;
  }
}

export async function deleteCaseWorkflowRecords(caseId: string): Promise<void> {
  const db = getDb();
  try {
    await db.batch([
      db.delete(caseEvidenceMetadata).where(eq(caseEvidenceMetadata.caseId, caseId)),
      db.delete(caseTransactions).where(eq(caseTransactions.caseId, caseId)),
    ]);
  } catch (error) {
    if (isWorkflowSchemaUnavailable(error)) return;
    throw error;
  }
}

export async function resetCaseWorkflowRecords(): Promise<void> {
  const db = getDb();
  try {
    await db.batch([db.delete(caseEvidenceMetadata), db.delete(caseTransactions)]);
  } catch (error) {
    if (isWorkflowSchemaUnavailable(error)) return;
    throw error;
  }
}

export async function fetchGoldenHourTransaction(
  session: DemoSession,
  identifier: { kind: "UTR" | "TRANSACTION_ID"; value: string },
  now = new Date(),
) {
  const db = getDb();
  const identifierMatch = identifier.kind === "UTR"
    ? eq(caseTransactions.utrNumber, identifier.value)
    : eq(caseTransactions.transactionId, identifier.value);
  const ownership = session.role === "EVALUATOR"
    ? identifierMatch
    : and(identifierMatch, eq(cases.ownerEmail, session.email));
  const [row] = await db
    .select({
      caseId: cases.id,
      title: cases.title,
      ownerEmail: cases.ownerEmail,
      district: cases.district,
      status: cases.status,
      utrNumber: caseTransactions.utrNumber,
      transactionId: caseTransactions.transactionId,
      originInstitution: caseTransactions.originInstitution,
      originAccountMasked: caseTransactions.originAccountMasked,
      destinationWallet: caseTransactions.destinationWallet,
      occurredAt: caseTransactions.occurredAt,
      amount: caseTransactions.amount,
      synthetic: caseTransactions.synthetic,
    })
    .from(caseTransactions)
    .innerJoin(cases, eq(caseTransactions.caseId, cases.id))
    .where(ownership)
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    ownerEmail: session.role === "EVALUATOR" ? row.ownerEmail : undefined,
    lookup: identifier,
    goldenHour: goldenHourAssessment(row.occurredAt, now),
    externalBankVerification: "DISCONNECTED",
    destinationClassification: "UNVERIFIED_RECIPIENT",
    boundary: "The prototype verifies stored structure and timing only; it does not query a bank or label a wallet as a mule.",
  };
}

async function authorisedCase(session: DemoSession, acknowledgement: string) {
  const db = getDb();
  const caseId = `CYS-DEMO-${acknowledgement}`;
  const where = session.role === "EVALUATOR"
    ? eq(cases.id, caseId)
    : and(eq(cases.id, caseId), eq(cases.ownerEmail, session.email));
  const [row] = await db.select().from(cases).where(where).limit(1);
  return row ?? null;
}

export async function fetchIncidentTimeline(
  session: DemoSession,
  acknowledgement: string,
  parsedNarrativeEvents: Array<{ sequence: number; description: string }>,
) {
  const row = await authorisedCase(session, acknowledgement);
  if (!row) return null;
  const db = getDb();
  const [eventRows, evidenceRows] = await Promise.all([
    db.select({
      eventType: caseEvents.eventType,
      title: caseEvents.title,
      description: caseEvents.description,
      actorRole: caseEvents.actorRole,
      createdAt: caseEvents.createdAt,
    }).from(caseEvents).where(eq(caseEvents.caseId, row.id)).orderBy(asc(caseEvents.createdAt)),
    db.select({
      evidenceId: caseEvidenceMetadata.evidenceId,
      sourceImageId: caseEvidenceMetadata.sourceImageId,
      mediaType: caseEvidenceMetadata.mediaType,
      storagePath: caseEvidenceMetadata.storagePath,
      checksum: caseEvidenceMetadata.checksum,
      createdAt: caseEvidenceMetadata.createdAt,
    }).from(caseEvidenceMetadata).where(eq(caseEvidenceMetadata.caseId, row.id)),
  ]);
  return {
    caseId: row.id,
    acknowledgementNumber: acknowledgement,
    incident: { title: row.title, route: row.route, district: row.district, createdAt: row.createdAt },
    parsedNarrativeEvents,
    trackingTimeline: eventRows,
    evidence: evidenceRows,
    rawEvidencePersisted: false,
    boundary: "Evidence entries are synthetic metadata paths and checksums; raw uploads are not persisted.",
  };
}

export async function fetchStatusAudit(session: DemoSession, acknowledgement: string) {
  const row = await authorisedCase(session, acknowledgement);
  if (!row) return null;
  const db = getDb();
  const events = await db.select({
    eventType: caseEvents.eventType,
    title: caseEvents.title,
    description: caseEvents.description,
    actorRole: caseEvents.actorRole,
    createdAt: caseEvents.createdAt,
  }).from(caseEvents).where(eq(caseEvents.caseId, row.id)).orderBy(asc(caseEvents.createdAt));
  const eventTypes = events.map((event) => event.eventType);
  return {
    caseId: row.id,
    acknowledgementNumber: acknowledgement,
    storedStatus: row.status,
    displayStatus: auditDisplayState(row.status, eventTypes) as AuditDisplayState,
    history: events,
    officialStatus: null,
    synthetic: true,
    boundary: "Displayed states are internal prototype states, not NCRP, police, FIR, or bank confirmations.",
  };
}
