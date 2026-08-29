# CyberSaarthi Hackathon QA and Compliance Audit

Audit date: 27 August 2026  
Scope: public Build What Moves India prototype  
Boundary: independent, synthetic, pre-filing case-preparation sandbox

## Executive summary

CyberSaarthi now keeps citizens inside one coherent prototype journey. The UI contains no direct NCRP, police, government, hotline, or hackathon-site link; urgent help is represented by an internal preparation simulation that explicitly confirms that no call or report was sent. The frontend consumes authenticated session and case-store data for identities, references, statuses, messages, graph signals, and timelines instead of inserting display fallbacks.

The highest-risk product paths—voice capture, evidence extraction, citizen review, exact duplicate rejection, case creation, support, evaluator review, settlement closure, deletion, and reset—have concrete state transitions. AI output stays advisory and cannot file, merge, blacklist, infer jurisdiction, or establish a suspect.

## Compliance decisions

| Requirement | Implemented control | Verification target |
|---|---|---|
| Government-link isolation | No government or police `href`, `tel:` action, or external competition link in rendered source | Static source regression test |
| Emergency visibility | Internal 1930-preparation and immediate-danger simulations remain available without leaving the app | Toggle opens a visible, dismissible state |
| Independent positioning | Persistent synthetic banner and action-level “nothing sent” disclosure | Login, citizen, and evaluator views |
| Zero-friction reporting | One-click judge session, voice guide, dictation, typing, evidence upload, and reviewed save | API and UI workflow tests |
| Community defence | Explainable pattern recognition and redacted relationship topology | Evaluator review only; citizen peer details hidden |
| No automated accusation | AI and graph scores remain proposed until human review | Role/API regression tests |

The Quick Exit control is the only deliberate browser navigation in the product shell. It clears in-memory/browser demo state, logs out, and opens a neutral page; it is not a filing or authority integration.

## Base PRD versus post-base implementation

| Capability | Documented base | Current implementation |
|---|---|---|
| Incident intake | Free-form account | Four-turn voice guide, direct dictation into narration, typed fallback, automatic language handling |
| Urgent response | Static 1930 guidance | Recency selector plus citizen-confirmed OCR timestamp assessment and an internal urgent-action simulation |
| Evidence | Upload concept | PNG/JPEG/WebP magic-byte checks, SHA-256 checksum, strict structured extraction, citizen verification |
| Classification | Top-level route proposal | Deterministic priority route plus strict model contract; human confirmation remains mandatory |
| Submission quality | General review | Source, district, route, narration, identifier, evidence, and human-review readiness matrix |
| Duplicate control | Not specified | Owner-scoped SHA-256 fingerprint, unique D1 index, race-safe HTTP 409 conflict |
| Case tracking | Saved record | 14-digit prototype reference, persisted events/messages, role-checked actions, printable reviewed draft |
| Follow-up | Status display | Optimistic chat, bounded case-aware model reply, deterministic low-latency fallback, persisted trace |
| Lifecycle | Open/resolved | Citizen settlement closure, read-only lock, owner-only closed-case deletion, evaluator reset |
| Cross-case intelligence | Not specified | Explainable scam-pattern signals, hashed technical identifiers, relationship topology, reviewer confirmation |
| Visual system | Functional dashboard | Supplied CyberSaarthi mark/favicon, Google-style geometric sans stack, warm ivory/orange tokens, minimalist mic/arrow actions |

## Dynamic data and fixture architecture

- The signed session response supplies the displayed account name, role, and email.
- D1 supplies case titles, reporter names, statuses, districts, timestamps, facts, messages, events, and graph signals.
- New case references are cryptographically generated as `YYMMDD` plus eight random digits.
- Six synthetic seed records use valid 14-digit prototype references, realistic Indian bank names, 12-digit synthetic UTRs, cross-district task-scam relationships, and clearly synthetic people/channels.
- The bank input uses a display catalog and permits exact manual entry. CyberSaarthi never infers a bank from a UTR prefix.
- Legacy six-character fixture IDs are migrated in place to the 14-digit format, including event, message, identifier, pattern, and relationship rows.
- Unknown values render as unknown. They are not silently repaired by a UI fallback.

## Interaction completion matrix

| Surface | Action | State change / completion |
|---|---|---|
| Login | Judge Test Mode arrow | Signed citizen session and case load |
| Login / intake | Safety arrow | Opens or closes internal preparation steps |
| Intake | Recency choice | Updates source-labelled urgency state |
| Evidence | Upload | Analysis state → proposed findings or visible error |
| Evidence | Verify finding | Adds/removes citizen-verified field and may propose recency |
| Voice guide | Start / reply / stop | Advances one of four persisted client turns and updates narration |
| Dictation | Start / stop | Appends transcript inside `Your narration` |
| Review | Prepare arrow | Produces strict proposed facts/unknowns |
| Review | Save arrow | Creates unique 14-digit case or opens duplicate conflict guidance |
| My cases | Case selection / tabs | Changes selected record or detail panel |
| Draft | Copy / print | Clipboard or print state with visible confirmation |
| Support | Send arrow | Optimistic message → assistant reply → persisted trace |
| Citizen lifecycle | Close / delete | Read-only closure, then owner-authorised permanent removal |
| Evaluator | Review actions | Status/event/relationship update with role enforcement |
| Evaluator | Reset | Rebuilds all six synthetic fixtures |
| Quick Exit | Button / shortcut | Purges browser state, signs out, and navigates to neutral content |

## Responsive and mechanical acceptance matrix

| Viewport class | Widths | Required behavior |
|---|---:|---|
| Compact mobile | 390, 412 | No page overflow; actions stack; 44 px controls; detail tabs and case rails snap horizontally with visible scrollbar |
| Large mobile / tablet | 620, 768 | Single-column intake; sticky wrapped navigation; evidence panel follows narration |
| Small desktop | 1024 | Case and support panes collapse without truncated titles or stretched status pills |
| Desktop | 1366, 1440 | Stable container width, aligned two-column intake, full evaluator topology, no dead whitespace caused by fixed heights |

Mechanical guards:

- All buttons, tab controls, summaries, mic indicators, and arrow actions meet or exceed 44×44 px.
- Focus uses a high-contrast two-layer ring and does not depend on color alone.
- Status pills use `width: max-content` and `align-self: flex-start`.
- Tabs, navigation, case lists, and support case pickers use snapping, stable scrollbars, and contained horizontal overscroll.
- Spacing, control/card/panel radii, body/meta/label sizes, and major breakpoints are defined as shared tokens.
- Long IDs and identifiers use wrapping/tabular numerals; cards use `min-width: 0` to prevent grid blowouts.

## Rendered QA findings resolved in this release

| Finding | Root cause | Fix |
|---|---|---|
| Mic and arrow stacked vertically inside the login safety module | A higher-specificity `.urgent-note span` rule overrode the flex/grid display of the new controls | Added component-scoped display and color rules; kept each hit target at least 44 px |
| Expanded safety guidance crossed the split-layout boundary | The action group retained a 300 px minimum beside existing explanatory copy | Stacked the urgent module, removed the fixed minimum, constrained the panel to 100%, and enabled safe wrapping |
| Skip link and hackathon tag missed AA contrast | White/orange and dark-orange/peach combinations measured below 4.5:1 | Switched to ink-on-orange and a darker label token; rendered scan now reports no visible-text failures |
| Static judge identity and credentials appeared in the frontend | The login component initialized from a client constant | Removed the client account object, left manual fields empty, and use the server session response after authentication |
| Legacy fixtures displayed nonconforming case IDs | Earlier seed IDs used `CYS-DEMO-2026-00N` | Added an exact synthetic-fixture migration covering cases, events, messages, graph identifiers, patterns, and relationships |

Desktop rendered verification at 1363×936 found no horizontal page overflow, no visible interactive target below 44×44 px, no government/hotline outbound anchor, and no application-origin console warning or error. Compact viewport behavior is protected by the breakpoint and rendered-source regression gates listed above; the cloud visual surface exposes one desktop viewport only.

## Security and accuracy boundaries

- No call, filing, bank freeze, KYC, OTP, FIR, government acknowledgement, or police workflow is performed.
- Provider APIs are server-side adapters for speech, translation, TTS, evidence extraction, and bounded support replies. Provider failures preserve a typed/synthetic path.
- Scraped, crawled, repository, and threat-feed inputs cannot create citizen cases.
- Similarity and topology never auto-merge cases or identify a suspect.
- Transaction references are format-checked and duplicate-checked, not bank-verified.
- Synthetic screenshots only; raw uploads are analysed in request scope and are not persisted by the case store.

## Release gates

1. ESLint passes.
2. Production build and migration execution pass.
3. All API, voice-recording, evidence-recency, and rendered-source tests pass.
4. No source-secret pattern or prohibited UI link is detected.
5. Public deployment reaches a terminal success state.
6. Direct production URL verification confirms the deployed version and public audience are unchanged.
