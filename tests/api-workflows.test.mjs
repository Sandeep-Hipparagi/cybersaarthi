import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("./cloudflare-loader.mjs", import.meta.url), import.meta.url);

const { Miniflare } = await import("miniflare");

const SESSION_SECRET = "cybersaarthi-automated-test-session-secret-2026";
const CITIZEN = {
  email: "citizen@test.com",
  password: "test2026",
};
const EVALUATOR = {
  email: "evaluator@cybersaarthi.demo",
  password: "JudgeDemo2026!",
};
const SYNTHETIC_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const SYNTHETIC_WEBM_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01]);
const SYNTHETIC_M4A_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
]);

function cookieValue(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "login should set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function responseJson(response) {
  const body = await response.json();
  return { response, body };
}

function assertStrictSchema(schema) {
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
    for (const child of Object.values(schema.properties)) assertStrictSchema(child);
  }
  if (schema.items) assertStrictSchema(schema.items);
  for (const child of schema.anyOf ?? []) assertStrictSchema(child);
}

test("all independent prototype API workflows", async (t) => {
  process.env.AUTH_SESSION_SECRET = SESSION_SECRET;
  delete process.env.SARVAM_API_KEY;
  delete process.env.SARVAM_TTS_MODEL;
  delete process.env.SARVAM_TTS_SPEAKER;
  delete process.env.SARVAM_TRANSLATION_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_SUPPORT_MODEL;

  const mf = new Miniflare({
    compatibilityDate: "2026-05-22",
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  t.after(async () => mf.dispose());

  const db = await mf.getD1Database("DB");
  const migrationsDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const migrationFile of migrationFiles) {
    const migration = await readFile(new URL(migrationFile, migrationsDirectory), "utf8");
    for (const statement of migration
      .replaceAll("--> statement-breakpoint", "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
  globalThis.__CYBERSAARTHI_TEST_ENV__ = { DB: db };

  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-workflows", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const executionContext = { waitUntil() {}, passThroughOnException() {} };
  const workerEnv = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    DB: db,
  };

  async function api(path, options = {}) {
    const headers = new Headers(options.headers);
    if (options.cookie) headers.set("Cookie", options.cookie);
    let body = options.body;
    if (options.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.json);
    }
    return worker.fetch(
      new Request(`${options.protocol ?? "http"}://local.test${path}`, {
        method: options.method ?? (body === undefined ? "GET" : "POST"),
        headers,
        body,
      }),
      workerEnv,
      executionContext,
    );
  }

  await t.test("authentication, cookie security, and role sessions", async () => {
    assert.equal((await api("/api/cases")).status, 401);

    const malformed = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);

    const wrong = await api("/api/auth/login", {
      json: { email: CITIZEN.email, password: "wrong" },
    });
    assert.equal(wrong.status, 401);

    const httpLogin = await api("/api/auth/login", { json: CITIZEN });
    assert.equal(httpLogin.status, 200);
    assert.doesNotMatch(httpLogin.headers.get("set-cookie") ?? "", /; Secure/i);
    const citizenCookie = cookieValue(httpLogin);
    const session = await responseJson(await api("/api/auth/session", { cookie: citizenCookie }));
    assert.equal(session.response.status, 200);
    assert.deepEqual(session.body.session, {
      email: CITIZEN.email,
      name: "Sandeep Hipparagi",
      role: "CITIZEN",
    });

    const judgeSession = await api("/api/auth/judge-session", { method: "POST" });
    assert.equal(judgeSession.status, 200);
    assert.equal((await judgeSession.clone().json()).otpRequired, false);
    assert.ok(cookieValue(judgeSession));

    const httpsLogin = await api("/api/auth/login", { json: EVALUATOR, protocol: "https" });
    assert.equal(httpsLogin.status, 200);
    assert.match(httpsLogin.headers.get("set-cookie") ?? "", /; Secure/i);

    const [name, token] = citizenCookie.split("=");
    const finalCharacter = token.at(-1) === "a" ? "b" : "a";
    const tampered = `${name}=${token.slice(0, -1)}${finalCharacter}`;
    assert.equal((await api("/api/auth/session", { cookie: tampered })).status, 401);

    const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const finalIndex = base64UrlAlphabet.indexOf(token.at(-1));
    assert.equal(finalIndex % 4, 0, "canonical 32-byte HMAC encoding should end on a four-character boundary");
    const paddingBitMutation = `${name}=${token.slice(0, -1)}${base64UrlAlphabet[finalIndex + 1]}`;
    assert.equal(
      (await api("/api/auth/session", { cookie: paddingBitMutation })).status,
      401,
      "non-canonical Base64URL encodings must not verify even when decoded bytes match",
    );

    const logout = await api("/api/auth/logout", { method: "POST", cookie: citizenCookie });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);

    t.mock.timers.enable({ apis: ["Date"], now: new Date() });
    t.mock.timers.tick(4 * 60 * 60 * 1000 + 1000);
    assert.equal((await api("/api/auth/session", { cookie: citizenCookie })).status, 401);
    t.mock.timers.reset();
  });

  const citizenLogin = await api("/api/auth/login", { json: CITIZEN });
  const citizenCookie = cookieValue(citizenLogin);
  const evaluatorLogin = await api("/api/auth/login", { json: EVALUATOR });
  const evaluatorCookie = cookieValue(evaluatorLogin);

  await t.test("voice transcription boundary, automatic language detection, and provider request shape", async () => {
    const status = await responseJson(await api("/api/asr"));
    assert.equal(status.response.status, 200);
    assert.equal(status.body.configured, false);
    assert.equal(status.body.model, "saaras:v3");
    assert.equal(status.body.autoDetect, true);
    assert.ok(status.body.supportedLanguageCount >= 23);

    const fixture = await responseJson(await api("/api/asr", {
      cookie: citizenCookie,
      json: { fixture: true },
    }));
    assert.equal(fixture.response.status, 200);
    assert.equal(fixture.body.synthetic, true);
    assert.ok(fixture.body.nativeTranscript.length > 20);
    assert.ok(fixture.body.englishTranscript.length > 20);

    assert.equal((await api("/api/asr", {
      method: "POST",
      cookie: citizenCookie,
      headers: { "Content-Type": "application/json" },
      body: "{",
    })).status, 400);

    const noNotice = new FormData();
    noNotice.set("audio", new File([SYNTHETIC_WEBM_BYTES], "fixture.webm", { type: "audio/webm" }));
    assert.equal((await api("/api/asr", { cookie: citizenCookie, body: noNotice })).status, 422);

    const notConfigured = new FormData();
    notConfigured.set("audio", new File([SYNTHETIC_WEBM_BYTES], "fixture.webm", { type: "audio/webm" }));
    notConfigured.set("processingNoticeAccepted", "true");
    assert.equal((await api("/api/asr", { cookie: citizenCookie, body: notConfigured })).status, 503);

    const originalFetch = globalThis.fetch;
    const providerCalls = [];
    const translationCalls = [];
    let failTextTranslation = false;
    let failTranscription = false;
    process.env.SARVAM_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (input, init) => {
      if (String(input) === "https://api.sarvam.ai/translate") {
        const body = JSON.parse(String(init?.body));
        translationCalls.push(body);
        if (failTextTranslation) return new Response("temporary provider failure", { status: 503 });
        return Response.json({ translated_text: "English working copy from voice." });
      }
      if (String(input) !== "https://api.sarvam.ai/speech-to-text") return originalFetch(input, init);
      const form = init?.body;
      assert.ok(form instanceof FormData);
      providerCalls.push({
        mode: form.get("mode"),
        model: form.get("model"),
        languageCode: form.get("language_code"),
        header: new Headers(init.headers).get("api-subscription-key"),
        file: form.get("file"),
      });
      if (failTranscription && form.get("mode") === "transcribe") {
        return new Response("temporary provider failure", { status: 503 });
      }
      return Response.json({
        transcript: form.get("mode") === "translate" ? "English working copy from voice." : "Original voice account in the detected language.",
        language_code: "ta-IN",
        language_probability: 0.98,
      });
    };
    try {
      const liveForm = new FormData();
      liveForm.set("audio", new File([SYNTHETIC_WEBM_BYTES], "citizen.webm", { type: "audio/webm" }));
      liveForm.set("processingNoticeAccepted", "true");
      const live = await responseJson(await api("/api/asr", { cookie: citizenCookie, body: liveForm }));
      assert.equal(live.response.status, 200);
      assert.equal(live.body.nativeTranscript, "Original voice account in the detected language.");
      assert.equal(live.body.englishTranscript, "English working copy from voice.");
      assert.equal(live.body.languageCode, "ta-IN");
      assert.deepEqual(providerCalls.map((call) => call.mode), ["transcribe"]);
      assert.ok(providerCalls.every((call) => call.model === "saaras:v3"));
      assert.ok(providerCalls.every((call) => call.languageCode === "unknown"));
      assert.ok(providerCalls.every((call) => call.header === "synthetic-test-key"));
      assert.ok(providerCalls.every((call) => call.file instanceof File));
      assert.equal(translationCalls.length, 1);
      assert.equal(translationCalls[0].source_language_code, "ta-IN");
      assert.equal(translationCalls[0].target_language_code, "en-IN");

      providerCalls.length = 0;
      translationCalls.length = 0;
      failTextTranslation = true;
      const safariForm = new FormData();
      safariForm.set("audio", new File([SYNTHETIC_M4A_BYTES], "citizen.m4a", { type: "audio/mp4" }));
      safariForm.set("processingNoticeAccepted", "true");
      const fallback = await responseJson(await api("/api/asr", { cookie: citizenCookie, body: safariForm }));
      assert.equal(fallback.response.status, 200, "translation failure must not discard successful dictation");
      assert.equal(fallback.body.nativeTranscript, "Original voice account in the detected language.");
      assert.equal(fallback.body.englishTranscript, fallback.body.nativeTranscript);
      assert.equal(fallback.body.translationStatus, "FALLBACK_NATIVE");
      assert.equal(fallback.body.warnings.length, 1);
      assert.equal(providerCalls.length, 1);
      assert.ok(providerCalls.every((call) => call.file.type === "audio/mp4"));
      assert.ok(providerCalls.every((call) => call.file.name === "citizen-voice.m4a"));
      assert.equal(translationCalls.length, 1);

      providerCalls.length = 0;
      translationCalls.length = 0;
      failTextTranslation = false;
      failTranscription = true;
      const failedForm = new FormData();
      failedForm.set("audio", new File([SYNTHETIC_WEBM_BYTES], "citizen.webm", { type: "audio/webm" }));
      failedForm.set("processingNoticeAccepted", "true");
      const failed = await responseJson(await api("/api/asr", { cookie: citizenCookie, body: failedForm }));
      assert.equal(failed.response.status, 502, "a failed transcription must not be replaced with a different semantic mode");
      assert.equal(failed.body.code, "VOICE_TRANSCRIPTION_FAILED_503");
      assert.deepEqual(providerCalls.map((call) => call.mode), ["transcribe", "transcribe"]);
      assert.equal(translationCalls.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SARVAM_API_KEY;
    }
    assert.equal((await api("/api/asr", { cookie: evaluatorCookie, json: { fixture: true } })).status, 403);
  });

  await t.test("natural TTS boundary and provider request shape", async () => {
    const status = await responseJson(await api("/api/tts"));
    assert.equal(status.response.status, 200);
    assert.equal(status.body.configured, false);
    assert.equal(status.body.model, "bulbul:v3");
    assert.equal(status.body.autoVoiceLanguage, true);
    assert.ok(status.body.supportedLanguageCount >= 23);
    assert.equal((await api("/api/tts", { json: { text: "Hello", languageCode: "en-IN" } })).status, 401);
    assert.equal((await api("/api/tts", { cookie: citizenCookie, json: { text: "", languageCode: "en-IN" } })).status, 400);
    assert.equal((await api("/api/tts", { cookie: citizenCookie, json: { text: "Hello", languageCode: "unknown" } })).status, 503);
    assert.equal((await api("/api/tts", { cookie: citizenCookie, json: { text: "Hello", languageCode: "en-IN" } })).status, 503);

    const originalFetch = globalThis.fetch;
    let providerRequest;
    process.env.SARVAM_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://api.sarvam.ai/text-to-speech") return originalFetch(input, init);
      providerRequest = {
        body: JSON.parse(String(init?.body)),
        header: new Headers(init?.headers).get("api-subscription-key"),
      };
      return Response.json({ request_id: "synthetic-request", audios: [btoa("RIFFsynthetic-wave")] });
    };
    try {
      const speech = await api("/api/tts", {
        cookie: citizenCookie,
        json: { text: "Please speak slowly.", languageCode: "ta-IN" },
      });
      assert.equal(speech.status, 200);
      assert.equal(speech.headers.get("content-type"), "audio/wav");
      assert.match(await speech.text(), /^RIFF/);
      assert.equal(providerRequest.header, "synthetic-test-key");
      assert.deepEqual(providerRequest.body, {
        text: "Please speak slowly.",
        language_code: "ta-IN",
        model: "bulbul:v3",
        speaker: "kavya",
        pace: 0.92,
        temperature: 0.35,
        output_audio_codec: "wav",
        speech_sample_rate: 24000,
      });
      const defaultLanguage = await api("/api/tts", {
        cookie: citizenCookie,
        json: { text: "Start speaking when ready.", languageCode: "unknown" },
      });
      assert.equal(defaultLanguage.status, 200);
      assert.equal(providerRequest.body.language_code, "en-IN");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SARVAM_API_KEY;
    }
    assert.equal((await api("/api/tts", { cookie: evaluatorCookie, json: { text: "Hello", languageCode: "en-IN" } })).status, 403);
  });

  await t.test("four-turn conversational voice-agent workflow with district capture", async () => {
    const metadata = await responseJson(await api("/api/voice-agent", { cookie: citizenCookie }));
    assert.equal(metadata.response.status, 200);
    assert.equal(metadata.body.selectedAgentId, "Sarvam-Voic-3cb2474d-5463");
    assert.equal(metadata.body.selectedAgentVersion, 2);
    assert.equal(metadata.body.liveRuntimeConnected, false);
    assert.equal(metadata.body.languageAutoDetect, true);
    assert.equal(metadata.body.turnCount, 4);

    const start = await responseJson(await api("/api/voice-agent", {
      cookie: citizenCookie,
      json: { action: "START", step: 0 },
    }));
    assert.equal(start.response.status, 200);
    assert.equal(start.body.step, 0);
    assert.equal(start.body.complete, false);

    let turn;
    for (let step = 0; step < 4; step += 1) {
      turn = await responseJson(await api("/api/voice-agent", {
        cookie: citizenCookie,
        json: { action: "SYNTHETIC_TURN", step },
      }));
      assert.equal(turn.response.status, 200);
      assert.equal(turn.body.step, step + 1);
      assert.equal(turn.body.synthetic, true);
    }
    assert.equal(turn.body.complete, true);
    assert.equal(turn.body.answerCapture, "DISTRICT");
    assert.equal(turn.body.answerEnglish, "Bengaluru Urban.");
    assert.match(turn.body.promptEnglish, /review/i);

    assert.equal((await api("/api/voice-agent", {
      cookie: citizenCookie,
      json: { action: "SYNTHETIC_TURN", step: 99 },
    })).status, 400);

    const originalFetch = globalThis.fetch;
    let translationRequest;
    process.env.SARVAM_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://api.sarvam.ai/translate") return originalFetch(input, init);
      translationRequest = JSON.parse(String(init?.body));
      return Response.json({ translated_text: "Localized next question.", source_language_code: "en-IN" });
    };
    try {
      const liveTurn = await responseJson(await api("/api/voice-agent", {
        cookie: citizenCookie,
        json: {
          action: "TURN",
          detectedLanguageCode: "ta-IN",
          step: 0,
          nativeAnswer: "A detailed answer in the citizen's detected language.",
          englishAnswer: "A detailed English working copy.",
        },
      }));
      assert.equal(liveTurn.response.status, 200);
      assert.equal(liveTurn.body.languageCode, "ta-IN");
      assert.equal(liveTurn.body.promptNative, "Localized next question.");
      assert.equal(translationRequest.source_language_code, "en-IN");
      assert.equal(translationRequest.target_language_code, "ta-IN");
      assert.equal(translationRequest.model, "sarvam-translate:v1");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SARVAM_API_KEY;
    }

    assert.equal((await api("/api/voice-agent", {
      method: "POST",
      cookie: citizenCookie,
      headers: { "Content-Type": "application/json" },
      body: "{",
    })).status, 400);
    assert.equal((await api("/api/voice-agent", {
      cookie: evaluatorCookie,
      json: { action: "START", step: 0 },
    })).status, 403);
  });

  await t.test("synthetic evidence contract and live GPT-4o request shape", async () => {
    const unauthorised = new FormData();
    unauthorised.set("image", new File([SYNTHETIC_PNG_BYTES], "bank-sms.png", { type: "image/png" }));
    unauthorised.set("consent", "true");
    unauthorised.set("synthetic", "true");
    assert.equal((await api("/api/evidence/analyse", { body: unauthorised })).status, 401);

    const noConsent = new FormData();
    noConsent.set("image", new File([SYNTHETIC_PNG_BYTES], "bank-sms.png", { type: "image/png" }));
    noConsent.set("synthetic", "true");
    assert.equal((await api("/api/evidence/analyse", { cookie: citizenCookie, body: noConsent })).status, 400);

    const mockForm = new FormData();
    mockForm.set("image", new File([SYNTHETIC_PNG_BYTES], "bank-sms.png", { type: "image/png" }));
    mockForm.set("consent", "true");
    mockForm.set("synthetic", "true");
    mockForm.set("mode", "DEMO");
    const mock = await responseJson(await api("/api/evidence/analyse", { cookie: citizenCookie, body: mockForm }));
    assert.equal(mock.response.status, 200);
    assert.equal(mock.body.mode, "DEMO");
    assert.equal(mock.body.provider, "CYBERSAARTHI_DETERMINISTIC_MOCK");
    assert.deepEqual(mock.body.extractedTechnicalEvidence, {
      suspectPhoneNumber: "+91 90000 11223",
      suspectUpiId: "taskdesk42@okaxis",
      transactionTimestamp: "24 Aug 2026, 14:32 IST",
      transactionReferenceNumber: "432198765012",
    });
    assert.equal(mock.body.findings.length, 4);
    assert.ok(mock.body.findings.every((finding) => finding.requiresHumanConfirmation === true));
    assert.ok(mock.body.findings.every((finding) => finding.humanVerified === false));
    assert.match(mock.body.checksum, /^[a-f0-9]{64}$/);

    const wrongType = new FormData();
    wrongType.set("image", new File(["synthetic screenshot"], "bank-sms.txt", { type: "text/plain" }));
    wrongType.set("consent", "true");
    wrongType.set("synthetic", "true");
    assert.equal((await api("/api/evidence/analyse", { cookie: citizenCookie, body: wrongType })).status, 415);

    const mismatchedSignature = new FormData();
    mismatchedSignature.set("image", new File(["not a png"], "bank-sms.png", { type: "image/png" }));
    mismatchedSignature.set("consent", "true");
    mismatchedSignature.set("synthetic", "true");
    assert.equal((await api("/api/evidence/analyse", { cookie: citizenCookie, body: mismatchedSignature })).status, 415);

    const evaluatorForm = new FormData();
    evaluatorForm.set("image", new File([SYNTHETIC_PNG_BYTES], "bank-sms.png", { type: "image/png" }));
    evaluatorForm.set("consent", "true");
    evaluatorForm.set("synthetic", "true");
    assert.equal((await api("/api/evidence/analyse", { cookie: evaluatorCookie, body: evaluatorForm })).status, 403);

    const originalFetch = globalThis.fetch;
    let providerRequest;
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://api.openai.com/v1/responses") return originalFetch(input, init);
      providerRequest = JSON.parse(String(init?.body));
      const modelOutput = {
        extractedTechnicalEvidence: mock.body.extractedTechnicalEvidence,
        findings: mock.body.findings.map((finding) => ({ ...finding, sourceImageId: "MODEL-EVIDENCE-ID" })),
        warnings: [],
      };
      return Response.json({ output_text: JSON.stringify(modelOutput) });
    };
    try {
      const liveForm = new FormData();
      liveForm.set("image", new File([SYNTHETIC_PNG_BYTES], "bank-sms.png", { type: "image/png" }));
      liveForm.set("consent", "true");
      liveForm.set("synthetic", "true");
      liveForm.set("mode", "OPENAI");
      const live = await responseJson(await api("/api/evidence/analyse", { cookie: citizenCookie, body: liveForm }));
      assert.equal(live.response.status, 200);
      assert.equal(live.body.mode, "OPENAI");
      assert.match(live.body.checksum, /^[a-f0-9]{64}$/);
      assert.equal(providerRequest.model, "gpt-4o-2024-08-06");
      assert.equal(providerRequest.text.format.type, "json_schema");
      assert.equal(providerRequest.text.format.strict, true);
      assertStrictSchema(providerRequest.text.format.schema);
      assert.equal(providerRequest.input[1].content[1].type, "input_image");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    }
  });

  let prepared;
  await t.test("strict structured preparation and provider boundary", async () => {
    const story = "I received a payment link and a synthetic debit of ₹12,000 from HDFC Bank on 22 August 2026 at 10:42 AM. The synthetic UTR is 628415739201.";
    const demo = await responseJson(await api("/api/prepare", {
      cookie: citizenCookie,
      json: { story, language: "English", mode: "DEMO" },
    }));
    assert.equal(demo.response.status, 200);
    prepared = demo.body;
    assert.equal(prepared.mode, "DEMO");
    assert.equal(prepared.integrationStatus, "DISCONNECTED");
    assert.equal(prepared.classification.topLevelRoute, "FINANCIAL_FRAUD");
    assert.equal(prepared.officialStatus.verifiedByCyberSaarthi, false);
    assert.ok(Object.hasOwn(prepared.reviewPayload, "transactionReference"));
    const preparedFacts = new Map(prepared.candidateFacts.map((fact) => [fact.fieldId, fact.value]));
    assert.equal(preparedFacts.get("financial.transactionReference"), "628415739201");
    assert.equal(preparedFacts.get("incident.dateTime"), "22 August 2026 at 10:42 AM");
    assert.equal(preparedFacts.get("financial.institution"), "HDFC Bank");
    assert.equal(preparedFacts.has("suspect.phone"), false, "a UTR must not be treated as a phone number");
    assert.equal(prepared.unknownFields.some((item) => item.fieldId === "financial.transactionReference"), false);
    assert.equal(prepared.unknownFields.some((item) => item.fieldId === "incident.dateTime"), false);

    const codeMixed = await responseJson(await api("/api/prepare", {
      cookie: citizenCookie,
      json: {
        story: "Mera bank account block ho gaya, link click karne ke baad OTP share kiya",
        language: "Auto-detected",
        mode: "DEMO",
      },
    }));
    assert.equal(codeMixed.response.status, 200);
    assert.equal(codeMixed.body.classification.topLevelRoute, "FINANCIAL_FRAUD");
    assert.equal(codeMixed.body.classification.requiresHumanConfirmation, true);

    const originalFetch = globalThis.fetch;
    let providerOutput = { ...structuredClone(prepared), mode: "OPENAI" };
    let providerRequest;
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://api.openai.com/v1/responses") {
        return originalFetch(input, init);
      }
      providerRequest = JSON.parse(String(init?.body));
      return Response.json({ output_text: JSON.stringify(providerOutput) });
    };
    try {
      const openAI = await responseJson(await api("/api/prepare", {
        cookie: citizenCookie,
        json: { story, language: "English", mode: "OPENAI", consent: true },
      }));
      assert.equal(openAI.response.status, 200);
      assert.equal(openAI.body.mode, "OPENAI");
      assert.equal(providerRequest.text.format.strict, true);
      assert.equal(providerRequest.text.format.type, "json_schema");
      assertStrictSchema(providerRequest.text.format.schema);

      providerOutput = { ...providerOutput, undeclaredField: true };
      assert.equal((await api("/api/prepare", {
        cookie: citizenCookie,
        json: { story, language: "English", mode: "OPENAI", consent: true },
      })).status, 502, "runtime validation must reject undeclared provider fields");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    }

    assert.equal((await api("/api/prepare", {
      cookie: citizenCookie,
      json: { story, language: "English", mode: "INVALID" },
    })).status, 400);
    assert.equal((await api("/api/prepare", {
      method: "POST",
      cookie: citizenCookie,
      headers: { "Content-Type": "application/json" },
      body: "{",
    })).status, 400);
    assert.equal((await api("/api/prepare", {
      cookie: citizenCookie,
      json: { story, language: "English", mode: "OPENAI", consent: false },
    })).status, 400);
    assert.equal((await api("/api/prepare", {
      cookie: citizenCookie,
      json: { story, language: "English", mode: "OPENAI", consent: true },
    })).status, 503);
  });

  await t.test("narration fields use the configured structured model with a safe fallback", async () => {
    const story = prepared.transcript.text;
    const fallback = await responseJson(await api("/api/prepare-fields", {
      cookie: citizenCookie,
      json: {
        story,
        facts: prepared.candidateFacts,
        synthetic: true,
        modelProcessingAccepted: true,
      },
    }));
    assert.equal(fallback.response.status, 200);
    assert.equal(fallback.body.provider, "DETERMINISTIC_FALLBACK");
    assert.equal(fallback.body.fields.utrNumber, "628415739201");
    assert.equal(fallback.body.fields.totalAmount, 12000);
    assert.equal(fallback.body.requiresHumanConfirmation, true);

    assert.equal((await api("/api/prepare-fields", {
      cookie: citizenCookie,
      json: { story, facts: [], synthetic: true, modelProcessingAccepted: false },
    })).status, 422);

    const originalFetch = globalThis.fetch;
    let providerRequest;
    process.env.SARVAM_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://api.sarvam.ai/v1/chat/completions") return originalFetch(input, init);
      providerRequest = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              fields: {
                incidentDateTime: "2026-08-22T10:42:00+05:30",
                totalAmount: 12000,
                utrNumber: "628415739201",
                bankName: "HDFC Bank",
                victimAccountNumber: null,
                suspectVpa: "taskdesk42@okaxis",
                suspectPhone: null,
                suspectIfsc: null,
                suspectAccountNumber: null,
              },
              warnings: [],
            }),
          },
        }],
      });
    };
    try {
      const live = await responseJson(await api("/api/prepare-fields", {
        cookie: citizenCookie,
        json: {
          story,
          facts: prepared.candidateFacts,
          synthetic: true,
          modelProcessingAccepted: true,
        },
      }));
      assert.equal(live.response.status, 200);
      assert.equal(live.body.provider, "SARVAM");
      assert.equal(live.body.model, "sarvam-105b");
      assert.equal(live.body.fields.suspectVpa, "taskdesk42@okaxis");
      assert.equal(providerRequest.response_format.type, "json_schema");
      assert.equal(providerRequest.response_format.json_schema.strict, true);
      assert.equal(providerRequest.reasoning_effort, null);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SARVAM_API_KEY;
    }
  });

  let caseId;
  await t.test("citizen record, persistence, ownership, and follow-up", async () => {
    const seededInitial = await responseJson(await api("/api/cases", { cookie: citizenCookie }));
    assert.equal(seededInitial.response.status, 200);
    assert.equal(seededInitial.body.cases.length, 1);
    assert.match(seededInitial.body.cases[0].demoReference, /^\d{14}$/);
    assert.match(seededInitial.body.cases[0].id, /^CYS-DEMO-\d{14}$/);
    const seededFacts = new Map(seededInitial.body.cases[0].facts.map((fact) => [fact.fieldId, fact.value]));
    assert.equal(seededFacts.get("financial.institution"), "State Bank of India");
    assert.match(String(seededFacts.get("transaction.reference")), /^\d{12}$/);

    const legacyId = "CYS-DEMO-2026-LEGACY";
    await db.prepare(`INSERT INTO cases (
      id, owner_email, reporter_name, title, narrative_native, narrative_english,
      language_code, provider, model, route, district, loss_amount, status, urgency,
      facts_json, unknowns_json, assigned_to, synthetic, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        legacyId, CITIZEN.email, "Asha Rao", "Legacy synthetic record",
        "This is a sufficiently detailed original synthetic legacy narrative.",
        "This is a sufficiently detailed English synthetic legacy narrative.",
        "en-IN", "DETERMINISTIC_DEMO", null, "OTHER_CYBER_CRIME", null, null,
        "SYNTHETIC_RECORDED", "ROUTINE", "[]", "[]", "Demo review desk", 1,
        "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z",
      ).run();
    await db.prepare(`INSERT INTO case_events (
      id, case_id, event_type, title, description, actor_role, actor_label, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind("EV-LEGACY", legacyId, "CASE_RECORDED", "Legacy", "Legacy", "CITIZEN", "Asha Rao", "{}", "2026-08-20T00:00:00.000Z")
      .run();

    const initial = await responseJson(await api("/api/cases", { cookie: citizenCookie }));
    assert.equal(initial.response.status, 200);
    assert.ok(initial.body.cases.every((item) => item.reporterName === "Sandeep Hipparagi"));
    assert.ok(initial.body.cases.flatMap((item) => item.events).every((event) => event.actorLabel !== "Asha Rao"));

    const submissionPayload = {
      synthetic: true,
      reviewedByCitizen: true,
      unresolvedCriticalConflicts: 0,
      title: "Automated synthetic payment-link case",
      narrativeNative: prepared.transcript.text,
      narrativeEnglish: prepared.transcript.text,
      languageCode: "unknown",
      provider: "DETERMINISTIC_DEMO",
      model: null,
      route: prepared.classification.topLevelRoute,
      district: "Bengaluru Urban",
      lossAmount: 12000,
      urgency: prepared.urgency.level,
      facts: [
        ...prepared.candidateFacts,
        {
          fieldId: "suspect.upi_id",
          label: "Recipient UPI ID",
          value: "taskdesk42@okaxis",
          source: "Citizen-reviewed synthetic fixture",
          status: "ACCEPTED",
        },
      ],
      unknowns: prepared.unknownFields,
    };

    assert.equal((await api("/api/demo-records", {
      cookie: citizenCookie,
      json: { ...submissionPayload, reviewedByCitizen: false },
    })).status, 422);
    assert.equal((await api("/api/demo-records", {
      cookie: citizenCookie,
      json: { ...submissionPayload, unresolvedCriticalConflicts: 1 },
    })).status, 422);
    assert.equal((await api("/api/demo-records", {
      cookie: citizenCookie,
      json: { ...submissionPayload, district: "" },
    })).status, 422, "district is mandatory before closure");
    assert.equal((await api("/api/demo-records", {
      cookie: citizenCookie,
      json: { ...submissionPayload, provider: "WEB_SCRAPE" },
    })).status, 422, "scraped inputs must stay leads and never create cases");

    const created = await responseJson(await api("/api/demo-records", {
      cookie: citizenCookie,
      json: submissionPayload,
    }));
    assert.equal(created.response.status, 201);
    caseId = created.body.caseId;
    assert.match(caseId, /^CYS-DEMO-\d{14}$/);
    assert.match(created.body.demoReference, /^\d{14}$/);
    assert.equal(created.body.officialAcknowledgementNumber, null);
    assert.equal(created.body.firNumber, null);
    assert.match(created.body.disclosure, /NOT NCRP · NOT AN FIR/);
    assert.equal(created.body.integrity.sourceGate, "PASSED");
    assert.equal(created.body.integrity.duplicateGate, "UNIQUE");
    assert.equal(created.body.integrity.routingGate, "CITIZEN_CONFIRMED");
    assert.ok(created.body.integrity.preflightMs < 1000);

    const duplicate = await responseJson(await api("/api/demo-records", {
      cookie: citizenCookie,
      json: submissionPayload,
    }));
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.existingCaseId, caseId);

    const repeatFixtureOne = await responseJson(await api("/api/demo-records", {
      cookie: citizenCookie,
      json: { ...submissionPayload, provider: "VOICE_DEMO_FIXTURE" },
    }));
    const repeatFixtureTwo = await responseJson(await api("/api/demo-records", {
      cookie: citizenCookie,
      json: { ...submissionPayload, provider: "VOICE_DEMO_FIXTURE" },
    }));
    assert.equal(repeatFixtureOne.response.status, 201);
    assert.equal(repeatFixtureTwo.response.status, 201);
    assert.notEqual(repeatFixtureOne.body.demoReference, repeatFixtureTwo.body.demoReference);
    assert.equal(repeatFixtureTwo.body.integrity.duplicateGate, "SYNTHETIC_REPEAT_LINKED");

    const transaction = await responseJson(await api(
      "/api/workflows/financial?utr=628415739201",
      { cookie: citizenCookie },
    ));
    assert.equal(transaction.response.status, 200);
    assert.equal(transaction.body.transaction.utrNumber, "628415739201");
    assert.equal(transaction.body.transaction.originInstitution, "HDFC Bank");
    assert.equal(transaction.body.transaction.destinationWallet, "taskdesk42@okaxis");
    assert.equal(transaction.body.transaction.externalBankVerification, "DISCONNECTED");
    assert.equal(transaction.body.transaction.destinationClassification, "UNVERIFIED_RECIPIENT");

    const timelineDescription = [
      "I first received a synthetic payment message and opened the conversation to understand the offer.",
      "The sender then asked me to make a payment through UPI and shared recipient details for the transfer.",
      "After I paid, the sender stopped responding, so I preserved the messages, transaction reference, and screenshots.",
    ].join(" # ");
    const timeline = await responseJson(await api("/api/workflows/timeline", {
      cookie: citizenCookie,
      json: { acknowledgementNumber: repeatFixtureOne.body.demoReference, description: timelineDescription },
    }));
    assert.equal(timeline.response.status, 200);
    assert.equal(timeline.body.sanitization.removedCharacters, 2);
    assert.ok(timeline.body.timeline.parsedNarrativeEvents.length >= 3);
    assert.equal(timeline.body.timeline.rawEvidencePersisted, false);

    const statusAudit = await responseJson(await api(
      `/api/workflows/status?acknowledgement=${repeatFixtureOne.body.demoReference}`,
      { cookie: citizenCookie },
    ));
    assert.equal(statusAudit.response.status, 200);
    assert.equal(statusAudit.body.audit.displayStatus, "Pending");
    assert.equal(statusAudit.body.audit.officialStatus, null);

    assert.equal((await api("/api/workflows/financial?utr=123", { cookie: citizenCookie })).status, 422);
    assert.equal((await api("/api/workflows/status?acknowledgement=123", { cookie: citizenCookie })).status, 422);

    const reloaded = await responseJson(await api("/api/cases", { cookie: citizenCookie }));
    const persisted = reloaded.body.cases.find((item) => item.id === caseId);
    assert.ok(persisted);
    assert.equal(persisted.district, "Bengaluru Urban");
    assert.equal(persisted.events[0].eventType, "CASE_RECORDED");
    assert.ok(persisted.intelligence.patterns.some((pattern) => pattern.code === "PAYMENT_LINK_PHISHING"));
    assert.ok(persisted.intelligence.relationships.length >= 3);
    assert.ok(persisted.intelligence.relationships.every((relationship) => relationship.peerCaseId === null));
    assert.ok(persisted.intelligence.relationships.every((relationship) => relationship.peerTitle === null));
    assert.equal(persisted.intelligence.topology.activeCampaignCandidate, true);

    assert.equal((await api("/api/cases/action", {
      cookie: citizenCookie,
      json: {
        caseId,
        action: "CONFIRM_RELATIONSHIP",
        relationshipId: persisted.intelligence.relationships[0].id,
        note: "Citizens cannot confirm graph links.",
      },
    })).status, 403);

    assert.equal((await api("/api/cases", {
      method: "POST",
      cookie: citizenCookie,
      headers: { "Content-Type": "application/json" },
      body: "{",
    })).status, 400);
    assert.equal((await api("/api/cases", {
      cookie: evaluatorCookie,
      json: { synthetic: true },
    })).status, 403);

    const followUp = await responseJson(await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId, action: "FOLLOW_UP", note: "Synthetic transaction reference TEST-12000", languageCode: "unknown" },
    }));
    assert.equal(followUp.response.status, 200);
    assert.equal(followUp.body.citizenMessage.senderRole, "CITIZEN");
    assert.equal(followUp.body.assistantMessage.senderRole, "ASSISTANT");
    assert.equal(followUp.body.replyProvider, "INSTANT_FALLBACK");
    assert.match(followUp.body.assistantMessage.body, /added this transaction reference/i);

    const originalFetch = globalThis.fetch;
    let supportRequest;
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://api.openai.com/v1/responses") return originalFetch(input, init);
      supportRequest = JSON.parse(String(init?.body));
      return Response.json({ output_text: "I’ve added the corrected time to your CyberSaarthi case and trace. Send the bank name if it is still missing." });
    };
    try {
      const liveReply = await responseJson(await api("/api/cases/action", {
        cookie: citizenCookie,
        json: { caseId, action: "FOLLOW_UP", note: "The corrected transaction time is 2:35 PM.", languageCode: "unknown" },
      }));
      assert.equal(liveReply.response.status, 200);
      assert.equal(liveReply.body.replyProvider, "OPENAI");
      assert.equal(liveReply.body.assistantMessage.senderRole, "ASSISTANT");
      assert.match(liveReply.body.assistantMessage.body, /corrected time/i);
      assert.equal(supportRequest.model, "gpt-5.6-terra");
      assert.equal(supportRequest.store, false);
      assert.equal(supportRequest.max_output_tokens, 180);
      assert.match(supportRequest.instructions, /same language and script/i);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    }

    const withReplies = await responseJson(await api("/api/cases", { cookie: citizenCookie }));
    const supportedCase = withReplies.body.cases.find((item) => item.id === caseId);
    assert.equal(supportedCase.messages.at(-1).senderRole, "ASSISTANT");
    assert.ok(supportedCase.events.some((event) => event.eventType === "SUPPORT_ASSISTANT_REPLY"));
    assert.equal((await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId, action: "START_REVIEW", note: "" },
    })).status, 403);
    assert.equal((await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId: "CYS-DEMO-26082200000002", action: "FOLLOW_UP", note: "Not my case" },
    })).status, 404);
  });

  await t.test("evaluator review, support, resolution, and synthetic reset", async () => {
    const queue = await responseJson(await api("/api/cases", { cookie: evaluatorCookie }));
    assert.equal(queue.response.status, 200);
    assert.ok(queue.body.cases.length >= 5);
    const graphFixture = queue.body.cases.find((item) => item.id === "CYS-DEMO-26082400000004");
    assert.ok(graphFixture);
    assert.ok(graphFixture.intelligence.patterns.some((pattern) => pattern.code === "TASK_JOB_SCAM"));
    assert.ok(graphFixture.intelligence.topology.connectedCaseCount >= 2);
    assert.ok(graphFixture.intelligence.topology.crossDistrictCount >= 2);
    assert.ok(graphFixture.intelligence.relationships.every((relationship) => relationship.peerCaseId));
    assert.ok(graphFixture.intelligence.relationships.some((relationship) =>
      relationship.relationshipType === "SHARED_VERIFIED_IDENTIFIER"));

    const caseForGraphReview = queue.body.cases.find((item) => item.id === caseId);
    assert.ok(caseForGraphReview);
    const proposedRelationship = caseForGraphReview.intelligence.relationships.find((relationship) =>
      relationship.status === "PROPOSED");
    assert.ok(proposedRelationship);
    const reviewedRelationship = await responseJson(await api("/api/cases/action", {
      cookie: evaluatorCookie,
      json: {
        caseId,
        action: "CONFIRM_RELATIONSHIP",
        relationshipId: proposedRelationship.id,
        note: "The shared redacted UPI signal is sufficient for synthetic triage.",
      },
    }));
    assert.equal(reviewedRelationship.response.status, 200);
    assert.equal(reviewedRelationship.body.relationshipReviewed, true);

    assert.equal((await api("/api/cases/action", {
      evaluatorCookie,
      cookie: evaluatorCookie,
      json: { caseId, action: "INVALID", note: "" },
    })).status, 400);
    assert.equal((await api("/api/cases/action", {
      method: "POST",
      cookie: evaluatorCookie,
      headers: { "Content-Type": "application/json" },
      body: "{",
    })).status, 400);

    assert.equal((await api("/api/cases/action", {
      cookie: evaluatorCookie,
      json: { caseId, action: "START_REVIEW", note: "Reviewing the synthetic trace." },
    })).status, 200);
    assert.equal((await api("/api/cases/action", {
      cookie: evaluatorCookie,
      json: { caseId, action: "REQUEST_INFORMATION", note: "Please add the synthetic bank reference." },
    })).status, 200);
    assert.equal((await api("/api/cases/action", {
      cookie: evaluatorCookie,
      json: { caseId, action: "SUPPORT_REPLY", note: "The synthetic reference was received." },
    })).status, 200);
    assert.equal((await api("/api/cases/action", {
      cookie: evaluatorCookie,
      json: { caseId, action: "RESOLVE", note: "Synthetic workflow complete." },
    })).status, 200);
    assert.equal((await api("/api/cases/action", {
      cookie: evaluatorCookie,
      json: { caseId, action: "FOLLOW_UP", note: "Wrong role" },
    })).status, 403);

    const resolvedQueue = await responseJson(await api("/api/cases", { cookie: evaluatorCookie }));
    const resolved = resolvedQueue.body.cases.find((item) => item.id === caseId);
    assert.equal(resolved.status, "SYNTHETIC_RESOLVED");
    assert.equal(resolved.events[0].eventType, "SYNTHETIC_RESOLVED");
    assert.ok(resolved.messages.length >= 3);
    assert.ok(resolved.intelligence.relationships.some((relationship) =>
      relationship.id === proposedRelationship.id && relationship.status === "CONFIRMED"));
    assert.ok(resolved.events.some((event) => event.eventType === "RELATIONSHIP_CONFIRMED"));

    assert.equal((await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId, action: "DELETE_CLOSED", note: "DELETE_CLOSED_CASE" },
    })).status, 409, "an open or review-complete case cannot be deleted");

    const closed = await responseJson(await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId, action: "CLOSE_SETTLED", note: "The bank confirmed the synthetic settlement." },
    }));
    assert.equal(closed.response.status, 200);
    assert.equal(closed.body.closed, true);

    const closedCases = await responseJson(await api("/api/cases", { cookie: citizenCookie }));
    assert.equal(closedCases.body.cases.find((item) => item.id === caseId).status, "CLOSED_SETTLED");
    assert.equal((await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId, action: "FOLLOW_UP", note: "This must not reopen the case." },
    })).status, 409);
    assert.equal((await api("/api/cases/action", {
      cookie: evaluatorCookie,
      json: { caseId, action: "START_REVIEW", note: "This must remain locked." },
    })).status, 409);
    assert.equal((await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId, action: "DELETE_CLOSED", note: "wrong confirmation" },
    })).status, 400);

    const deleted = await responseJson(await api("/api/cases/action", {
      cookie: citizenCookie,
      json: { caseId, action: "DELETE_CLOSED", note: "DELETE_CLOSED_CASE" },
    }));
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.deleted, true);
    const afterDelete = await responseJson(await api("/api/cases", { cookie: citizenCookie }));
    assert.equal(afterDelete.body.cases.some((item) => item.id === caseId), false);
    const deletedIdentifiers = await db.prepare(
      "SELECT COUNT(*) AS total FROM case_graph_identifiers WHERE case_id = ?",
    ).bind(caseId).all();
    const deletedPatterns = await db.prepare(
      "SELECT COUNT(*) AS total FROM case_pattern_matches WHERE case_id = ?",
    ).bind(caseId).all();
    const deletedRelationships = await db.prepare(
      "SELECT COUNT(*) AS total FROM case_relationships WHERE source_case_id = ? OR target_case_id = ?",
    ).bind(caseId, caseId).all();
    const deletedTransactions = await db.prepare(
      "SELECT COUNT(*) AS total FROM case_transactions WHERE case_id = ?",
    ).bind(caseId).all();
    assert.equal(Number(deletedIdentifiers.results[0].total), 0);
    assert.equal(Number(deletedPatterns.results[0].total), 0);
    assert.equal(Number(deletedRelationships.results[0].total), 0);
    assert.equal(Number(deletedTransactions.results[0].total), 0);

    assert.equal((await api("/api/demo/reset", { method: "POST", cookie: citizenCookie })).status, 403);
    assert.equal((await api("/api/demo/reset", { method: "POST", cookie: evaluatorCookie })).status, 200);
    const resetQueue = await responseJson(await api("/api/cases", { cookie: evaluatorCookie }));
    assert.equal(resetQueue.body.cases.length, 6);
    assert.ok(resetQueue.body.cases.every((item) => /^\d{14}$/.test(item.demoReference)));
    assert.deepEqual(resetQueue.body.cases.map((item) => item.id).sort(), [
      "CYS-DEMO-26082100000003",
      "CYS-DEMO-26082200000001",
      "CYS-DEMO-26082200000002",
      "CYS-DEMO-26082400000004",
      "CYS-DEMO-26082400000005",
      "CYS-DEMO-26082400000006",
    ]);
  });
});
