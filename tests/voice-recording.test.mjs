import assert from "node:assert/strict";
import test from "node:test";

import {
  appendNarration,
  audioFilename,
  chooseRecorderMimeType,
  hasUsableRecording,
  microphoneErrorMessage,
  RECORDER_MIME_TYPES,
} from "../lib/voice-recording.ts";

test("dictation preserves existing words and selects a browser-supported audio format", () => {
  assert.equal(appendNarration("My first detail.", "A second dictated detail."), "My first detail.\nA second dictated detail.");
  assert.equal(appendNarration("", "First dictation."), "First dictation.");
  assert.equal(appendNarration("Existing words", "   "), "Existing words");

  assert.equal(
    chooseRecorderMimeType((mimeType) => mimeType === "audio/mp4;codecs=mp4a.40.2"),
    "audio/mp4;codecs=mp4a.40.2",
  );
  assert.equal(
    chooseRecorderMimeType((mimeType) => mimeType === "audio/webm" || mimeType === "audio/mp4"),
    "audio/webm",
  );
  assert.equal(chooseRecorderMimeType(() => false), null);
  assert.ok(RECORDER_MIME_TYPES.includes("audio/ogg;codecs=opus"));

  assert.equal(audioFilename("audio/mp4;codecs=mp4a.40.2"), "citizen-voice.m4a");
  assert.equal(audioFilename("audio/ogg;codecs=opus"), "citizen-voice.ogg");
  assert.equal(audioFilename("audio/webm;codecs=opus"), "citizen-voice.webm");

  assert.equal(hasUsableRecording(8_000, 1_200), true);
  assert.equal(hasUsableRecording(8_000, 250), false);
  assert.equal(hasUsableRecording(0, 1_200), false);

  assert.match(microphoneErrorMessage({ name: "NotAllowedError" }), /permission is blocked/i);
  assert.match(microphoneErrorMessage({ name: "NotFoundError" }), /No microphone/i);
  assert.match(microphoneErrorMessage({ name: "NotReadableError" }), /busy in another app/i);
});
