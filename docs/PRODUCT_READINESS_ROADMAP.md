# CyberSaarthi product-readiness roadmap

This roadmap separates work that can be completed in the current repository from
decisions and external controls that require product-owner, security, privacy,
or deployment access. “External verification” means testing a deployed staging
environment with synthetic data; it does not mean filing real complaints or
contacting authorities during QA.

## Release boundary

The current product is a synthetic case-preparation prototype. It must remain
explicitly disconnected from official filing, police, bank, and payment systems
until a separately authorized integration is designed and approved. Do not use
real citizen information in the current demo deployment. Production identity,
retention, consent, residency, and incident-response policies are prerequisites
to accepting genuine case data.

## Phases and exit gates

| Phase | Work | Exit gate | Current status |
|---|---|---|---|
| 0. Product and data boundary | Select launch audience and use cases; map audio, image, narrative, case, and provider data flows; approve retention, consent, residency, support, and integration boundaries. | Written scope, data classification, threat model, and privacy approval. | Open: owner decisions and counsel/security review required. |
| 1. Identity and abuse controls | Replace fixed demo accounts with managed identity for any real-data environment; modern password/session lifecycle; CSRF, rate limits, upload quotas, and case-level authorization review. | AuthZ matrix and abuse tests pass; no critical/high security findings. | Open: current fixed credentials and one-click judge session are demo-only. |
| 2. Intake and providers | Isolate provider adapters; explicit per-action consent; timeout, failure, and cost handling; language and extraction evaluation; human verification of fields. | Language/field benchmark thresholds and provider failure tests pass. | Partial: adapters, strict schemas, and synthetic fallbacks exist; systematic quality benchmarks are absent. |
| 3. Persistence and lifecycle | Verify write atomicity, retry/deferred-work observability, retention/deletion, backups/restores, migration rollback, and fixture/production isolation. | Clean and upgrade migration plus restore exercise passes; lifecycle audit complete. | Partial: D1 schema, migrations, duplicate index, case events, and deletion flows exist; operational drills absent. |
| 4. UX and accessibility | Test citizen/evaluator journeys on mobile/desktop, keyboard and screen readers, provider outages, session expiry, and recovery states. | No blocking usability/accessibility issue in target-user sessions; WCAG review signed off. | Partial: responsive styles and rendered-source tests exist; external user research and full assistive-tech audit absent. |
| 5. Continuous verification | CI runs lint, types, schema, pure unit suites, API/D1 integration, rendered output, and browser E2E; provider contract tests use mocks/sandboxes. | Required checks gate every PR; failure artifacts are available. | Partial: CI now runs lint and existing API/render suites; local lint, typecheck, schema, build, and all 19 current tests passed. Browser E2E and provider contract suites remain open. |
| 6. Staging and release | Deploy staging with production-like bindings; synthetic end-to-end browser tests; provider sandbox checks; alerts, rollback, secret rotation, backup restore, pilot controls. | Release checklist signed; rollback verified; no unresolved high-severity defects. | Blocked by missing deployment credentials, configured staging, and operational approvals in this workspace. |

## Required use-case acceptance checks

1. **Typed financial incident:** required/optional fields, citizen edits, visible
   unknowns, duplicate conflict, persistence, and timeline reload.
2. **Voice/code-mixed intake:** consent, recording validation, transcript
   correction, translation fallback, timeout, provider outage, and preservation
   of the original narration.
3. **Evidence image:** content signature and size rejection, extraction
   provenance, untrusted image instructions, timestamp timezone/rollover/future
   handling, confirmation, and raw-upload non-persistence.
4. **Duplicate/race:** same-owner identical submission conflicts under concurrent
   requests; distinct cases and different owners follow the documented policy.
5. **Citizen support/lifecycle:** follow-up ownership, safe assistant fallback,
   event persistence, closed-case lock, deletion authorization, and complete
   related-row cleanup.
6. **Evaluator review:** role authorization, proposed-link confirmation/rejection,
   audit event, and citizen redaction of peer data.
7. **Deployment operations:** clean migration, upgrade, rollback/recovery,
   backup restore, secret rotation, alert delivery, and provider health visibility.

## External verification protocol

Run the full acceptance suite against a staging URL and staging D1 database using
synthetic fixtures only. Capture browser traces/screenshots, API status and
correlation IDs, migration state, provider sandbox results, and accessibility
findings. Verify both desktop and compact mobile sizes. Test auth expiry,
cross-account access, slow/offline network, provider timeout, invalid uploads,
and retry behavior. Do not enable production data collection until privacy,
security, operations, and product owners approve the release boundary.

## GitHub Actions deployment setup

Vercel's native Git integration deploys repository pushes. GitHub Actions runs
quality checks only; a duplicate CLI deployment workflow was removed because it
required unconfigured Vercel credentials and the project already has Git
integration. Configure Vercel Deployment Checks or GitHub branch protection so
required CI checks pass before production promotion. Vercel Cron calls
`/api/maintenance/retention` daily; configure `CRON_SECRET` in Vercel production
environment variables. Verify the deployment URL and critical flows after each
deployment. A protected deployment may require an authenticated share URL for
external checks.

## Implementation record

- CI now executes lint, the existing API/D1 end-to-end suite, and rendered
  application checks in addition to the existing type, schema, and unit jobs.
- Fixed demo credentials fail closed in production unless `DEMO_ACCESS_ENABLED`
  is explicitly enabled for a synthetic demonstration; existing sessions are
  rejected when disabled.
- External AI providers require per-action consent. The prototype remains
  synthetic-only; case deletion and 30-day cleanup apply to user-created records.
- Local verification on 2026-11-03: `npm ci` completed; ESLint passed via the
  installed CLI; TypeScript `--noEmit` passed; migration/schema integrity passed
  (8 tables, 4 migrations); the production vinext build passed; all 19 tests
  passed, including API/D1 workflows and rendered output. `npm run lint` itself
  could not launch because this Windows workspace has no `/bin/bash`; its
  underlying ESLint command passed. The build was run directly through vinext.
- No staging credentials, deployment binding, public staging URL, or provider
  sandbox credentials were present, so deployment and external environment
  verification remain open.
- Fictional banking fixture cleanup uses NavaJyoti Bank and is covered by a
  regression test. Tests and deployment still need to run in the current
  environment before that change is considered verified.
