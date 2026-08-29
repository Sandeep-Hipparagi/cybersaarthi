import assert from "node:assert/strict";
import test from "node:test";

import {
  chronologicalEvents,
  exactAcknowledgement,
  exactUtr,
  goldenHourAssessment,
  sanitizeIncidentDescription,
} from "../lib/workflow-validation.ts";
import {
  EMPTY_FINANCIAL_DRAFT,
  mergePreparedFinancialDraft,
} from "../lib/financial-validation.ts";
import {
  detectBrowserAudioContainer,
  normalizeBrowserAudioFile,
} from "../lib/audio-validation.ts";

test("workflow validation rejects invalid identifiers and sanitizes without crashing", () => {
  assert.equal(exactUtr("4321 9876 5012"), "432198765012");
  assert.equal(exactUtr("43219876501"), null);
  assert.equal(exactAcknowledgement("26082511507616"), "26082511507616");
  assert.equal(exactAcknowledgement("CYS-DEMO-26082511507616"), null);

  const description = `${"The citizen preserved the complete synthetic payment timeline and transaction evidence. ".repeat(4)}# $ @ ^ * \\ ' ~ | ! \``;
  const result = sanitizeIncidentDescription(description);
  assert.equal(result.validLength, true);
  assert.equal(result.removedCharacters, 11);
  assert.doesNotMatch(result.text, /[#$@^*\\'~|!`]/);
  assert.ok(chronologicalEvents(result.text).length >= 1);
});

test("golden-hour decisions use explicit timestamps and never guess unreadable times", () => {
  const now = new Date("2026-08-28T08:00:00.000Z");
  assert.equal(goldenHourAssessment("2026-08-28T06:30:00.000Z", now).state, "WITHIN_GOLDEN_HOUR");
  assert.equal(goldenHourAssessment("2026-08-28T04:00:00.000Z", now).state, "OUTSIDE_GOLDEN_HOUR");
  assert.equal(goldenHourAssessment("not a timestamp", now).state, "UNKNOWN");
  assert.equal(goldenHourAssessment("2026-08-29T04:00:00.000Z", now).state, "UNKNOWN");
});

test("prepared facts fill empty financial fields without overwriting citizen edits", () => {
  const merged = mergePreparedFinancialDraft(
    { ...EMPTY_FINANCIAL_DRAFT, bankName: "Citizen-edited bank" },
    {
      incidentDateTime: "2026-08-24T14:32:00+05:30",
      totalAmount: 12000,
      utrNumber: "432198765012",
      bankName: "HDFC Bank",
      victimAccountNumber: null,
      suspectVpa: "taskdesk42@okaxis",
      suspectPhone: "+91 9000011223",
      suspectIfsc: "HDFC0001234",
      suspectAccountNumber: null,
    },
  );
  assert.equal(merged.bankName, "Citizen-edited bank");
  assert.equal(merged.utrNumber, "432198765012");
  assert.equal(merged.totalAmount, "12,000");
  assert.equal(merged.incidentDateTime, "2026-08-24T14:32");
  assert.equal(merged.suspectVpa, "taskdesk42@okaxis");
  assert.equal(merged.suspectIfsc, "HDFC0001234");

  const humanReadableDate = mergePreparedFinancialDraft(
    EMPTY_FINANCIAL_DRAFT,
    {
      incidentDateTime: "24 August 2026 at 2:32 PM",
      totalAmount: null,
      utrNumber: null,
      bankName: null,
      victimAccountNumber: null,
      suspectVpa: null,
      suspectPhone: null,
      suspectIfsc: null,
      suspectAccountNumber: null,
    },
  );
  assert.equal(humanReadableDate.incidentDateTime, "2026-08-24T14:32");

  const impossibleDate = mergePreparedFinancialDraft(
    EMPTY_FINANCIAL_DRAFT,
    { ...humanReadableDate, incidentDateTime: "31 February 2026 at 2:32 PM", totalAmount: null },
  );
  assert.equal(impossibleDate.incidentDateTime, "");
});

test("browser audio is normalized from magic bytes instead of trusting the filename", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86]);
  assert.deepEqual(detectBrowserAudioContainer(webm), { extension: "webm", mediaType: "audio/webm" });
  const misleading = new File([webm], "voice.wav", { type: "audio/wav" });
  const normalized = normalizeBrowserAudioFile(misleading, webm.buffer);
  assert.equal(normalized?.name, "citizen-voice.webm");
  assert.equal(normalized?.type, "audio/webm");
  assert.equal(normalizeBrowserAudioFile(misleading, new Uint8Array([1, 2, 3]).buffer), null);
});
