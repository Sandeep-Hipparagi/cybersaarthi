import assert from "node:assert/strict";
import test from "node:test";

import { assessEvidenceRecency, recencyAgeLabel } from "../lib/evidence-recency.ts";

test("verified OCR timestamps produce deterministic, timezone-safe safety windows", () => {
  const now = new Date("2026-08-27T08:00:00.000Z");

  const urgent = assessEvidenceRecency("27 Aug 2026, 13:00 IST", now);
  assert.deepEqual(urgent, {
    window: "UNDER_2H",
    observedAt: "27 Aug 2026, 13:00 IST",
    ageMinutes: 30,
    reason: "WITHIN_TWO_HOURS",
  });
  assert.equal(recencyAgeLabel(urgent.ageMinutes), "30 min ago");

  const older = assessEvidenceRecency("24 Aug 2026, 14:32 IST", now);
  assert.equal(older.window, "OVER_2H");
  assert.equal(older.reason, "OUTSIDE_TWO_HOURS");
  assert.equal(recencyAgeLabel(older.ageMinutes), "2 days ago");

  const future = assessEvidenceRecency("28 Aug 2026, 14:32 IST", now);
  assert.equal(future.window, "UNKNOWN");
  assert.equal(future.reason, "FUTURE_TIMESTAMP");

  const missingTimezone = assessEvidenceRecency("27 Aug 2026 01:00 PM", now);
  assert.equal(missingTimezone.window, "UNKNOWN");
  assert.equal(missingTimezone.reason, "UNREADABLE_TIMESTAMP");

  const invalidCalendarDate = assessEvidenceRecency("31 Feb 2026, 13:00 IST", now);
  assert.equal(invalidCalendarDate.window, "UNKNOWN");
  assert.equal(invalidCalendarDate.reason, "UNREADABLE_TIMESTAMP");
});
