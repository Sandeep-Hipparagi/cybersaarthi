# CyberSaarthi

CyberSaarthi is a self-contained Build What Moves India prototype for preparing,
reviewing, recording, and following up on synthetic cybercrime complaints. It
does not connect to NCRP, police, banks, suspect repositories, or any government
system.

## Working journeys

1. **AI Voice — Conversational Voice Agent**
   - Four calm, one-question-at-a-time turns with automatic language detection.
   - Natural Indian-language prompt playback through server-side Bulbul TTS,
     with explicit browser-device speech as an accessible fallback.
   - Stopping the microphone automatically sends the short clip for Saaras
     speech-to-text and puts the result directly into the conversation.
   - The detected speech language is reused for prompt translation and playback;
     no language picker is required.
   - The fourth question captures the mandatory incident district; the case
     cannot be saved without it.
   - A complete working voice example remains available for judge evaluation.
   - The selected Sarvam Voice Agent profile and version are recorded as
     configuration metadata. Because Sarvam's documented deployment resource is
     for phone-number inbounds and this project is web-only, the browser
     conversation intentionally runs on CyberSaarthi's mocked backend rather
     than claiming a live Voice Agents runtime session.

2. **Type the Narration + ASR Assistant**
   - Type naturally, dictate with auto-detected speech-to-text, or load a
     working multilingual fixture.
   - The original narration is preserved; an English working copy appears only
     when speech translation produces a different transcript.

3. **Vision Evidence Locker**
   - Drag-and-drop synthetic WhatsApp, bank-SMS, or UPI screenshots.
   - A deterministic judge fixture or pinned GPT-4o image adapter proposes the
     suspect phone number, UPI ID, timestamp, and UTR/transaction reference.
   - Proposals are source-linked and excluded from the saved record until the
     citizen explicitly verifies them. Raw images are never persisted.

4. **Support & follow-ups**
   - Citizen messages appear optimistically in the thread without waiting for a
     provider round trip.
   - A concise, case-aware Responses API assistant replies in the citizen's
     language. A deterministic instant reply keeps the public demo functional
     when the model provider is unavailable.
   - Both messages are persisted and added to the case trace.

5. **Citizen-controlled lifecycle**
   - A financial case can be closed only when the signed-in citizen confirms
     that the reported funds are settled.
   - Closing locks support and evaluator actions. It changes only the local
     prototype record and never represents withdrawal of an official complaint.
   - Permanent deletion is available to the owning citizen only after closure;
     it removes the case, trace events, and support messages together.

Both intake journeys converge on strict structured preparation, a reviewable
NCRP top-level route proposal, human confirmation, and a synthetic D1 record.

## Rapid Case Integrity Gate

The unified integrity module keeps the urgent path fast without allowing an AI
score to become a legal decision:

1. **Source gate** — only citizen-entered text, consented speech, guided voice,
   and citizen-confirmed evidence can create a case. Scraped pages, crawled
   sources, threat feeds, and repository matches remain leads only.
2. **Exact duplicate gate** — a SHA-256 fingerprint is computed from the owning
   account and confirmed transaction references. If no reference exists, the
   reviewed route, district, amount, and normalized narration form the exact
   signature. A D1 unique index closes concurrent-save races and returns the
   existing case reference with HTTP 409.
3. **Routing packet** — the citizen confirms the top-level route and incident
   district. The app never guesses a police station or makes a legal finding.
4. **Submission readiness** — route, 200-character incident account, exact
   date/time, district, financial institution, 12-digit transaction reference,
   amount, and evidence fingerprint are shown with explicit owners and gaps.
   Identity upload and live mobile OTP are visible prototype boundaries.
5. **Human decision boundary** — extraction and classification are proposals.
   Probabilistic similarity can never auto-reject, merge, blacklist, or establish
   a suspect.

The synchronous preflight uses normalization, SHA-256, indexed equality, and
role checks only. Model extraction and support generation are outside that
critical path. The API reports measured `preflightMs`; the automated workflow
gate requires it to remain below one second in the judge fixture.

The readiness map mirrors common pre-filing field categories but is not a
replacement for any official form. For recent financial fraud, the interface
keeps an internal 1930-preparation simulation visible while the case packet is
prepared. No government or police link is rendered by the application.

## Demo access

- Judge Test Mode / citizen: `citizen@test.com` / `test2026`

The landing page exposes one-click Judge Test Mode without printing a name,
email, password, or case identifier into the UI. Manual credentials remain
available for deterministic QA. The mock authentication route uses a signed
HttpOnly session cookie and enforces citizen permissions on server routes; no
OTP or KYC service is called.

## Provider configuration

- `SARVAM_API_KEY`: standard Sarvam Model APIs key, server-side secret
- `SARVAM_ASR_MODEL`: defaults to `saaras:v3`
- `SARVAM_TTS_MODEL`: defaults to `bulbul:v3`
- `SARVAM_TTS_SPEAKER`: defaults to `kavya`
- `SARVAM_TRANSLATION_MODEL`: defaults to `sarvam-translate:v1`
- `SARVAM_VOICE_AGENT_ID`: selected Voice Agents profile identifier
- `SARVAM_VOICE_AGENT_VERSION`: committed profile version
- `OPENAI_API_KEY`: optional server-side key for the OpenAI extraction mode
- `OPENAI_MODEL`: optional Responses API model override
- `OPENAI_SUPPORT_MODEL`: defaults to `gpt-5.6-terra`
- `OPENAI_VISION_MODEL`: defaults to pinned `gpt-4o-2024-08-06`
- `AUTH_SESSION_SECRET`: at least 32 characters

The OpenAI adapter sends a JSON Schema through Responses API Structured Outputs
with `strict: true`. Every object requires every declared property, unknown
scalars use nullable unions, and every object sets `additionalProperties: false`.

## Architecture

- Vinext/React frontend and server routes
- Cloudflare D1 for cases, event traces, and support messages
- Signed, HttpOnly mock sessions with server-side role checks
- Sarvam TTS and ASR behind server-only integration boundaries
- Deterministic synthetic preparation by default, with an optional OpenAI
  Responses API Structured Outputs adapter
- Strict GPT-4o Vision evidence adapter plus deterministic contract-compatible
  mock response
- No R2 upload bucket because the current prototype does not persist documents

## Local commands

Requires Node.js `>=22.13.0` on Linux.

- `npm run dev` — start local Vite/Vinext development
- `npm run lint` — run static checks
- `npm test` — build and run the automated test suite
- `npm run db:generate` — generate a Drizzle migration after schema changes

Runtime secrets belong in environment variables and must never be committed.
