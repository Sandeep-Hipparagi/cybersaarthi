import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const cases = sqliteTable(
  "cases",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    reporterName: text("reporter_name").notNull(),
    title: text("title").notNull(),
    narrativeNative: text("narrative_native").notNull(),
    narrativeEnglish: text("narrative_english").notNull(),
    languageCode: text("language_code").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    route: text("route").notNull(),
    district: text("district"),
    lossAmount: integer("loss_amount"),
    status: text("status").notNull(),
    urgency: text("urgency").notNull(),
    factsJson: text("facts_json").notNull(),
    unknownsJson: text("unknowns_json").notNull(),
    dedupeFingerprint: text("dedupe_fingerprint"),
    intelligenceVersion: integer("intelligence_version").notNull().default(0),
    assignedTo: text("assigned_to"),
    synthetic: integer("synthetic", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("cases_owner_email_idx").on(table.ownerEmail),
    uniqueIndex("cases_owner_dedupe_idx").on(table.ownerEmail, table.dedupeFingerprint),
    index("cases_status_idx").on(table.status),
    index("cases_updated_at_idx").on(table.updatedAt),
  ],
);

export const caseGraphIdentifiers = sqliteTable(
  "case_graph_identifiers",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    identifierType: text("identifier_type").notNull(),
    fingerprint: text("fingerprint").notNull(),
    displayLabel: text("display_label").notNull(),
    sourceFieldId: text("source_field_id").notNull(),
    sourceLabel: text("source_label").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("case_graph_identifier_unique_idx").on(
      table.caseId,
      table.identifierType,
      table.fingerprint,
    ),
    index("case_graph_identifier_case_idx").on(table.caseId),
    index("case_graph_identifier_fingerprint_idx").on(table.identifierType, table.fingerprint),
  ],
);

export const casePatternMatches = sqliteTable(
  "case_pattern_matches",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    patternCode: text("pattern_code").notNull(),
    label: text("label").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    status: text("status").notNull().default("PROPOSED"),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    explanation: text("explanation").notNull(),
    engineVersion: integer("engine_version").notNull(),
    reviewedAt: text("reviewed_at"),
    reviewerLabel: text("reviewer_label"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("case_pattern_unique_idx").on(table.caseId, table.patternCode),
    index("case_pattern_case_idx").on(table.caseId),
    index("case_pattern_code_idx").on(table.patternCode),
  ],
);

export const caseRelationships = sqliteTable(
  "case_relationships",
  {
    id: text("id").primaryKey(),
    sourceCaseId: text("source_case_id").notNull(),
    targetCaseId: text("target_case_id").notNull(),
    relationshipType: text("relationship_type").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    status: text("status").notNull().default("PROPOSED"),
    deterministic: integer("deterministic", { mode: "boolean" }).notNull().default(true),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    explanation: text("explanation").notNull(),
    engineVersion: integer("engine_version").notNull(),
    reviewedAt: text("reviewed_at"),
    reviewerLabel: text("reviewer_label"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("case_relationship_unique_idx").on(
      table.sourceCaseId,
      table.targetCaseId,
      table.relationshipType,
    ),
    index("case_relationship_source_idx").on(table.sourceCaseId),
    index("case_relationship_target_idx").on(table.targetCaseId),
    index("case_relationship_status_idx").on(table.status),
  ],
);

export const caseEvents = sqliteTable(
  "case_events",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    actorRole: text("actor_role").notNull(),
    actorLabel: text("actor_label").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("case_events_case_id_idx").on(table.caseId),
    index("case_events_created_at_idx").on(table.createdAt),
  ],
);

export const supportMessages = sqliteTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    senderEmail: text("sender_email").notNull(),
    senderRole: text("sender_role").notNull(),
    languageCode: text("language_code").notNull(),
    body: text("body").notNull(),
    synthetic: integer("synthetic", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("support_messages_case_id_idx").on(table.caseId),
    index("support_messages_created_at_idx").on(table.createdAt),
  ],
);

export const caseTransactions = sqliteTable(
  "case_transactions",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    utrNumber: text("utr_number").notNull(),
    transactionId: text("transaction_id"),
    originInstitution: text("origin_institution"),
    originAccountMasked: text("origin_account_masked"),
    destinationWallet: text("destination_wallet"),
    occurredAt: text("occurred_at"),
    amount: integer("amount"),
    synthetic: integer("synthetic", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("case_transaction_case_utr_idx").on(table.caseId, table.utrNumber),
    index("case_transaction_utr_idx").on(table.utrNumber),
    index("case_transaction_id_idx").on(table.transactionId),
    index("case_transaction_case_idx").on(table.caseId),
    index("case_transaction_occurred_idx").on(table.occurredAt),
  ],
);

export const caseEvidenceMetadata = sqliteTable(
  "case_evidence_metadata",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    sourceImageId: text("source_image_id").notNull(),
    mediaType: text("media_type").notNull(),
    storagePath: text("storage_path").notNull(),
    checksum: text("checksum").notNull(),
    synthetic: integer("synthetic", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("case_evidence_source_idx").on(table.caseId, table.evidenceId, table.sourceImageId),
    index("case_evidence_case_idx").on(table.caseId),
    index("case_evidence_id_idx").on(table.evidenceId),
    index("case_evidence_checksum_idx").on(table.checksum),
  ],
);
