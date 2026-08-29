export type NullableScalar = string | number | boolean | null;

export type CandidateFact = {
  fieldId: string;
  value: NullableScalar;
  sourceType: "NARRATIVE" | "EVIDENCE" | "HUMAN_CONFIRMATION" | "HUMAN_EDIT";
  sourceText: string;
  evidenceIds: string[];
  provider: string;
  method: string;
  model: string | null;
  confidence: number;
  explanation: string;
  requiresHumanConfirmation: boolean;
  humanVerified: boolean;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "EDITED" | "INVALIDATED";
  synthetic: boolean;
  createdAt: string;
};

export type CyberSaarthiResponse = {
  mode: "DEMO" | "OPENAI";
  integrationStatus: "DISCONNECTED";
  stage:
    | "URGENT_TRIAGE"
    | "CONTEXT_IDENTIFICATION"
    | "INTAKE"
    | "TRANSCRIPT_REVIEW"
    | "EVIDENCE_REVIEW"
    | "CLARIFICATION"
    | "HUMAN_REVIEW"
    | "READY_TO_RECORD"
    | "FOLLOW_UP_SUPPORT";
  reporterContext:
    | "PRIMARY_VICTIM"
    | "THIRD_PARTY_ACCOUNT_HOLDER"
    | "WITNESS"
    | "AUTHORISED_REPRESENTATIVE"
    | "UNKNOWN";
  frictionFlags: string[];
  language: { detected: string; selected: string; mixedLanguage: boolean };
  citizenMessage: string;
  citizenMessagePurpose:
    | "ACKNOWLEDGEMENT"
    | "URGENT_GUIDANCE"
    | "QUESTION"
    | "REVIEW"
    | "READY"
    | "FOLLOW_UP";
  urgency: {
    level: "IMMEDIATE" | "TIME_SENSITIVE" | "ROUTINE" | "UNKNOWN";
    urgentFinancialAction: boolean;
    immediateDanger: boolean;
    selfHarmRisk: boolean;
    reason: string;
    recommendedAction: string;
  };
  transcript: { text: string; confirmed: boolean; uncertainSegments: string[] };
  incidentSummary: string;
  classification: {
    topLevelRoute:
      | "WOMEN_CHILDREN_RELATED_CRIME"
      | "FINANCIAL_FRAUD"
      | "OTHER_CYBER_CRIME"
      | "UNKNOWN";
    subcategory: string | null;
    confidence: number;
    explanation: string;
    alternatives: string[];
    requiresHumanConfirmation: boolean;
  };
  timeline: Array<{
    sequence: number;
    event: string;
    dateTime: string | null;
    sourceType: "NARRATIVE" | "EVIDENCE" | "HUMAN_CONFIRMATION" | "HUMAN_EDIT";
  }>;
  candidateFacts: CandidateFact[];
  requirements: Array<{
    fieldId: string;
    label: string;
    required: boolean;
    status: "KNOWN" | "UNKNOWN" | "CONFLICT";
    reason: string;
  }>;
  evidenceManifest: Array<{
    evidenceId: string;
    filename: string;
    mediaType: string;
    fileSize: number;
    uploadedAt: string;
    checksum: string | null;
    synthetic: boolean;
  }>;
  evidenceFindings: Array<{
    evidenceId: string;
    finding: string;
    uncertain: boolean;
    sourceText: string;
  }>;
  unknownFields: Array<{ fieldId: string; label: string; reason: string }>;
  conflicts: Array<{
    fieldId: string;
    firstValue: NullableScalar;
    firstSource: string;
    secondValue: NullableScalar;
    secondSource: string;
    blocking: boolean;
    questionForCitizen: string;
  }>;
  clarification: {
    required: boolean;
    fieldId: string | null;
    question: string | null;
    reason: string | null;
  };
  routingSuggestion: {
    status: "PROPOSED" | "HUMAN_REVIEW_REQUIRED" | "CONFIRMED_BY_CITIZEN" | "UNKNOWN";
    route: string | null;
    jurisdiction: string | null;
    automaticFirEligibility:
      | "ELIGIBLE_BY_RUNTIME_RULE"
      | "NOT_ELIGIBLE_BY_RUNTIME_RULE"
      | "UNKNOWN";
    explanation: string;
  };
  officialStatus: {
    value:
      | "PREPARATION_ONLY"
      | "SUBMISSION_REPORTED_BY_CITIZEN"
      | "ACKNOWLEDGEMENT_REPORTED"
      | "ACKNOWLEDGEMENT_DOCUMENT_PROVIDED"
      | "FIR_REPORTED_BY_CITIZEN"
      | "FIR_DOCUMENT_PROVIDED"
      | "INVESTIGATION_REPORTED_BY_CITIZEN"
      | "UNKNOWN";
    acknowledgementId: string | null;
    firNumber: string | null;
    sourceEvidenceIds: string[];
    verifiedByCyberSaarthi: false;
    requiresHumanConfirmation: boolean;
    explanation: string;
  };
  accountFreezeSupport: {
    applies: boolean;
    bank: string | null;
    maskedAccount: string | null;
    freezeOrLienAmount: number | null;
    noticeDate: string | null;
    noticeReference: string | null;
    policeOrIoDetails: string | null;
    transactionPurpose: string | null;
    nextOfficialChannel: string | null;
  };
  registryMatch: {
    status: "NOT_CHECKED" | "SYNTHETIC_DEMO_RESULT" | "TOOL_RESULT_RECEIVED" | "UNAVAILABLE";
    result: string | null;
    synthetic: boolean;
    explanation: string;
  };
  readiness: {
    outcome: "NOT_READY" | "READY_WITH_KNOWN_GAPS" | "READY_TO_RECORD";
    readyForReview: boolean;
    reviewCompleted: boolean;
    readyToRecord: boolean;
    blockingReasons: string[];
  };
  reviewPayload: {
    incidentNarrative: string | null;
    incidentDate: string | null;
    lossAmount: number | null;
    transactionReference: string | null;
    suspectPhone: string | null;
    suspectUrl: string | null;
    district: string | null;
  };
  followUp: {
    needed: boolean;
    reason: string | null;
    draftAvailable: boolean;
    requiresCitizenReview: boolean;
  };
  warnings: string[];
  nextAction: string;
};

type JsonSchema = Record<string, unknown>;

const enumOf = (...values: string[]): JsonSchema => ({ type: "string", enum: values });
const nullableString: JsonSchema = { type: ["string", "null"] };
const nullableNumber: JsonSchema = { type: ["number", "null"] };
const nullableScalar: JsonSchema = {
  anyOf: [
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
};
const arrayOf = (items: JsonSchema): JsonSchema => ({ type: "array", items });
const objectOf = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const candidateFactSchema = objectOf({
  fieldId: { type: "string" },
  value: nullableScalar,
  sourceType: enumOf("NARRATIVE", "EVIDENCE", "HUMAN_CONFIRMATION", "HUMAN_EDIT"),
  sourceText: { type: "string" },
  evidenceIds: arrayOf({ type: "string" }),
  provider: { type: "string" },
  method: { type: "string" },
  model: nullableString,
  confidence: { type: "number" },
  explanation: { type: "string" },
  requiresHumanConfirmation: { type: "boolean" },
  humanVerified: { type: "boolean" },
  status: enumOf("PROPOSED", "ACCEPTED", "REJECTED", "EDITED", "INVALIDATED"),
  synthetic: { type: "boolean" },
  createdAt: { type: "string" },
});

export const CYBERSAARTHI_RESPONSE_SCHEMA: JsonSchema = objectOf({
  mode: enumOf("DEMO", "OPENAI"),
  integrationStatus: enumOf("DISCONNECTED"),
  stage: enumOf(
    "URGENT_TRIAGE",
    "CONTEXT_IDENTIFICATION",
    "INTAKE",
    "TRANSCRIPT_REVIEW",
    "EVIDENCE_REVIEW",
    "CLARIFICATION",
    "HUMAN_REVIEW",
    "READY_TO_RECORD",
    "FOLLOW_UP_SUPPORT",
  ),
  reporterContext: enumOf(
    "PRIMARY_VICTIM",
    "THIRD_PARTY_ACCOUNT_HOLDER",
    "WITNESS",
    "AUTHORISED_REPRESENTATIVE",
    "UNKNOWN",
  ),
  frictionFlags: arrayOf({ type: "string" }),
  language: objectOf({
    detected: { type: "string" },
    selected: { type: "string" },
    mixedLanguage: { type: "boolean" },
  }),
  citizenMessage: { type: "string" },
  citizenMessagePurpose: enumOf(
    "ACKNOWLEDGEMENT",
    "URGENT_GUIDANCE",
    "QUESTION",
    "REVIEW",
    "READY",
    "FOLLOW_UP",
  ),
  urgency: objectOf({
    level: enumOf("IMMEDIATE", "TIME_SENSITIVE", "ROUTINE", "UNKNOWN"),
    urgentFinancialAction: { type: "boolean" },
    immediateDanger: { type: "boolean" },
    selfHarmRisk: { type: "boolean" },
    reason: { type: "string" },
    recommendedAction: { type: "string" },
  }),
  transcript: objectOf({
    text: { type: "string" },
    confirmed: { type: "boolean" },
    uncertainSegments: arrayOf({ type: "string" }),
  }),
  incidentSummary: { type: "string" },
  classification: objectOf({
    topLevelRoute: enumOf(
      "WOMEN_CHILDREN_RELATED_CRIME",
      "FINANCIAL_FRAUD",
      "OTHER_CYBER_CRIME",
      "UNKNOWN",
    ),
    subcategory: nullableString,
    confidence: { type: "number" },
    explanation: { type: "string" },
    alternatives: arrayOf({ type: "string" }),
    requiresHumanConfirmation: { type: "boolean" },
  }),
  timeline: arrayOf(
    objectOf({
      sequence: { type: "number" },
      event: { type: "string" },
      dateTime: nullableString,
      sourceType: enumOf("NARRATIVE", "EVIDENCE", "HUMAN_CONFIRMATION", "HUMAN_EDIT"),
    }),
  ),
  candidateFacts: arrayOf(candidateFactSchema),
  requirements: arrayOf(
    objectOf({
      fieldId: { type: "string" },
      label: { type: "string" },
      required: { type: "boolean" },
      status: enumOf("KNOWN", "UNKNOWN", "CONFLICT"),
      reason: { type: "string" },
    }),
  ),
  evidenceManifest: arrayOf(
    objectOf({
      evidenceId: { type: "string" },
      filename: { type: "string" },
      mediaType: { type: "string" },
      fileSize: { type: "number" },
      uploadedAt: { type: "string" },
      checksum: nullableString,
      synthetic: { type: "boolean" },
    }),
  ),
  evidenceFindings: arrayOf(
    objectOf({
      evidenceId: { type: "string" },
      finding: { type: "string" },
      uncertain: { type: "boolean" },
      sourceText: { type: "string" },
    }),
  ),
  unknownFields: arrayOf(
    objectOf({
      fieldId: { type: "string" },
      label: { type: "string" },
      reason: { type: "string" },
    }),
  ),
  conflicts: arrayOf(
    objectOf({
      fieldId: { type: "string" },
      firstValue: nullableScalar,
      firstSource: { type: "string" },
      secondValue: nullableScalar,
      secondSource: { type: "string" },
      blocking: { type: "boolean" },
      questionForCitizen: { type: "string" },
    }),
  ),
  clarification: objectOf({
    required: { type: "boolean" },
    fieldId: nullableString,
    question: nullableString,
    reason: nullableString,
  }),
  routingSuggestion: objectOf({
    status: enumOf("PROPOSED", "HUMAN_REVIEW_REQUIRED", "CONFIRMED_BY_CITIZEN", "UNKNOWN"),
    route: nullableString,
    jurisdiction: nullableString,
    automaticFirEligibility: enumOf(
      "ELIGIBLE_BY_RUNTIME_RULE",
      "NOT_ELIGIBLE_BY_RUNTIME_RULE",
      "UNKNOWN",
    ),
    explanation: { type: "string" },
  }),
  officialStatus: objectOf({
    value: enumOf(
      "PREPARATION_ONLY",
      "SUBMISSION_REPORTED_BY_CITIZEN",
      "ACKNOWLEDGEMENT_REPORTED",
      "ACKNOWLEDGEMENT_DOCUMENT_PROVIDED",
      "FIR_REPORTED_BY_CITIZEN",
      "FIR_DOCUMENT_PROVIDED",
      "INVESTIGATION_REPORTED_BY_CITIZEN",
      "UNKNOWN",
    ),
    acknowledgementId: nullableString,
    firNumber: nullableString,
    sourceEvidenceIds: arrayOf({ type: "string" }),
    verifiedByCyberSaarthi: { type: "boolean", enum: [false] },
    requiresHumanConfirmation: { type: "boolean" },
    explanation: { type: "string" },
  }),
  accountFreezeSupport: objectOf({
    applies: { type: "boolean" },
    bank: nullableString,
    maskedAccount: nullableString,
    freezeOrLienAmount: nullableNumber,
    noticeDate: nullableString,
    noticeReference: nullableString,
    policeOrIoDetails: nullableString,
    transactionPurpose: nullableString,
    nextOfficialChannel: nullableString,
  }),
  registryMatch: objectOf({
    status: enumOf("NOT_CHECKED", "SYNTHETIC_DEMO_RESULT", "TOOL_RESULT_RECEIVED", "UNAVAILABLE"),
    result: nullableString,
    synthetic: { type: "boolean" },
    explanation: { type: "string" },
  }),
  readiness: objectOf({
    outcome: enumOf("NOT_READY", "READY_WITH_KNOWN_GAPS", "READY_TO_RECORD"),
    readyForReview: { type: "boolean" },
    reviewCompleted: { type: "boolean" },
    readyToRecord: { type: "boolean" },
    blockingReasons: arrayOf({ type: "string" }),
  }),
  reviewPayload: objectOf({
    incidentNarrative: nullableString,
    incidentDate: nullableString,
    lossAmount: nullableNumber,
    transactionReference: nullableString,
    suspectPhone: nullableString,
    suspectUrl: nullableString,
    district: nullableString,
  }),
  followUp: objectOf({
    needed: { type: "boolean" },
    reason: nullableString,
    draftAvailable: { type: "boolean" },
    requiresCitizenReview: { type: "boolean" },
  }),
  warnings: arrayOf({ type: "string" }),
  nextAction: { type: "string" },
});

/**
 * Fails fast if a future schema edit weakens the Structured Outputs contract.
 * Every object must reject extra keys and require every declared property.
 */
export function assertStrictStructuredOutputSchema(
  schema: JsonSchema = CYBERSAARTHI_RESPONSE_SCHEMA,
  path = "$",
): void {
  if (schema.type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set((schema.required ?? []) as string[]);
    if (schema.additionalProperties !== false) {
      throw new Error(`${path} must set additionalProperties: false`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (!required.has(key)) throw new Error(`${path}.${key} must be required`);
      assertStrictStructuredOutputSchema(child, `${path}.${key}`);
    }
  }

  if (schema.items && typeof schema.items === "object") {
    assertStrictStructuredOutputSchema(schema.items as JsonSchema, `${path}[]`);
  }

  if (Array.isArray(schema.anyOf)) {
    for (const [index, child] of schema.anyOf.entries()) {
      assertStrictStructuredOutputSchema(child as JsonSchema, `${path}.anyOf[${index}]`);
    }
  }
}

function valueTypeMatches(value: unknown, expectedType: string): boolean {
  if (expectedType === "null") return value === null;
  if (expectedType === "array") return Array.isArray(value);
  if (expectedType === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  if (expectedType === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expectedType;
}

function schemaError(value: unknown, schema: JsonSchema, path: string): string | null {
  if (Array.isArray(schema.anyOf)) {
    const validBranch = schema.anyOf.some(
      (child) => schemaError(value, child as JsonSchema, path) === null,
    );
    return validBranch ? null : `${path} does not match any allowed type`;
  }

  const expected = schema.type;
  if (typeof expected === "string" && !valueTypeMatches(value, expected)) {
    return `${path} must be ${expected}`;
  }
  if (
    Array.isArray(expected) &&
    !expected.some((item) => typeof item === "string" && valueTypeMatches(value, item))
  ) {
    return `${path} must match one of: ${expected.join(", ")}`;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    return `${path} contains a value outside the declared enum`;
  }

  if (schema.type === "object") {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set((schema.required ?? []) as string[]);
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        return `${path}.${key} is required`;
      }
    }
    if (schema.additionalProperties === false) {
      const extra = Object.keys(record).find((key) => !(key in properties));
      if (extra) return `${path}.${extra} is not allowed`;
    }
    for (const [key, child] of Object.entries(properties)) {
      const error = schemaError(record[key], child, `${path}.${key}`);
      if (error) return error;
    }
  }

  if (schema.type === "array" && schema.items && typeof schema.items === "object") {
    for (const [index, item] of (value as unknown[]).entries()) {
      const error = schemaError(item, schema.items as JsonSchema, `${path}[${index}]`);
      if (error) return error;
    }
  }

  return null;
}

/** Validates provider output at runtime instead of relying on a TypeScript cast. */
export function assertCyberSaarthiResponse(
  value: unknown,
): asserts value is CyberSaarthiResponse {
  const error = schemaError(value, CYBERSAARTHI_RESPONSE_SCHEMA, "$response");
  if (error) throw new Error(`INVALID_STRUCTURED_OUTPUT: ${error}`);
}
