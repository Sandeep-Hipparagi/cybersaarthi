export const EVIDENCE_FIELD_IDS = [
  "suspect.phone",
  "suspect.upi_id",
  "transaction.occurred_at",
  "transaction.reference",
] as const;

export type EvidenceFieldId = (typeof EVIDENCE_FIELD_IDS)[number];

export type EvidenceFinding = {
  fieldId: EvidenceFieldId;
  value: string | null;
  sourceText: string | null;
  sourceImageId: string;
  confidence: number;
  explanation: string;
  uncertaintyReason: string | null;
  requiresHumanConfirmation: true;
  humanVerified: false;
  status: "PROPOSED";
};

export type EvidenceModelOutput = {
  extractedTechnicalEvidence: {
    suspectPhoneNumber: string | null;
    suspectUpiId: string | null;
    transactionTimestamp: string | null;
    transactionReferenceNumber: string | null;
  };
  findings: EvidenceFinding[];
  warnings: string[];
};

export type EvidenceAnalysisResponse = EvidenceModelOutput & {
  mode: "DEMO" | "OPENAI";
  provider: "CYBERSAARTHI_DETERMINISTIC_MOCK" | "OPENAI";
  model: string | null;
  synthetic: true;
  evidenceId: string;
  filename: string;
  mediaType: string;
  fileSize: number;
  checksum: string;
  analysedAt: string;
};

const nullableString = { type: ["string", "null"] };

export const EVIDENCE_MODEL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    extractedTechnicalEvidence: {
      type: "object",
      properties: {
        suspectPhoneNumber: nullableString,
        suspectUpiId: nullableString,
        transactionTimestamp: nullableString,
        transactionReferenceNumber: nullableString,
      },
      required: [
        "suspectPhoneNumber",
        "suspectUpiId",
        "transactionTimestamp",
        "transactionReferenceNumber",
      ],
      additionalProperties: false,
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fieldId: { type: "string", enum: [...EVIDENCE_FIELD_IDS] },
          value: nullableString,
          sourceText: nullableString,
          sourceImageId: { type: "string" },
          confidence: { type: "number" },
          explanation: { type: "string" },
          uncertaintyReason: nullableString,
          requiresHumanConfirmation: { type: "boolean", enum: [true] },
          humanVerified: { type: "boolean", enum: [false] },
          status: { type: "string", enum: ["PROPOSED"] },
        },
        required: [
          "fieldId",
          "value",
          "sourceText",
          "sourceImageId",
          "confidence",
          "explanation",
          "uncertaintyReason",
          "requiresHumanConfirmation",
          "humanVerified",
          "status",
        ],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["extractedTechnicalEvidence", "findings", "warnings"],
  additionalProperties: false,
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(record).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

export function assertEvidenceModelOutput(
  value: unknown,
): asserts value is EvidenceModelOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_EVIDENCE_OUTPUT: root must be an object");
  }
  const output = value as Record<string, unknown>;
  if (!hasExactKeys(output, ["extractedTechnicalEvidence", "findings", "warnings"])) {
    throw new Error("INVALID_EVIDENCE_OUTPUT: undeclared or missing root property");
  }

  const technical = output.extractedTechnicalEvidence;
  if (!technical || typeof technical !== "object" || Array.isArray(technical)) {
    throw new Error("INVALID_EVIDENCE_OUTPUT: extractedTechnicalEvidence must be an object");
  }
  const technicalRecord = technical as Record<string, unknown>;
  const technicalKeys = [
    "suspectPhoneNumber",
    "suspectUpiId",
    "transactionTimestamp",
    "transactionReferenceNumber",
  ];
  if (!hasExactKeys(technicalRecord, technicalKeys)) {
    throw new Error("INVALID_EVIDENCE_OUTPUT: undeclared or missing technical field");
  }
  for (const key of technicalKeys) {
    if (!isNullableString(technicalRecord[key])) {
      throw new Error(`INVALID_EVIDENCE_OUTPUT: ${key} must be string or null`);
    }
  }

  if (!Array.isArray(output.findings) || output.findings.length !== EVIDENCE_FIELD_IDS.length) {
    throw new Error("INVALID_EVIDENCE_OUTPUT: exactly four findings are required");
  }
  const expectedFindingKeys = [
    "fieldId",
    "value",
    "sourceText",
    "sourceImageId",
    "confidence",
    "explanation",
    "uncertaintyReason",
    "requiresHumanConfirmation",
    "humanVerified",
    "status",
  ];
  const seen = new Set<string>();
  for (const rawFinding of output.findings) {
    if (!rawFinding || typeof rawFinding !== "object" || Array.isArray(rawFinding)) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: finding must be an object");
    }
    const finding = rawFinding as Record<string, unknown>;
    if (!hasExactKeys(finding, expectedFindingKeys)) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: undeclared or missing finding property");
    }
    if (!EVIDENCE_FIELD_IDS.includes(finding.fieldId as EvidenceFieldId) || seen.has(String(finding.fieldId))) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: finding fieldId is invalid or duplicated");
    }
    seen.add(String(finding.fieldId));
    if (!isNullableString(finding.value) || !isNullableString(finding.sourceText)) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: finding value/sourceText must be string or null");
    }
    if (typeof finding.sourceImageId !== "string" || finding.sourceImageId.length === 0) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: sourceImageId is required");
    }
    if (typeof finding.confidence !== "number" || finding.confidence < 0 || finding.confidence > 1) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: confidence must be between 0 and 1");
    }
    if (typeof finding.explanation !== "string" || !isNullableString(finding.uncertaintyReason)) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: explanation/uncertaintyReason is invalid");
    }
    if (
      finding.requiresHumanConfirmation !== true ||
      finding.humanVerified !== false ||
      finding.status !== "PROPOSED"
    ) {
      throw new Error("INVALID_EVIDENCE_OUTPUT: model cannot verify or accept evidence");
    }
  }

  if (!Array.isArray(output.warnings) || !output.warnings.every((item) => typeof item === "string")) {
    throw new Error("INVALID_EVIDENCE_OUTPUT: warnings must be strings");
  }
}
