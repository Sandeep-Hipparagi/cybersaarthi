"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { CyberSaarthiResponse } from "../lib/cybersaarthi-contract";
import type { EvidenceAnalysisResponse } from "../lib/evidence-contract";
import { buildSubmissionReadiness, caseSourceLabel } from "../lib/case-integrity";
import { emergencyAdvisoryFor } from "../lib/emergency-triage";
import { assessEvidenceRecency, recencyAgeLabel } from "../lib/evidence-recency";
import {
  digitsOnly,
  EMPTY_FINANCIAL_DRAFT,
  financialDraftFacts,
  formatInrInput,
  formatUtr,
  INDIAN_BANK_CATALOG,
  mergePreparedFinancialDraft,
  validateFinancialDraft,
  type FinancialDraft,
  type FinancialDraftField,
} from "../lib/financial-validation";
import {
  deterministicFinancialFields,
  type NarrationFieldExtraction,
} from "../lib/narration-field-extraction";
import { htmlLanguageCode } from "../lib/language-support";
import {
  appendNarration,
  audioFilename,
  chooseRecorderMimeType,
  hasUsableRecording,
  MIN_RECORDING_MS,
  microphoneErrorMessage,
  type VoiceCaptureTarget,
} from "../lib/voice-recording";

type Role = "CITIZEN" | "EVALUATOR";
type Session = { email: string; name: string; role: Role };
type AsrStatus = {
  configured: boolean;
  model: string;
  syntheticFixtureAvailable: boolean;
  autoDetect: boolean;
  supportedLanguageCount: number;
  maxRecordingSeconds: number;
};
type TtsStatus = {
  configured: boolean;
  model: string;
  autoVoiceLanguage: boolean;
  supportedLanguageCount: number;
  maxCharacters: number;
};
type CaseEvent = {
  id: string;
  eventType: string;
  title: string;
  description: string;
  actorRole: string;
  actorLabel: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
type SupportMessage = {
  id: string;
  senderEmail: string;
  senderRole: string;
  languageCode: string;
  body: string;
  synthetic: boolean;
  createdAt: string;
};
type PatternSignal = {
  id: string;
  code: string;
  label: string;
  confidence: number;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  evidence: string[];
  explanation: string;
  engineVersion: number;
  createdAt: string;
};
type RelationshipSignal = {
  id: string;
  relationshipType: "SHARED_VERIFIED_IDENTIFIER" | "SHARED_TECHNICAL_IDENTIFIER" | "SAME_PATTERN";
  confidence: number;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  deterministic: boolean;
  explanation: string;
  sharedSignals: string[];
  peerCaseId: string | null;
  peerReference: string | null;
  peerTitle: string | null;
  peerDistrict: string | null;
  crossDistrict: boolean;
  createdAt: string;
};
type CaseIntelligence = {
  engineVersion: number;
  patterns: PatternSignal[];
  relationships: RelationshipSignal[];
  topology: {
    connectedCaseCount: number;
    crossDistrictCount: number;
    proposedCount: number;
    confirmedCount: number;
    rejectedCount: number;
    sharedIdentifierCount: number;
    componentSize: number;
    activeCampaignCandidate: boolean;
  };
  boundary: string;
};
type CaseRecord = {
  id: string;
  demoReference: string | null;
  ownerEmail: string;
  reporterName: string;
  title: string;
  narrativeNative: string;
  narrativeEnglish: string;
  languageCode: string;
  provider: string;
  model: string | null;
  route: string;
  district: string | null;
  lossAmount: number | null;
  status: string;
  urgency: string;
  facts: Array<Record<string, unknown>>;
  unknowns: Array<Record<string, unknown>>;
  assignedTo: string | null;
  synthetic: boolean;
  createdAt: string;
  updatedAt: string;
  events: CaseEvent[];
  messages: SupportMessage[];
  intelligence: CaseIntelligence;
};
type IntakeSource = { provider: string; model: string | null; synthetic: boolean };
type CitizenTab = "NEW" | "CASES" | "SUPPORT";
type IntakeMethod = "VOICE_AGENT" | "NARRATION_ASR";
type IncidentRecency = "UNKNOWN" | "UNDER_2H" | "OVER_2H";
type RecencySource = "UNCONFIRMED" | "CITIZEN" | "VERIFIED_EVIDENCE";
type AgentMessage = { id: string; role: "AGENT" | "CITIZEN"; native: string; english: string };
type CaseActionResponse = {
  updated: boolean;
  synthetic: boolean;
  closed?: boolean;
  deleted?: boolean;
  citizenMessage?: SupportMessage;
  assistantMessage?: SupportMessage;
  replyProvider?: string;
  replyModel?: string | null;
  relationshipReviewed?: boolean;
};
type CaseActionHandler = (
  action: string,
  note: string,
  relationshipId?: string,
) => Promise<CaseActionResponse>;
type VoiceAgentReply = {
  selectedAgentId: string;
  selectedAgentVersion: number;
  provider: string;
  liveRuntimeConnected: boolean;
  browserTransport: string;
  syntheticSessionAvailable: boolean;
  languageCode: string;
  step: number;
  complete: boolean;
  promptNative: string;
  promptEnglish: string;
  answerNative: string | null;
  answerEnglish: string | null;
  answerProvider: string | null;
  answerModel: string | null;
  answerCapture: "NARRATIVE" | "FINANCIAL" | "EVIDENCE" | "DISTRICT" | null;
  turnCount: number;
  languageAutoDetect?: boolean;
  synthetic: boolean;
};

type EvidenceStatus = {
  configured: boolean;
  provider: string;
  model: string;
  deterministicMockAvailable: boolean;
  syntheticOnly: boolean;
};

type EvidenceUpload = {
  id: string;
  file: File;
  previewUrl: string;
  state: "ANALYSING" | "DONE" | "ERROR";
  result: EvidenceAnalysisResponse | null;
  error: string | null;
};

const ROUTE_LABELS: Record<string, string> = {
  FINANCIAL_FRAUD: "Financial fraud",
  WOMEN_CHILDREN_RELATED_CRIME: "Women / children-related crime",
  OTHER_CYBER_CRIME: "Other cyber crime",
  UNKNOWN: "Unknown — needs review",
};

const TECHNICAL_EVIDENCE_LABELS: Record<string, string> = {
  "suspect.phone": "Suspect phone number",
  "suspect.upi_id": "Suspect UPI ID",
  "transaction.occurred_at": "Transaction timestamp",
  "transaction.reference": "UTR / transaction reference",
};

const STATUS_LABELS: Record<string, string> = {
  SYNTHETIC_RECORDED: "Saved",
  REVIEW_IN_PROGRESS: "Review in progress",
  INFORMATION_REQUESTED: "Information requested",
  FOLLOW_UP_RECEIVED: "Conversation updated",
  SYNTHETIC_RESOLVED: "Review complete",
  CLOSED_SETTLED: "Closed · funds settled",
};

const RELATIONSHIP_LABELS: Record<RelationshipSignal["relationshipType"], string> = {
  SHARED_VERIFIED_IDENTIFIER: "Shared verified field",
  SHARED_TECHNICAL_IDENTIFIER: "Shared technical field",
  SAME_PATTERN: "Same scam playbook",
};

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}% signal confidence`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

let clientMessageCounter = 0;
function clientMessageId(): string {
  clientMessageCounter += 1;
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `voice-message-${Date.now()}-${clientMessageCounter}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function money(value: number | null): string {
  if (value === null) return "Not reported";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function supportSenderLabel(message: SupportMessage, citizenLabel = "You"): string {
  if (message.senderRole === "ASSISTANT") return "CyberSaarthi";
  if (message.senderRole === "EVALUATOR") return "Review desk";
  return citizenLabel;
}

function buildPreparationDraft(item: CaseRecord): string {
  const factLines = item.facts.map((fact) =>
    `- ${String(fact.label || fact.fieldId)}: ${String(fact.value)} (source: ${String(fact.source || "reviewed input")})`,
  );
  const unknownLines = item.unknowns.map((unknown) =>
    `- ${String(unknown.label || unknown.fieldId)}: unknown — ${String(unknown.reason || "not supplied")}`,
  );

  return [
    "CYBERSAARTHI — INDEPENDENT PRE-FILING PREPARATION DRAFT",
    "This is not an NCRP acknowledgement, FIR, legal opinion, or proof of official submission.",
    "",
    `Prototype reference: ${item.demoReference || item.id}`,
    `Citizen-reviewed title: ${item.title}`,
    `Proposed top-level route: ${ROUTE_LABELS[item.route] || item.route}`,
    `Incident district: ${item.district || "Unknown"}`,
    `Reported loss: ${money(item.lossAmount)}`,
    "",
    "CITIZEN ACCOUNT",
    item.narrativeNative,
    ...(item.narrativeEnglish.trim() !== item.narrativeNative.trim()
      ? ["", "ENGLISH WORKING COPY", item.narrativeEnglish]
      : []),
    "",
    "CITIZEN-REVIEWED FACTS",
    ...(factLines.length > 0 ? factLines : ["- No facts accepted yet."]),
    "",
    "VISIBLE UNKNOWNS",
    ...(unknownLines.length > 0 ? unknownLines : ["- None recorded."]),
    "",
    "NEXT STEP",
    "Review every line and keep this preparation draft for your own next step. This prototype does not submit it externally.",
  ].join("\n");
}

function Brand() {
  return (
    <div className="brand-lockup" aria-label="CyberSaarthi">
      {/* The project mark is supplied by the CyberSaarthi designer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/cybersaarthi-mark.png" alt="" aria-hidden="true" />
      <span><strong>CyberSaarthi</strong><small>Independent prototype</small></span>
    </div>
  );
}

type SafetySimulationMode = "FINANCIAL" | "DANGER";

const SAFETY_SIMULATIONS: Record<SafetySimulationMode, {
  label: string;
  helper: string;
  title: string;
  steps: string[];
}> = {
  FINANCIAL: {
    label: "Open urgent money-safety steps",
    helper: "Internal 1930 preparation simulation",
    title: "Prepare for urgent financial reporting",
    steps: [
      "Keep the exact transaction time, amount, bank name, and reference ready.",
      "Contact your bank through a channel you independently verify outside this prototype.",
      "Preserve transaction messages and suspect chats while you continue the case here.",
    ],
  },
  DANGER: {
    label: "Open immediate-danger steps",
    helper: "Internal safety simulation",
    title: "Move toward immediate safety",
    steps: [
      "Move to a safe place and ask a trusted person to stay with you if possible.",
      "Use local emergency services yourself when it is safe to do so.",
      "Do not confront a suspect or share another OTP, PIN, password, or payment.",
    ],
  },
};

function SafetySimulation({ mode, compact = false }: { mode: SafetySimulationMode; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const content = SAFETY_SIMULATIONS[mode];
  return (
    <div className={`safety-simulation ${open ? "open" : ""}`}>
      <button
        type="button"
        className={`button secondary safety-simulation-button ${compact ? "compact" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{open ? "Close safety steps" : content.label}</span>
        <span aria-hidden="true">{open ? "×" : "→"}</span>
      </button>
      <small className="safety-simulation-helper">{content.helper}</small>
      {open && (
        <section className="safety-simulation-panel" role="region" aria-label={content.title}>
          <div><strong>{content.title}</strong><span>Simulation only · no call or report was sent</span></div>
          <ol>{content.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
      )}
    </div>
  );
}

function SyntheticBanner() {
  return (
    <div className="synthetic-banner" role="note">
      <span className="pulse" aria-hidden="true" />
      <strong>Independent case-preparation demo.</strong>
      <span>Nothing here is sent to NCRP, police, banks, or any government system.</span>
    </div>
  );
}

function QuickExitButton({ onPurge }: { onPurge: () => void }) {
  const lastEscape = useRef(0);

  const quickExit = useCallback(() => {
    onPurge();
    try {
      window.sessionStorage.clear();
      window.localStorage.clear();
    } catch {
      // Navigation still removes in-memory form state when storage is unavailable.
    }
    void fetch("/api/auth/logout", { method: "POST", keepalive: true }).catch(() => undefined);
    window.location.replace("https://www.google.com");
  }, [onPurge]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        quickExit();
        return;
      }
      if (event.key !== "Escape") return;
      const now = Date.now();
      if (now - lastEscape.current < 700) quickExit();
      lastEscape.current = now;
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [quickExit]);

  return (
    <button
      type="button"
      className="quick-exit"
      onClick={quickExit}
      aria-label="Quick exit: clear this browser session and open Google"
      title="Quick exit · Alt+Q or press Escape twice"
    >
      <span aria-hidden="true">↗</span>
      Quick exit
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-${status.toLowerCase()}`}>{STATUS_LABELS[status] || status}</span>;
}

function LoginScreen({
  onLogin,
  onJudgeLogin,
  busy,
  error,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onJudgeLogin: () => Promise<void>;
  busy: boolean;
  error: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    void onLogin(email, password);
  }

  return (
    <main className="login-shell" id="main-content">
      <section className="login-context">
        <div className="evidence-constellation" aria-hidden="true">
          <span className="evidence-halo" />
          <i className="evidence-link link-a" />
          <i className="evidence-link link-b" />
          <i className="evidence-link link-c" />
          <i className="evidence-link link-d" />
          <i className="evidence-link link-e" />
          <b className="evidence-node node-a" />
          <b className="evidence-node node-b" />
          <b className="evidence-node node-c" />
          <b className="evidence-node node-d" />
          <b className="evidence-node node-e" />
          <b className="evidence-node node-f" />
        </div>
        <div className="competition-tag">BUILD WHAT MOVES INDIA · WORKING PROTOTYPE</div>
        <h1>A calm path from first words to a traceable case.</h1>
        <p className="login-lead">
          Speak in the language that feels natural or type in your own words. CyberSaarthi detects
          speech automatically, prepares the details for review, and keeps a traceable demo case.
        </p>
        <div className="boundary-grid">
          <div><strong>Independent</strong><span>No government integration or endorsement</span></div>
          <div><strong>Review first</strong><span>Unknown details stay visibly unknown</span></div>
          <div><strong>Traceable</strong><span>Every action appears in the case timeline</span></div>
        </div>
        <div className="urgent-note">
          <div>
            <span>Recent financial loss?</span>
            <p>Open the internal safety steps while you continue preparing the synthetic case.</p>
          </div>
          <div className="urgent-note-actions">
            <SafetySimulation mode="FINANCIAL" compact />
            <SafetySimulation mode="DANGER" compact />
          </div>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="signin-title">
        <Brand />
        <SyntheticBanner />
        <div className="panel-heading">
          <span className="step-label">DEMO ACCESS</span>
          <h2 id="signin-title">Judge’s Test Mode</h2>
          <p>One click enters the complete citizen journey. No OTP or registration.</p>
        </div>

        <article className="credential-card judge-card">
          <div className="role-icon role-citizen" aria-hidden="true">J</div>
          <div><h3>Complete citizen journey</h3><p>The server creates the signed synthetic session; no identity, name, or case reference is injected by the interface.</p></div>
          <button type="button" className="button primary full" disabled={busy} aria-busy={busy} onClick={() => void onJudgeLogin()}>
            {busy ? "Opening Test Mode…" : "Enter Judge’s Test Mode"}
          </button>
        </article>

        <section className="manual-login" aria-labelledby="manual-login-title">
          <h3 id="manual-login-title">Enter credentials manually</h3>
          <form onSubmit={submit}>
            <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="Demo account email" /></label>
            <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Demo password" /></label>
            <button className="button primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </section>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="login-footnote">Secure demo access · no OTP · resettable synthetic data</p>
      </section>
    </main>
  );
}

function AppHeader({ session, onLogout }: { session: Session; onLogout: () => Promise<void> }) {
  return (
    <header className="app-header">
      <Brand />
      <div className="header-boundary"><span className="pulse" />Speak · Review · Track</div>
      <div className="account-menu">
        <span className={`role-chip role-${session.role.toLowerCase()}`}>{session.role === "CITIZEN" ? "Citizen" : "Evaluator"}</span>
        <span className="account-name">{session.name}</span>
        <button className="text-button" onClick={() => void onLogout()}>Sign out</button>
      </div>
    </header>
  );
}

function CitizenNavigation({ tab, setTab, caseCount }: { tab: CitizenTab; setTab: (tab: CitizenTab) => void; caseCount: number }) {
  return (
    <nav className="side-nav" aria-label="Citizen workspace">
      <div className="nav-section-label">WORKSPACE</div>
      <button type="button" aria-current={tab === "NEW" ? "page" : undefined} className={tab === "NEW" ? "active" : ""} onClick={() => setTab("NEW")}><span aria-hidden="true">01</span>New complaint</button>
      <button type="button" aria-current={tab === "CASES" ? "page" : undefined} className={tab === "CASES" ? "active" : ""} onClick={() => setTab("CASES")}><span aria-hidden="true">02</span>My cases <em>{caseCount}</em></button>
      <button type="button" aria-current={tab === "SUPPORT" ? "page" : undefined} className={tab === "SUPPORT" ? "active" : ""} onClick={() => setTab("SUPPORT")}><span aria-hidden="true">03</span>Support & follow-ups</button>
      <div className="side-safety">
        <strong>Act first when money moved</strong>
        <p>Prepare the urgent details without leaving the sandbox.</p>
        <SafetySimulation mode="FINANCIAL" compact />
      </div>
    </nav>
  );
}

function IntakeWorkspace({
  asr,
  tts,
  evidenceStatus,
  onRecorded,
}: {
  asr: AsrStatus;
  tts: TtsStatus;
  evidenceStatus: EvidenceStatus;
  onRecorded: (caseId: string) => Promise<void>;
}) {
  const [intakeMethod, setIntakeMethod] = useState<IntakeMethod>("VOICE_AGENT");
  const [languageCode, setLanguageCode] = useState("unknown");
  const [title, setTitle] = useState("");
  const [nativeTranscript, setNativeTranscript] = useState("");
  const [englishTranscript, setEnglishTranscript] = useState("");
  const [source, setSource] = useState<IntakeSource>({ provider: "CYBERSAARTHI_MOCK_AGENT", model: "guided-conversation-v2", synthetic: true });
  const [prepared, setPrepared] = useState<CyberSaarthiResponse | null>(null);
  const [district, setDistrict] = useState("");
  const [route, setRoute] = useState("UNKNOWN");
  const [reviewed, setReviewed] = useState(false);
  const [incidentRecency, setIncidentRecency] = useState<IncidentRecency>("UNKNOWN");
  const [recencySource, setRecencySource] = useState<RecencySource>("UNCONFIRMED");
  const [financialDraft, setFinancialDraft] = useState<FinancialDraft>(EMPTY_FINANCIAL_DRAFT);
  const [recording, setRecording] = useState(false);
  const [recordingHasMinimum, setRecordingHasMinimum] = useState(false);
  const [microphonePending, setMicrophonePending] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<VoiceCaptureTarget | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [agentStarted, setAgentStarted] = useState(false);
  const [agentComplete, setAgentComplete] = useState(false);
  const [agentStep, setAgentStep] = useState(0);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [evidenceConsent, setEvidenceConsent] = useState(false);
  const [evidenceUploads, setEvidenceUploads] = useState<EvidenceUpload[]>([]);
  const [verifiedEvidence, setVerifiedEvidence] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const activeCaptureTarget = useRef<VoiceCaptureTarget | null>(null);
  const recordingHasMinimumRef = useRef(false);
  const minimumRecordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evidencePreviewUrls = useRef<string[]>([]);
  const activeAudio = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrl = useRef<string | null>(null);
  const narrationTextarea = useRef<HTMLTextAreaElement | null>(null);
  const preparedStoryRef = useRef("");

  function cancelActiveRecording() {
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    if (minimumRecordingTimer.current) clearTimeout(minimumRecordingTimer.current);
    minimumRecordingTimer.current = null;
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.onstop = null;
      mediaRecorder.current.stop();
    }
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaRecorder.current = null;
    mediaStream.current = null;
    audioChunks.current = [];
    activeCaptureTarget.current = null;
    recordingHasMinimumRef.current = false;
    setRecordingHasMinimum(false);
    setMicrophonePending(false);
    setCaptureTarget(null);
    setRecording(false);
  }

  function stopActiveAudio() {
    activeAudio.current?.pause();
    activeAudio.current = null;
    if (activeAudioUrl.current) URL.revokeObjectURL(activeAudioUrl.current);
    activeAudioUrl.current = null;
    setSpeaking(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  useEffect(() => () => {
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (minimumRecordingTimer.current) clearTimeout(minimumRecordingTimer.current);
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.onstop = null;
      mediaRecorder.current.stop();
    }
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    stopActiveAudio();
  }, []);

  useEffect(() => () => {
    for (const previewUrl of evidencePreviewUrls.current) URL.revokeObjectURL(previewUrl);
  }, []);

  const triageAdvisory = useMemo(
    () => emergencyAdvisoryFor(`${nativeTranscript} ${englishTranscript}`),
    [englishTranscript, nativeTranscript],
  );
  let verifiedTimestampEvidence: { uploadId: string; value: string; sourceText: string | null } | null = null;
  for (const upload of evidenceUploads) {
    const finding = upload.result?.findings.find((item) =>
      item.fieldId === "transaction.occurred_at"
      && item.value !== null
      && verifiedEvidence.has(`${upload.id}:${item.fieldId}`));
    if (finding?.value) {
      verifiedTimestampEvidence = { uploadId: upload.id, value: finding.value, sourceText: finding.sourceText };
      break;
    }
  }
  const evidenceRecency = assessEvidenceRecency(verifiedTimestampEvidence?.value);
  const evidenceAgeLabel = recencyAgeLabel(evidenceRecency.ageMinutes);
  const financialErrors = useMemo(
    () => validateFinancialDraft(financialDraft),
    [financialDraft],
  );
  const structuredFinancialFacts = useMemo(
    () => financialDraftFacts(financialDraft),
    [financialDraft],
  );
  const hasFinancialErrors = Object.keys(financialErrors).length > 0;

  function updateFinancial(field: FinancialDraftField, value: string) {
    setFinancialDraft((current) => ({ ...current, [field]: value }));
    setReviewed(false);
  }

  function speakWithDevice(
    text: string,
    voiceLanguageCode = languageCode,
    notice = "Using the voice available on this device.",
  ) {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    stopActiveAudio();
    setVoiceNotice(notice);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLanguageCode === "unknown" ? navigator.language || "en-IN" : voiceLanguageCode;
    utterance.rate = 0.9;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = (event) => {
      setSpeaking(false);
      if (event.error === "canceled" || event.error === "interrupted") return;
      setVoiceNotice("Voice playback is unavailable on this device. The question remains visible above.");
    };
    window.speechSynthesis.speak(utterance);
  }

  async function playAgentPrompt(text: string, voiceLanguageCode = languageCode) {
    if (!text) return;
    stopActiveAudio();
    if (!tts.configured) {
      speakWithDevice(text, voiceLanguageCode, "Natural voice is temporarily unavailable, so the device voice is reading this prompt.");
      return;
    }
    setSpeaking(true);
    setError("");
    setVoiceNotice("");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, languageCode: voiceLanguageCode }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Natural voice playback could not start.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      activeAudioUrl.current = url;
      activeAudio.current = audio;
      audio.onended = stopActiveAudio;
      audio.onerror = () => {
        stopActiveAudio();
        speakWithDevice(text, voiceLanguageCode, "The natural voice clip could not play, so the device voice is reading this prompt.");
      };
      await audio.play();
    } catch (caught) {
      stopActiveAudio();
      const reason = caught instanceof Error ? caught.message : "Natural voice could not start.";
      speakWithDevice(text, voiceLanguageCode, `${reason} The device voice is reading this prompt instead.`);
    }
  }

  function resetWorkingCopy(nextMethod: IntakeMethod = intakeMethod) {
    cancelActiveRecording();
    setIntakeMethod(nextMethod);
    setLanguageCode("unknown");
    setTitle("");
    setNativeTranscript("");
    setEnglishTranscript("");
    setDistrict("");
    setIncidentRecency("UNKNOWN");
    setRecencySource("UNCONFIRMED");
    setFinancialDraft(EMPTY_FINANCIAL_DRAFT);
    setSource({ provider: nextMethod === "VOICE_AGENT" ? "CYBERSAARTHI_MOCK_AGENT" : "CITIZEN_TYPED", model: nextMethod === "VOICE_AGENT" ? "guided-conversation-v2" : null, synthetic: true });
    preparedStoryRef.current = "";
    setPrepared(null);
    setReviewed(false);
    setAgentStarted(false);
    setAgentComplete(false);
    setAgentStep(0);
    setAgentMessages([]);
    setError("");
    setVoiceNotice("");
    stopActiveAudio();
  }

  async function startVoiceAgent() {
    setBusy(true);
    setError("");
    try {
      const payload = await readJson<VoiceAgentReply>(await fetch("/api/voice-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "START", step: 0 }),
      }));
      setAgentStarted(true);
      setAgentComplete(false);
      setAgentStep(payload.step);
      setAgentMessages([{ id: clientMessageId(), role: "AGENT", native: payload.promptNative, english: payload.promptEnglish }]);
      setTitle("Conversational voice complaint");
      setSource({ provider: "CYBERSAARTHI_MOCK_AGENT", model: `voice-intake-v${payload.selectedAgentVersion}`, synthetic: true });
      void playAgentPrompt(payload.promptNative, "en-IN");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The guided voice session could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function advanceVoiceAgent(
    action: "TURN" | "SYNTHETIC_TURN",
    nativeAnswer = "",
    englishAnswer = "",
    answerLanguageCode = languageCode,
  ) {
    const payload = await readJson<VoiceAgentReply>(await fetch("/api/voice-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        detectedLanguageCode: answerLanguageCode,
        step: agentStep,
        nativeAnswer,
        englishAnswer,
      }),
    }));
    const citizenNative = payload.answerNative || nativeAnswer;
    const citizenEnglish = payload.answerEnglish || englishAnswer;
    if (payload.answerCapture === "DISTRICT") {
      setDistrict(citizenEnglish.replace(/[.。]+$/, "").trim());
    }
    setAgentMessages((current) => [
      ...current,
      { id: clientMessageId(), role: "CITIZEN", native: citizenNative, english: citizenEnglish },
      { id: clientMessageId(), role: "AGENT", native: payload.promptNative, english: payload.promptEnglish },
    ]);
    setNativeTranscript((current) => [current.trim(), citizenNative].filter(Boolean).join(" "));
    setEnglishTranscript((current) => [current.trim(), citizenEnglish].filter(Boolean).join(" "));
    setSource({
      provider: payload.answerProvider || "CYBERSAARTHI_MOCK_AGENT",
      model: payload.answerModel || `voice-intake-v${payload.selectedAgentVersion}`,
      synthetic: payload.synthetic,
    });
    setLanguageCode(payload.languageCode || answerLanguageCode || "unknown");
    setAgentStep(payload.step);
    setAgentComplete(payload.complete);
    preparedStoryRef.current = "";
    setPrepared(null);
    setReviewed(false);
    if (payload.promptNative) void playAgentPrompt(payload.promptNative, payload.languageCode);
  }

  async function runSyntheticAgentReply() {
    setBusy(true);
    setError("");
    try {
      await advanceVoiceAgent("SYNTHETIC_TURN");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The synthetic voice turn could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadFixture() {
    setBusy(true);
    setError("");
    try {
      const payload = await readJson<{
        title: string;
        nativeTranscript: string;
        englishTranscript: string;
        provider: string;
        model: string;
        synthetic: boolean;
      }>(await fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture: true }),
      }));
      setTitle(payload.title);
      setNativeTranscript(payload.nativeTranscript);
      setEnglishTranscript(payload.englishTranscript);
      setLanguageCode("en-IN");
      setSource({ provider: payload.provider, model: payload.model, synthetic: payload.synthetic });
      preparedStoryRef.current = "";
      setPrepared(null);
      setReviewed(false);
      setVoiceNotice("Working example added to Your narration.");
      requestAnimationFrame(() => narrationTextarea.current?.focus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The fixture could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording(target: VoiceCaptureTarget) {
    setError("");
    setVoiceNotice("");
    if (microphonePending || recording || transcribing) return;
    if (!asr.configured) {
      setError("Live voice transcription is unavailable right now. Try the working voice example or type your answer.");
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio here. You can continue by typing or using the working voice example.");
      return;
    }
    stopActiveAudio();
    setMicrophonePending(true);
    setCaptureTarget(target);
    setVoiceNotice("Opening your microphone…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("No live audio track", "NotReadableError");
      }
      const mimeType = typeof MediaRecorder.isTypeSupported === "function"
        ? chooseRecorderMimeType((candidate) => MediaRecorder.isTypeSupported(candidate))
        : null;
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 })
          : new MediaRecorder(stream);
      } catch (caught) {
        stream.getTracks().forEach((track) => track.stop());
        throw caught;
      }
      let recorderFailed = false;
      audioChunks.current = [];
      mediaStream.current = stream;
      mediaRecorder.current = recorder;
      activeCaptureTarget.current = target;
      recordingHasMinimumRef.current = false;
      setRecordingHasMinimum(false);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };
      recorder.onerror = () => {
        recorderFailed = true;
        setVoiceNotice("");
        setError("The browser stopped the recording unexpectedly. Your existing narration is unchanged; please try the voice button again.");
      };
      recorder.onstop = () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
        if (minimumRecordingTimer.current) clearTimeout(minimumRecordingTimer.current);
        minimumRecordingTimer.current = null;
        const durationMs = recordingHasMinimumRef.current ? MIN_RECORDING_MS : 0;
        const completedTarget = activeCaptureTarget.current ?? target;
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorder.current = null;
        mediaStream.current = null;
        audioChunks.current = [];
        activeCaptureTarget.current = null;
        recordingHasMinimumRef.current = false;
        setRecordingHasMinimum(false);
        setCaptureTarget(null);
        setRecording(false);
        if (recorderFailed) return;
        if (!hasUsableRecording(blob.size, durationMs)) {
          setVoiceNotice("");
          setError("That clip was too short. Tap the voice button, speak for at least one second, then tap Stop.");
        } else {
          void transcribeAudio(blob, completedTarget);
        }
      };
      recorder.start(250);
      setRecording(true);
      minimumRecordingTimer.current = setTimeout(() => {
        recordingHasMinimumRef.current = true;
        setRecordingHasMinimum(true);
      }, MIN_RECORDING_MS);
      setVoiceNotice(target === "AGENT_REPLY"
        ? "Listening for your reply. Speak now, then tap Stop & use reply."
        : "Dictation is listening. Speak now, then tap Stop & add to narration.");
      recordingTimer.current = setTimeout(() => {
        if (recorder.state === "recording") {
          try { recorder.requestData(); } catch { /* The final data event still follows stop(). */ }
          recorder.stop();
        }
      }, Math.min(asr.maxRecordingSeconds || 28, 28) * 1_000);
    } catch (caught) {
      if (minimumRecordingTimer.current) clearTimeout(minimumRecordingTimer.current);
      minimumRecordingTimer.current = null;
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      mediaRecorder.current = null;
      mediaStream.current = null;
      activeCaptureTarget.current = null;
      recordingHasMinimumRef.current = false;
      setRecordingHasMinimum(false);
      setCaptureTarget(null);
      setVoiceNotice("");
      setError(microphoneErrorMessage(caught));
    } finally {
      setMicrophonePending(false);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorder.current;
    if (recorder?.state !== "recording") return;
    setVoiceNotice("Finishing the recording…");
    try { recorder.requestData(); } catch { /* The final data event still follows stop(). */ }
    recorder.stop();
  }

  async function transcribeAudio(audioBlob: Blob, target: VoiceCaptureTarget) {
    setTranscribing(true);
    setError("");
    setVoiceNotice("Recording received. Turning it into text…");
    const form = new FormData();
    form.append("audio", audioBlob, audioFilename(audioBlob.type));
    form.append("processingNoticeAccepted", "true");
    try {
      const payload = await readJson<{
        title: string;
        nativeTranscript: string;
        englishTranscript: string;
        provider: string;
        model: string;
        synthetic: boolean;
        languageCode: string;
        translationStatus?: "COMPLETED" | "FALLBACK_NATIVE" | "TRANSLATED_ONLY";
        warnings?: string[];
      }>(await fetch("/api/asr", { method: "POST", body: form }));
      const detected = payload.languageCode || "unknown";
      setLanguageCode(detected);
      if (target === "AGENT_REPLY") {
        if (!agentStarted || agentComplete) {
          throw new Error("This reply no longer matches an active voice question. Start the voice guide again or switch to dictation.");
        }
        await advanceVoiceAgent("TURN", payload.nativeTranscript, payload.englishTranscript, detected);
        setVoiceNotice(payload.translationStatus === "FALLBACK_NATIVE"
          ? "Reply added. Translation was unavailable, so your original words were preserved."
          : payload.translationStatus === "TRANSLATED_ONLY"
            ? "Reply added as an English speech translation because original-script transcription was unavailable. Review it carefully."
            : "Reply transcribed and added to your narration.");
      } else {
        setTitle(payload.title);
        setNativeTranscript((current) => appendNarration(current, payload.nativeTranscript));
        setEnglishTranscript((current) => appendNarration(current, payload.englishTranscript));
        setSource({ provider: payload.provider, model: payload.model, synthetic: payload.synthetic });
        preparedStoryRef.current = "";
        setPrepared(null);
        setReviewed(false);
        setVoiceNotice(payload.translationStatus === "FALLBACK_NATIVE"
          ? "Dictation added to Your narration. Translation was unavailable, so your original words were preserved."
          : payload.translationStatus === "TRANSLATED_ONLY"
            ? "Dictation added as an English speech translation because original-script transcription was unavailable. Review it carefully."
            : "Dictation added to Your narration. Review the text before continuing.");
        requestAnimationFrame(() => {
          narrationTextarea.current?.focus({ preventScroll: true });
          narrationTextarea.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    } catch (caught) {
      setVoiceNotice("");
      setError(caught instanceof Error ? caught.message : "The clip could not be transcribed.");
    } finally {
      setTranscribing(false);
    }
  }

  async function analyseEvidenceUpload(upload: EvidenceUpload) {
    const form = new FormData();
    form.append("image", upload.file, upload.file.name);
    form.append("consent", "true");
    form.append("synthetic", "true");
    form.append("mode", evidenceStatus.configured ? "OPENAI" : "DEMO");
    try {
      const result = await readJson<EvidenceAnalysisResponse>(await fetch("/api/evidence/analyse", {
        method: "POST",
        body: form,
      }));
      setEvidenceUploads((current) => current.map((item) =>
        item.id === upload.id ? { ...item, state: "DONE", result, error: null } : item));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Evidence analysis could not be completed.";
      setEvidenceUploads((current) => current.map((item) =>
        item.id === upload.id ? { ...item, state: "ERROR", result: null, error: message } : item));
    }
  }

  function acceptEvidenceFiles(fileList: FileList | File[]) {
    if (!evidenceConsent) {
      setError("Confirm that the screenshots are synthetic before dropping evidence.");
      return;
    }
    const availableSlots = Math.max(0, 3 - evidenceUploads.length);
    const selected = Array.from(fileList).slice(0, availableSlots);
    if (selected.length === 0) {
      setError("You can analyse up to three synthetic screenshots.");
      return;
    }
    const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
    const invalid = selected.find((file) => !allowed.has(file.type) || file.size === 0 || file.size > 5_000_000);
    if (invalid) {
      setError("Use non-empty PNG, JPEG, or WebP screenshots up to 5 MB each.");
      return;
    }
    setError("");
    const uploads = selected.map((file): EvidenceUpload => {
      const previewUrl = URL.createObjectURL(file);
      evidencePreviewUrls.current.push(previewUrl);
      return {
        id: clientMessageId(),
        file,
        previewUrl,
        state: "ANALYSING",
        result: null,
        error: null,
      };
    });
    setEvidenceUploads((current) => [...current, ...uploads]);
    for (const upload of uploads) void analyseEvidenceUpload(upload);
  }

  function removeEvidence(uploadId: string) {
    const target = evidenceUploads.find((upload) => upload.id === uploadId);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
      evidencePreviewUrls.current = evidencePreviewUrls.current.filter((url) => url !== target.previewUrl);
    }
    if (recencySource === "VERIFIED_EVIDENCE" && target?.result?.findings.some((finding) =>
      finding.fieldId === "transaction.occurred_at"
      && verifiedEvidence.has(`${uploadId}:${finding.fieldId}`))) {
      setIncidentRecency("UNKNOWN");
      setRecencySource("UNCONFIRMED");
    }
    setEvidenceUploads((current) => current.filter((upload) => upload.id !== uploadId));
    setVerifiedEvidence((current) => {
      const next = new Set(current);
      for (const key of next) if (key.startsWith(`${uploadId}:`)) next.delete(key);
      return next;
    });
  }

  function retryEvidence(upload: EvidenceUpload) {
    if (recencySource === "VERIFIED_EVIDENCE" && upload.result?.findings.some((finding) =>
      finding.fieldId === "transaction.occurred_at"
      && verifiedEvidence.has(`${upload.id}:${finding.fieldId}`))) {
      setIncidentRecency("UNKNOWN");
      setRecencySource("UNCONFIRMED");
    }
    setEvidenceUploads((current) => current.map((item) =>
      item.id === upload.id ? { ...item, state: "ANALYSING", error: null } : item));
    void analyseEvidenceUpload(upload);
  }

  function toggleEvidenceVerified(uploadId: string, fieldId: string, checked: boolean) {
    const key = `${uploadId}:${fieldId}`;
    if (!checked && fieldId === "transaction.occurred_at" && recencySource === "VERIFIED_EVIDENCE") {
      setIncidentRecency("UNKNOWN");
      setRecencySource("UNCONFIRMED");
    }
    setVerifiedEvidence((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function prepareCase() {
    const workingStory = englishTranscript.trim() || nativeTranscript.trim();
    if (workingStory.length < 20) {
      setError("Add a little more detail before preparing the case.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await readJson<CyberSaarthiResponse>(await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: workingStory, language: "Auto-detected or citizen-entered", mode: "DEMO" }),
      }));
      setPrepared(response);
      setRoute(response.classification.topLevelRoute);
      setFinancialDraft((current) => mergePreparedFinancialDraft(
        current,
        deterministicFinancialFields(
          workingStory,
          response.candidateFacts as Array<Record<string, unknown>>,
        ),
      ));
      preparedStoryRef.current = workingStory;
      setReviewed(false);
      if (!title) setTitle(response.incidentSummary.slice(0, 90));
      void fetch("/api/prepare-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story: workingStory,
          facts: response.candidateFacts,
          synthetic: true,
          modelProcessingAccepted: true,
        }),
      })
        .then((result) => readJson<NarrationFieldExtraction>(result))
        .then((fieldResult) => {
          if (preparedStoryRef.current !== workingStory) return;
          setFinancialDraft((current) => mergePreparedFinancialDraft(current, fieldResult.fields));
        })
        .catch(() => {
          // Source-linked deterministic values are already available. Model
          // enrichment is advisory and never blocks citizen review.
        });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The case could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  async function recordCase() {
    if (!prepared || !reviewed) return;
    if (nativeTranscript.trim().length < 20) {
      setError("Review the narration before saving.");
      return;
    }
    if (!district.trim()) {
      setError("Select or enter the incident district before saving this case.");
      return;
    }
    if (route === "FINANCIAL_FRAUD" && hasFinancialErrors) {
      setError("Correct the highlighted financial details, or clear a field that is unknown.");
      return;
    }
    setBusy(true);
    setError("");
    const saveFinancialFacts = route === "FINANCIAL_FRAUD" ? structuredFinancialFacts : [];
    const structuredFactIds = new Set(saveFinancialFacts.map((fact) => String(fact.fieldId)));
    const acceptedFacts = prepared.candidateFacts
      .filter((fact) => !structuredFactIds.has(fact.fieldId))
      .map((fact) => ({
        fieldId: fact.fieldId,
        label: fact.fieldId.replaceAll(".", " · "),
        value: fact.value,
        source: fact.sourceText,
        status: "ACCEPTED",
      }));
    const acceptedEvidenceFacts = evidenceUploads.flatMap((upload) =>
      upload.result?.findings
        .filter((finding) => finding.value !== null && verifiedEvidence.has(`${upload.id}:${finding.fieldId}`))
        .map((finding) => ({
          fieldId: finding.fieldId,
          label: finding.fieldId.replaceAll(".", " · "),
          value: finding.value,
          source: finding.sourceText || "Synthetic evidence screenshot",
          sourceImageId: finding.sourceImageId,
          evidenceId: upload.result?.evidenceId,
          provider: upload.result?.provider,
          model: upload.result?.model,
          checksum: upload.result?.checksum,
          mediaType: upload.result?.mediaType,
          status: "ACCEPTED",
        })) ?? [],
    );
    const amountFact = saveFinancialFacts.find((fact) => fact.fieldId === "financial.lossAmount")
      ?? prepared.candidateFacts.find((fact) => fact.fieldId === "financial.lossAmount");
    try {
      const payload = await readJson<{ caseId: string; demoReference: string }>(await fetch("/api/demo-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          synthetic: true,
          reviewedByCitizen: true,
          unresolvedCriticalConflicts: prepared.conflicts.filter((conflict) => conflict.blocking).length,
          title: title.trim() || "Synthetic cyber incident",
          narrativeNative: nativeTranscript,
          narrativeEnglish: englishTranscript.trim() || nativeTranscript,
          languageCode,
          provider: source.provider,
          model: source.model,
          route,
          district: district.trim(),
          lossAmount: typeof amountFact?.value === "number" ? amountFact.value : null,
          urgency: prepared.urgency.level,
          facts: [...acceptedFacts, ...saveFinancialFacts, ...acceptedEvidenceFacts],
          unknowns: prepared.unknownFields.filter((item) => item.fieldId.startsWith("suspect.")),
        }),
      }));
      await onRecorded(payload.caseId);
      setPrepared(null);
      setNativeTranscript("");
      setEnglishTranscript("");
      setTitle("");
      setDistrict("");
      setFinancialDraft(EMPTY_FINANCIAL_DRAFT);
      preparedStoryRef.current = "";
      setReviewed(false);
      setIncidentRecency("UNKNOWN");
      setRecencySource("UNCONFIRMED");
      setFinancialDraft(EMPTY_FINANCIAL_DRAFT);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The synthetic case could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  const verifiedEvidenceResults = evidenceUploads.filter((upload) =>
    upload.result && upload.result.findings.some((finding) =>
      finding.value !== null && verifiedEvidence.has(`${upload.id}:${finding.fieldId}`)),
  );
  const readinessFacts: Array<Record<string, unknown>> = prepared
    ? [
        ...(route === "FINANCIAL_FRAUD" ? structuredFinancialFacts : []),
        ...prepared.candidateFacts.filter((fact) =>
          route !== "FINANCIAL_FRAUD"
          || !structuredFinancialFacts.some((structured) => structured.fieldId === fact.fieldId)),
        ...verifiedEvidenceResults.flatMap((upload) => upload.result?.findings.map((finding) => ({
          fieldId: finding.fieldId,
          value: finding.value,
          checksum: upload.result?.checksum,
        })) ?? []),
      ]
    : [];
  const reviewReadiness = prepared ? buildSubmissionReadiness({
    route,
    district,
    narrative: englishTranscript.trim() || nativeTranscript.trim(),
    facts: readinessFacts,
    evidenceChecksums: verifiedEvidenceResults.map((upload) => upload.result?.checksum ?? "").filter(Boolean),
  }) : null;

  return (
    <section className="workspace-card intake-card">
      <div className="workspace-title-row">
        <div><span className="step-label">VOICE-FIRST COMPLAINT</span><h1>Speak naturally. We will ask four short questions.</h1><p>Start with the calm voice guide, or switch to typing and dictation whenever you prefer.</p></div>
        <div className="progress-steps" aria-label="Case steps"><span className="current">1</span><i /><span className={prepared ? "current" : ""}>2</span><i /><span className={reviewed ? "current" : ""}>3</span></div>
      </div>

      <div className="intake-grid">
        <div className="intake-main">
          <div className="intake-methods" role="tablist" aria-label="Choose how to tell your story">
            <button
              role="tab"
              aria-selected={intakeMethod === "VOICE_AGENT"}
              className={intakeMethod === "VOICE_AGENT" ? "active" : ""}
              onClick={() => intakeMethod !== "VOICE_AGENT" && resetWorkingCopy("VOICE_AGENT")}
            >
              <span className="method-icon">◉</span>
              <span><strong>Voice guide</strong><small>Listen, reply, and build the complaint together</small></span>
              <em>Primary</em>
            </button>
            <button
              role="tab"
              aria-selected={intakeMethod === "NARRATION_ASR"}
              className={intakeMethod === "NARRATION_ASR" ? "active" : ""}
              onClick={() => intakeMethod !== "NARRATION_ASR" && resetWorkingCopy("NARRATION_ASR")}
            >
              <span className="method-icon">Aa</span>
              <span><strong>Type or dictate</strong><small>Write freely or use speech-to-text assistance</small></span>
              <em>Alternate</em>
            </button>
          </div>

          <div className="language-auto" role="note">
            <span aria-hidden="true">◎</span>
            <div>
              <strong>Speak in your own language</strong>
              <small>{languageCode === "unknown" ? "We will detect it automatically when you speak." : "Language detected automatically. You can keep speaking naturally."}</small>
            </div>
            <em>AUTO</em>
          </div>

          <section className="recency-check" aria-labelledby="recency-check-title">
            <div>
              <span className="step-label">IMMEDIATE SAFETY CHECK</span>
              <h2 id="recency-check-title">Did money move in the last two hours?</h2>
              <p>Answer now, or verify a payment time extracted from a screenshot below.</p>
            </div>
            <div className="recency-options" role="radiogroup" aria-label="When money moved">
              {([
                ["UNDER_2H", "Yes · under 2 hours"],
                ["UNKNOWN", "Not sure / no money"],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={incidentRecency === value}
                  className={incidentRecency === value ? "active" : ""}
                  onClick={() => {
                    setIncidentRecency(value);
                    setRecencySource("CITIZEN");
                  }}
                  key={value}
                >
                  {label}
                </button>
              ))}
            </div>
            {verifiedTimestampEvidence && (
              <article className={`ocr-recency-proposal recency-${evidenceRecency.window.toLowerCase()}`}>
                <div>
                  <span>Citizen-checked screenshot time</span>
                  <strong>{verifiedTimestampEvidence.value}</strong>
                  <p>
                    {evidenceRecency.window === "UNDER_2H"
                      ? "This appears to be within two hours. You may still be in the urgent response window: keep the transaction reference ready, open the safety steps, and continue here while you seek help."
                      : evidenceRecency.window === "OVER_2H"
                        ? "This appears to be more than two hours ago. Do not stop: open the safety steps, contact your bank through a channel you independently verify, and continue preparing the case."
                        : evidenceRecency.reason === "FUTURE_TIMESTAMP"
                          ? "This time appears to be in the future, so CyberSaarthi will not use it. Choose the timing yourself or re-check the screenshot."
                          : "CyberSaarthi cannot safely calculate the window from this timestamp. Choose the timing yourself."}
                  </p>
                  {verifiedTimestampEvidence.sourceText && <small>Screenshot text: “{verifiedTimestampEvidence.sourceText}”</small>}
                </div>
                <div className="ocr-recency-action">
                  {evidenceAgeLabel && <span>{evidenceAgeLabel}</span>}
                  {evidenceRecency.window !== "UNKNOWN" && (
                    <button
                      type="button"
                      className="button secondary"
                      aria-pressed={recencySource === "VERIFIED_EVIDENCE"}
                      onClick={() => {
                        setIncidentRecency(evidenceRecency.window);
                        setRecencySource("VERIFIED_EVIDENCE");
                      }}
                    >
                      {recencySource === "VERIFIED_EVIDENCE" ? "Using this time" : "Confirm & use this time"}
                    </button>
                  )}
                </div>
              </article>
            )}
          </section>

          {incidentRecency === "UNDER_2H" && (
            <section className="golden-hour-banner" role="alert" aria-labelledby="golden-hour-title">
              <div className="golden-hour-head">
                <span aria-hidden="true">!</span>
                <div><strong id="golden-hour-title">Act now while the case is prepared</strong><small>{triageAdvisory.label}</small></div>
              </div>
              <ol>
                {triageAdvisory.actions.map((action) => <li key={action}>{action}</li>)}
              </ol>
              <p>CyberSaarthi cannot freeze funds or contact a bank. This control opens preparation guidance only.</p>
              <SafetySimulation mode="FINANCIAL" compact />
            </section>
          )}

          {intakeMethod === "VOICE_AGENT" ? (
            <div className="agent-session">
              <div className="agent-session-head">
                <div className="voice-visual" aria-hidden="true"><span /><span /><span /><span /><span /></div>
                <div><strong>Voice guide</strong><p>One calm question at a time. After your first reply, the guide follows your detected language.</p></div>
                <span className="agent-mode">VOICE PRIMARY</span>
              </div>

              {!agentStarted ? (
                <div className="agent-welcome">
                  <h2>Ready when you are.</h2>
                  <p>Speak naturally. We will ask what happened, whether money moved, what evidence you have, and your district.</p>
                  <button type="button" className="button primary" disabled={busy} aria-busy={busy} onClick={() => void startVoiceAgent()}>
                    {busy ? "Starting…" : "Start voice guide"}<span aria-hidden="true">→</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="agent-progress"><span>{agentComplete ? "Conversation complete" : `Question ${agentStep + 1} of 4`}</span><i><b style={{ width: `${agentComplete ? 100 : ((agentStep + 1) / 4) * 100}%` }} /></i></div>
                  <div className="agent-thread" aria-live="polite">
                    {agentMessages.map((message) => (
                      <article key={message.id} className={message.role === "AGENT" ? "agent-message" : "citizen-message"}>
                        <small>{message.role === "AGENT" ? "CyberSaarthi" : "You"}</small>
                        <p lang={htmlLanguageCode(languageCode)}>{message.native}</p>
                        {message.english.trim() !== message.native.trim() && <em>English working copy: {message.english}</em>}
                      </article>
                    ))}
                  </div>
                  <div className={`voice-live-status ${recording ? "recording" : microphonePending ? "transcribing" : speaking ? "speaking" : transcribing ? "transcribing" : ""}`} aria-live="polite">
                    <span className="voice-orb" aria-hidden="true"><i /><i /><i /></span>
                    <div><strong>{recording ? "Listening…" : microphonePending ? "Opening microphone…" : transcribing ? "Turning your reply into text…" : speaking ? "Speaking…" : agentComplete ? "Ready to review" : "Ready for your reply"}</strong><small>{recording ? "Tap Stop when you finish" : microphonePending ? "Approve microphone access if your browser asks" : transcribing ? "Your narration will update automatically" : agentComplete ? "Review the captured narration below" : "The question is always visible above"}</small></div>
                  </div>
                  <div className="agent-controls">
                    <button type="button" className="button secondary" disabled={busy} onClick={() => speaking ? stopActiveAudio() : void playAgentPrompt(agentMessages.at(-1)?.native || "", languageCode)}>{speaking ? "Stop playback" : agentComplete ? "Play closing message" : "Play question"}</button>
                    <button type="button" className="text-button" disabled={busy} onClick={() => speakWithDevice(agentMessages.at(-1)?.native || "", languageCode)}>Use device voice</button>
                    {!agentComplete && <button type="button" className="button secondary" disabled={busy || recording || microphonePending || transcribing} onClick={() => void runSyntheticAgentReply()}>Try working voice example</button>}
                    {!agentComplete && !recording && <button type="button" className="button dark" disabled={busy || microphonePending || transcribing} onClick={() => void startRecording("AGENT_REPLY")}>{microphonePending && captureTarget === "AGENT_REPLY" ? "Opening microphone…" : "Speak reply"}</button>}
                    {recording && captureTarget === "AGENT_REPLY" && <button type="button" className="button danger" disabled={!recordingHasMinimum} onClick={stopRecording}>{recordingHasMinimum ? "Stop & use reply" : "Speak now…"}</button>}
                  </div>
                  {voiceNotice && <p className="voice-note" role="status">{voiceNotice}</p>}
                  {!agentComplete && <p className="processing-note">Starting the microphone sends this clip for transcription. The audio is not saved with your case.</p>}
                  {agentComplete && (
                    <div className="agent-working-copy">
                      <div className="completion-note"><strong>Conversation captured</strong><span>Review your narration before preparing facts.</span></div>
                      <label className="field-label" htmlFor="agent-native-story">Your narration</label>
                      <textarea ref={narrationTextarea} id="agent-native-story" rows={6} value={nativeTranscript} onChange={(event) => { setNativeTranscript(event.target.value); preparedStoryRef.current = ""; setPrepared(null); }} />
                      <div className="transcript-meta"><span>{nativeTranscript.length} characters</span><span>Original preserved</span></div>
                      {englishTranscript.trim() && englishTranscript.trim() !== nativeTranscript.trim() && <><label className="field-label" htmlFor="agent-english-story">English working copy <small>Review before continuing</small></label><textarea id="agent-english-story" rows={5} value={englishTranscript} onChange={(event) => { setEnglishTranscript(event.target.value); preparedStoryRef.current = ""; setPrepared(null); }} /></>}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="voice-card">
                <div className="voice-visual" aria-hidden="true"><span /><span /><span /><span /><span /></div>
                <div className="voice-copy">
                  <strong>Type freely or dictate in your language</strong>
                  <p>{asr.configured ? "Live speech-to-text is ready. Stop recording and your narration fills automatically." : "Use the working voice example or type directly."}</p>
                </div>
                <div className="voice-actions">
                  <button type="button" className="button secondary" disabled={busy || recording || microphonePending || transcribing} onClick={() => void loadFixture()}>Try working voice example</button>
                  {!recording && <button type="button" className="button dark" disabled={busy || microphonePending || transcribing} onClick={() => void startRecording("NARRATION")}>{microphonePending && captureTarget === "NARRATION" ? "Opening microphone…" : "Start dictation"}</button>}
                  {recording && captureTarget === "NARRATION" && <button type="button" className="button danger" disabled={!recordingHasMinimum} onClick={stopRecording}>{recordingHasMinimum ? "Stop & add to narration" : "Speak now…"}</button>}
                </div>
              </div>
              {(microphonePending || transcribing) && <div className="transcription-progress" role="status"><span className="spinner" />{microphonePending ? "Opening your microphone…" : "Turning your voice into text…"}</div>}
              {voiceNotice && <p className="voice-note" role="status">{voiceNotice}</p>}
              <p className="processing-note">Starting dictation sends this clip for transcription. The audio is not saved with your case.</p>

              <label className="field-label" htmlFor="native-story">Your narration</label>
              <textarea
                ref={narrationTextarea}
                id="native-story"
                rows={6}
                value={nativeTranscript}
                onChange={(event) => {
                  setNativeTranscript(event.target.value);
                  setEnglishTranscript(event.target.value);
                  setSource({ provider: "CITIZEN_TYPED", model: null, synthetic: true });
                  preparedStoryRef.current = "";
                  setPrepared(null);
                }}
                placeholder="Type here, start dictation, or try the working voice example…"
              />
              <div className="transcript-meta"><span>{nativeTranscript.length} characters</span><span>Aim for 200+ characters for a complete account</span></div>

              {englishTranscript.trim() && englishTranscript.trim() !== nativeTranscript.trim() && <><label className="field-label" htmlFor="english-story">English working copy <small>Review before continuing</small></label><textarea id="english-story" rows={5} value={englishTranscript} onChange={(event) => { setEnglishTranscript(event.target.value); preparedStoryRef.current = ""; setPrepared(null); }} placeholder="Review the translated working copy…" /></>}
            </>
          )}
          <div className="source-strip"><span>Intake status</span><strong>{nativeTranscript.trim() ? "Narration captured" : "Waiting for your narration"}</strong><em>{source.synthetic ? "Working example or text entered by you" : "Voice transcribed · language detected"}</em></div>

          <button
            type="button"
            className="button primary prepare-button"
            disabled={busy || (englishTranscript || nativeTranscript).trim().length < 20 || (intakeMethod === "VOICE_AGENT" && !agentComplete)}
            aria-busy={busy}
            onClick={() => void prepareCase()}
          >
            {busy ? "Working…" : "Prepare facts for my review"}<span aria-hidden="true">→</span>
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}

          {prepared && (
            <div className="review-section">
              <div className="review-heading"><span className="step-label">HUMAN REVIEW</span><h2>Check what CyberSaarthi prepared</h2><p>These are proposals, not established facts. You stay in control.</p></div>
              {prepared.urgency.urgentFinancialAction && (
                <div className="urgent-action"><strong>Act now while reviewing</strong><span>{prepared.urgency.recommendedAction}</span><SafetySimulation mode="FINANCIAL" compact /></div>
              )}
              <label className="field-label" htmlFor="case-title">Case title</label>
              <input id="case-title" value={title} onChange={(event) => { setTitle(event.target.value); setReviewed(false); }} maxLength={140} />
              <div className="two-fields">
                <label>Proposed route<select value={route} onChange={(event) => { setRoute(event.target.value); setReviewed(false); }}>{Object.entries(ROUTE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Incident district <small>required</small><input required value={district} onChange={(event) => { setDistrict(event.target.value); setReviewed(false); }} placeholder="Type the district where you were" /></label>
              </div>
              {route === "FINANCIAL_FRAUD" && (
                <section className="financial-details" aria-labelledby="financial-details-title">
                  <div className="financial-details-head">
                    <div><span className="step-label">STRUCTURED FINANCIAL DETAILS</span><h3 id="financial-details-title">Confirm only the values you know</h3></div>
                    <strong>Synthetic examples only</strong>
                  </div>
                  <p>Blank fields stay unknown. Formatting never invents or repairs an identifier.</p>
                  <p className="processing-note">Source-linked narration may be proposed by the configured language model. Every value stays editable and requires your review.</p>
                  <div className="financial-grid">
                    <label>
                      Incident date and time
                      <input
                        type="datetime-local"
                        value={financialDraft.incidentDateTime}
                        onChange={(event) => updateFinancial("incidentDateTime", event.target.value)}
                        max={new Date().toISOString().slice(0, 16)}
                        aria-invalid={Boolean(financialErrors.incidentDateTime)}
                      />
                      {financialErrors.incidentDateTime && <small role="alert">{financialErrors.incidentDateTime}</small>}
                    </label>
                    <label>
                      Total reported loss (₹)
                      <input
                        inputMode="numeric"
                        value={formatInrInput(financialDraft.totalAmount)}
                        onChange={(event) => updateFinancial("totalAmount", digitsOnly(event.target.value, 12))}
                        placeholder="12,000"
                        aria-invalid={Boolean(financialErrors.totalAmount)}
                      />
                      {financialErrors.totalAmount && <small role="alert">{financialErrors.totalAmount}</small>}
                    </label>
                    <label>
                      Bank, wallet, or merchant
                      <input
                        list="indian-bank-catalog"
                        value={financialDraft.bankName}
                        onChange={(event) => updateFinancial("bankName", event.target.value.slice(0, 100))}
                        placeholder="Name shown in the transaction"
                      />
                      <datalist id="indian-bank-catalog">
                        {INDIAN_BANK_CATALOG.map((bank) => <option value={bank} key={bank} />)}
                      </datalist>
                      <small>Choose a catalog value or enter the exact institution shown.</small>
                    </label>
                    <label>
                      12-digit transaction reference / UTR
                      <input
                        inputMode="numeric"
                        value={formatUtr(financialDraft.utrNumber)}
                        onChange={(event) => updateFinancial("utrNumber", digitsOnly(event.target.value, 12))}
                        placeholder="1234 5678 9012"
                        aria-invalid={Boolean(financialErrors.utrNumber)}
                      />
                      {financialErrors.utrNumber && <small role="alert">{financialErrors.utrNumber}</small>}
                    </label>
                  </div>
                  <details className="financial-optional">
                    <summary>Add optional account or suspect identifiers</summary>
                    <div className="financial-grid">
                      <label>
                        Victim account number
                        <input inputMode="numeric" value={financialDraft.victimAccountNumber} onChange={(event) => updateFinancial("victimAccountNumber", digitsOnly(event.target.value, 18))} aria-invalid={Boolean(financialErrors.victimAccountNumber)} />
                        {financialErrors.victimAccountNumber && <small role="alert">{financialErrors.victimAccountNumber}</small>}
                      </label>
                      <label>
                        Suspect UPI ID
                        <input value={financialDraft.suspectVpa} onChange={(event) => updateFinancial("suspectVpa", event.target.value.slice(0, 320))} placeholder="name@bank" aria-invalid={Boolean(financialErrors.suspectVpa)} />
                        {financialErrors.suspectVpa && <small role="alert">{financialErrors.suspectVpa}</small>}
                      </label>
                      <label>
                        Suspect mobile number
                        <input inputMode="tel" value={financialDraft.suspectPhone} onChange={(event) => updateFinancial("suspectPhone", event.target.value.slice(0, 18))} placeholder="+91 90000 00000" aria-invalid={Boolean(financialErrors.suspectPhone)} />
                        {financialErrors.suspectPhone && <small role="alert">{financialErrors.suspectPhone}</small>}
                      </label>
                      <label>
                        Suspect IFSC
                        <input value={financialDraft.suspectIfsc} onChange={(event) => updateFinancial("suspectIfsc", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} placeholder="ABCD0123456" aria-invalid={Boolean(financialErrors.suspectIfsc)} />
                        {financialErrors.suspectIfsc && <small role="alert">{financialErrors.suspectIfsc}</small>}
                      </label>
                      <label>
                        Suspect account number
                        <input inputMode="numeric" value={financialDraft.suspectAccountNumber} onChange={(event) => updateFinancial("suspectAccountNumber", digitsOnly(event.target.value, 18))} aria-invalid={Boolean(financialErrors.suspectAccountNumber)} />
                        {financialErrors.suspectAccountNumber && <small role="alert">{financialErrors.suspectAccountNumber}</small>}
                      </label>
                    </div>
                  </details>
                </section>
              )}
              <div className="fact-list">
                {prepared.candidateFacts.map((fact) => (
                  <article key={fact.fieldId}>
                    <span className="fact-check">✓</span>
                    <div><small>{fact.fieldId.replaceAll(".", " · ")}</small><strong>{String(fact.value)}</strong><p>Source: “{fact.sourceText}”</p></div>
                    <em>Proposed</em>
                  </article>
                ))}
              </div>
              {prepared.unknownFields.some((item) => item.fieldId.startsWith("suspect.")) && (
                <div className="unknown-box"><strong>Suspect details not provided</strong>{prepared.unknownFields.filter((item) => item.fieldId.startsWith("suspect.")).map((item) => <span key={item.fieldId}>{item.label}: {item.reason}</span>)}</div>
              )}
              {reviewReadiness && (
                <section className="integrity-gate" aria-labelledby="integrity-gate-title">
                  <div className="integrity-gate-head">
                    <div><span className="step-label">RAPID CASE INTEGRITY GATE</span><h3 id="integrity-gate-title">Fast capture. Precise packet.</h3></div>
                    <strong>{reviewReadiness.readyCount}/{reviewReadiness.requiredCount} checks ready</strong>
                  </div>
                  <div className="integrity-path" aria-label="Integrity gate stages">
                    <span><b>1</b>Citizen source</span><i />
                    <span><b>2</b>Exact duplicate check</span><i />
                    <span><b>3</b>District + route</span><i />
                    <span><b>4</b>Human review</span>
                  </div>
                  <div className="readiness-checks">
                    {reviewReadiness.checks.map((check) => (
                      <article key={check.id} className={`readiness-${check.status.toLowerCase()}`}>
                        <span aria-hidden="true">{check.status === "READY" ? "✓" : check.status === "BOUNDARY" ? "—" : "!"}</span>
                        <div><strong>{check.label}</strong><small>{check.detail}</small></div>
                        <em>{check.owner}</em>
                      </article>
                    ))}
                  </div>
                  <div className="role-chain">
                    <span><b>Citizen</b> supplies and confirms</span>
                    <span><b>AI</b> extracts and proposes</span>
                    <span><b>Review desk</b> checks gaps</span>
                    <span><b>Official systems</b> disconnected</span>
                  </div>
                  <p className="integrity-boundary">Scraped pages, threat feeds, and repository matches remain leads only. They cannot create a case or establish a suspect.</p>
                  <details className="internal-checklist">
                    <summary>Open internal submission-readiness notes</summary>
                    <p>The matrix above checks source ownership, narration, district, route, review status, and financial identifiers. Identity verification and any external filing stay outside this sandbox.</p>
                  </details>
                </section>
              )}
              <label className="review-confirm">
                <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                <span><strong>I reviewed the narration, district, route, and proposed facts.</strong>Save this case to the CyberSaarthi prototype.</span>
              </label>
              <button
                type="button"
                className="button primary"
                disabled={busy || !reviewed || !title.trim() || !district.trim() || (route === "FINANCIAL_FRAUD" && hasFinancialErrors)}
                aria-busy={busy}
                onClick={() => void recordCase()}
              >
                {busy ? "Saving…" : "Save case and get reference"}<span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>

        <aside className="calm-guide">
          <section className="evidence-locker" aria-labelledby="evidence-locker-title">
            <span className="step-label">EVIDENCE ASSISTANT</span>
            <h2 id="evidence-locker-title">Extracted Technical Evidence</h2>
            <p>Drop a synthetic chat, bank-message, or payment screenshot. We find useful identifiers; you confirm every result.</p>
            <label className="evidence-consent">
              <input type="checkbox" checked={evidenceConsent} onChange={(event) => setEvidenceConsent(event.target.checked)} />
              <span>I confirm these are synthetic screenshots and consent to analysis.</span>
            </label>
            <label
              className={`evidence-drop ${evidenceConsent ? "ready" : "locked"}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                acceptEvidenceFiles(event.dataTransfer.files);
              }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  if (event.target.files) acceptEvidenceFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <strong>Drop screenshots or browse</strong>
              <span>PNG, JPEG, WebP · up to 3 · 5 MB each</span>
            </label>
            <div className="evidence-provider">
              {evidenceStatus.configured
                ? "AI screenshot extraction ready"
                : "Working screenshot example ready"}
            </div>
            <div className="evidence-results" aria-live="polite">
              {evidenceUploads.map((upload) => (
                <article className="evidence-upload" key={upload.id}>
                  <div className="evidence-upload-head">
                    {/* The preview remains browser-only and is never sent to persistence. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={upload.previewUrl} alt={`Synthetic evidence preview: ${upload.file.name}`} />
                    <div><strong>{upload.file.name}</strong><span>{upload.state === "ANALYSING" ? "Analysing evidence…" : upload.state === "DONE" ? "Proposals ready" : "Analysis failed"}</span></div>
                    <button className="text-button" type="button" onClick={() => removeEvidence(upload.id)}>Remove</button>
                  </div>
                  {upload.state === "ANALYSING" && <div className="evidence-skeleton"><i /><i /><i /></div>}
                  {upload.state === "ERROR" && (
                    <div className="evidence-error"><span>{upload.error}</span><button type="button" className="text-button" onClick={() => retryEvidence(upload)}>Retry</button></div>
                  )}
                  {upload.result && (
                    <div className="technical-findings">
                      {upload.result.findings.map((finding) => (
                        <label key={finding.fieldId} className={finding.value === null ? "unavailable" : ""}>
                          <input
                            type="checkbox"
                            disabled={finding.value === null}
                            checked={verifiedEvidence.has(`${upload.id}:${finding.fieldId}`)}
                            onChange={(event) => toggleEvidenceVerified(upload.id, finding.fieldId, event.target.checked)}
                          />
                          <span><small>{TECHNICAL_EVIDENCE_LABELS[finding.fieldId]}</small><strong>{finding.value ?? "Not visible"}</strong><em>{finding.sourceText ? `Source: “${finding.sourceText}”` : finding.uncertaintyReason}</em></span>
                          <b>{finding.value === null ? "Unknown" : "Verify"}</b>
                        </label>
                      ))}
                      <p>{upload.result.mode === "OPENAI" ? "AI-proposed result" : "Working demo result"} · confirm before saving</p>
                      <p className="evidence-hash">SHA-256 · {upload.result.checksum.slice(0, 16)}… · file identity only</p>
                    </div>
                  )}
                </article>
              ))}
              {evidenceUploads.length === 0 && <div className="evidence-empty">Add a screenshot to see extracted details here.</div>}
            </div>
          </section>
          <div className="guide-divider" />
          <div className="guide-avatar">CS</div>
          <span className="step-label">ONE STEP AT A TIME</span>
          <h2>You do not need perfect words.</h2>
          <p>CyberSaarthi keeps your original words, labels any working copy, and shows unknowns instead of filling gaps.</p>
          <ol>
            <li><span>1</span><div><strong>Tell</strong><small>Use the agent, type, or dictate</small></div></li>
            <li><span>2</span><div><strong>Review</strong><small>Confirm every proposed fact</small></div></li>
            <li><span>3</span><div><strong>Track</strong><small>Follow the case timeline</small></div></li>
          </ol>
          <div className="privacy-note"><strong>No real data needed</strong><span>Use only the provided example stories and identities.</span></div>
        </aside>
      </div>
    </section>
  );
}

function CaseList({ cases, selectedId, onSelect }: { cases: CaseRecord[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="case-list">
      {cases.map((item) => (
        <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => onSelect(item.id)}>
          <div className="case-list-top"><span>{item.demoReference || item.id}</span><StatusPill status={item.status} /></div>
          <strong>{item.title}</strong>
          <p>{item.reporterName} · {ROUTE_LABELS[item.route] || item.route}</p>
          <small>Updated {formatDate(item.updatedAt)}</small>
        </button>
      ))}
      {cases.length === 0 && <div className="empty-state">No cases yet.</div>}
    </div>
  );
}

function Timeline({ events }: { events: CaseEvent[] }) {
  return (
    <div className="timeline">
      {events.map((event, index) => (
        <article key={event.id}>
          <div className="timeline-rail"><span className={index === 0 ? "latest" : ""} />{index < events.length - 1 && <i />}</div>
          <div><div className="timeline-title"><strong>{event.eventType === "CASE_RECORDED" ? "Case saved" : event.title.replace(/^Synthetic /, "")}</strong><span>{formatDate(event.createdAt)}</span></div><p>{event.description}</p><small>{event.actorLabel.replace(/^Demo /, "")} · {event.actorRole.toLowerCase()}</small></div>
        </article>
      ))}
    </div>
  );
}

function SaarthiGraphPanel({
  item,
  role,
  onAction,
  busy,
}: {
  item: CaseRecord;
  role: Role;
  onAction: CaseActionHandler;
  busy: boolean;
}) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const intelligence = item.intelligence;

  async function reviewRelationshipSignal(
    relationship: RelationshipSignal,
    decision: "CONFIRM_RELATIONSHIP" | "REJECT_RELATIONSHIP",
  ) {
    setReviewingId(relationship.id);
    await onAction(
      decision,
      decision === "CONFIRM_RELATIONSHIP"
        ? "Evaluator confirmed the displayed source-linked relationship for prototype triage."
        : "Evaluator rejected the proposed relationship after reviewing its displayed signals.",
      relationship.id,
    );
    setReviewingId(null);
  }

  return (
    <section className="saarthigraph-panel" aria-labelledby={`saarthigraph-${item.id}`}>
      <header className="saarthigraph-head">
        <div>
          <span className="step-label">SAARTHIGRAPH · PATTERN & RELATIONSHIP INTELLIGENCE</span>
          <h3 id={`saarthigraph-${item.id}`}>Explainable campaign signals</h3>
          <p>{intelligence.boundary}</p>
        </div>
        <span className={intelligence.topology.activeCampaignCandidate ? "campaign-chip active" : "campaign-chip"}>
          {intelligence.topology.activeCampaignCandidate ? "Campaign candidate" : "No campaign cluster"}
        </span>
      </header>

      <div className="topology-metrics" aria-label="Relationship topology summary">
        <article><span>Component size</span><strong>{intelligence.topology.componentSize}</strong><small>Selected case + direct connections</small></article>
        <article><span>Connected cases</span><strong>{intelligence.topology.connectedCaseCount}</strong><small>Proposed or reviewed links</small></article>
        <article><span>Cross-district</span><strong>{intelligence.topology.crossDistrictCount}</strong><small>District is citizen-confirmed</small></article>
        <article><span>Human-confirmed</span><strong>{intelligence.topology.confirmedCount}</strong><small>No automatic accusation</small></article>
      </div>

      <div className="pattern-section">
        <div className="subsection-heading"><h4>Recognised playbooks</h4><span>{intelligence.patterns.length} proposed</span></div>
        {intelligence.patterns.length > 0 ? (
          <div className="pattern-grid">
            {intelligence.patterns.map((pattern) => (
              <article key={pattern.id}>
                <div><strong>{pattern.label}</strong><span className={`signal-status status-${pattern.status.toLowerCase()}`}>{pattern.status}</span></div>
                <p>{pattern.explanation}</p>
                <div className="signal-chips">{pattern.evidence.map((signal) => <span key={signal}>{signal}</span>)}</div>
                <small>{confidenceLabel(pattern.confidence)} · deterministic rules v{pattern.engineVersion}</small>
              </article>
            ))}
          </div>
        ) : <div className="empty-state">No supported scam playbook reached the deterministic signal threshold.</div>}
      </div>

      <div className="relationship-section">
        <div className="subsection-heading"><h4>Relationship topology</h4><span>{intelligence.relationships.length} links</span></div>
        {intelligence.relationships.length > 0 ? (
          <>
            <div className="relationship-map" aria-label="Direct case relationship map">
              <article className="graph-node current"><span>Selected case</span><strong>{item.demoReference || item.id}</strong><small>{item.district || "District unknown"}</small></article>
              <div className="graph-peer-list">
                {intelligence.relationships.map((relationship, index) => (
                  <article className={`graph-node peer relation-${relationship.status.toLowerCase()}`} key={relationship.id}>
                    <span>{role === "EVALUATOR" ? `Connected case ${index + 1}` : "Protected related case"}</span>
                    <strong>{role === "EVALUATOR" ? relationship.peerReference : "Identity hidden"}</strong>
                    <small>{role === "EVALUATOR" ? relationship.peerDistrict || "District unknown" : "Cross-case details are evaluator-only"}</small>
                  </article>
                ))}
              </div>
            </div>
            <div className="relationship-list">
              {intelligence.relationships.map((relationship) => (
                <article key={relationship.id}>
                  <div className="relationship-title">
                    <div><strong>{RELATIONSHIP_LABELS[relationship.relationshipType]}</strong><small>{confidenceLabel(relationship.confidence)} · {relationship.deterministic ? "deterministic" : "probabilistic"}</small></div>
                    <span className={`signal-status status-${relationship.status.toLowerCase()}`}>{relationship.status}</span>
                  </div>
                  {role === "EVALUATOR" && <p><b>{relationship.peerTitle}</b>{relationship.peerDistrict ? ` · ${relationship.peerDistrict}` : ""}</p>}
                  <p>{relationship.explanation}</p>
                  <div className="signal-chips">{relationship.sharedSignals.map((signal) => <span key={signal}>{signal}</span>)}</div>
                  {role === "EVALUATOR" && relationship.status === "PROPOSED" && item.status !== "CLOSED_SETTLED" && (
                    <div className="relationship-actions">
                      <button className="button secondary" disabled={busy || reviewingId === relationship.id} onClick={() => void reviewRelationshipSignal(relationship, "REJECT_RELATIONSHIP")}>Reject link</button>
                      <button className="button primary" disabled={busy || reviewingId === relationship.id} onClick={() => void reviewRelationshipSignal(relationship, "CONFIRM_RELATIONSHIP")}>Confirm for triage</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : <div className="empty-state">No cross-case relationship is currently proposed.</div>}
      </div>

      {role === "CITIZEN" && intelligence.relationships.length > 0 && (
        <div className="privacy-guard"><strong>Your privacy is preserved</strong><span>CyberSaarthi shows only that a relationship may exist. It never reveals another citizen’s case, identity, district, or evidence.</span></div>
      )}
    </section>
  );
}

function CaseDetail({
  item,
  role,
  onAction,
  busy,
}: {
  item: CaseRecord;
  role: Role;
  onAction: CaseActionHandler;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [detailTab, setDetailTab] = useState<"TRACE" | "FACTS" | "TRANSCRIPT" | "INTEGRITY" | "NETWORK" | "SUPPORT">("TRACE");
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [settlementNote, setSettlementNote] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const detailTabs = role === "EVALUATOR"
    ? (["TRACE", "FACTS", "TRANSCRIPT", "INTEGRITY", "NETWORK", "SUPPORT"] as const)
    : (["TRACE", "FACTS", "TRANSCRIPT", "INTEGRITY", "NETWORK"] as const);
  const evidenceChecksums = item.facts.map((fact) => String(fact.checksum ?? "")).filter(Boolean);
  const storedReadiness = buildSubmissionReadiness({
    route: item.route,
    district: item.district,
    narrative: item.narrativeEnglish,
    facts: item.facts,
    evidenceChecksums,
  });

  async function submit(action: string) {
    await onAction(action, note);
    setNote("");
  }

  async function closeAfterSettlement() {
    if (!closeConfirmed) return;
    const result = await onAction(
      "CLOSE_SETTLED",
      settlementNote.trim() || "Citizen confirmed that the reported funds are settled.",
    );
    if (result.updated) {
      setCloseConfirmed(false);
      setSettlementNote("");
    }
  }

  async function deleteClosed() {
    if (!deleteConfirmed) return;
    await onAction("DELETE_CLOSED", "DELETE_CLOSED_CASE");
    setDeleteConfirmed(false);
  }

  async function copyPreparationDraft() {
    try {
      await navigator.clipboard.writeText(buildPreparationDraft(item));
      setDraftStatus("Copied. Review it before using the official portal.");
    } catch {
      setDraftStatus("Copy was blocked by the browser. Use Print / save PDF instead.");
    }
  }

  return (
    <article className="case-detail">
      <div className="case-detail-head">
        <div><span className="case-id">{item.demoReference || item.id}</span><h2>{item.title}</h2><p>{item.reporterName} · narration preserved as entered</p></div>
        <StatusPill status={item.status} />
      </div>
      {item.demoReference && (
        <div className="demo-reference" role="status">
          <span>CyberSaarthi reference</span>
          <strong>{item.demoReference}</strong>
          <small>Saved in this prototype</small>
        </div>
      )}
      <div className="case-summary-grid">
        <div><span>Proposed route</span><strong>{ROUTE_LABELS[item.route] || item.route}</strong></div>
        <div><span>Reported loss</span><strong>{money(item.lossAmount)}</strong></div>
        <div><span>District</span><strong>{item.district || "Needs completion"}</strong></div>
        <div><span>Assigned to</span><strong>{item.assignedTo?.replace(/^Demo /, "") || "Unassigned"}</strong></div>
      </div>
      <div className="detail-tabs" role="tablist">
        {detailTabs.map((value) => <button role="tab" aria-selected={detailTab === value} className={detailTab === value ? "active" : ""} onClick={() => setDetailTab(value)} key={value}>{value === "TRACE" ? "Trace" : value === "FACTS" ? `Facts · ${item.facts.length}` : value === "SUPPORT" ? `Support · ${item.messages.length}` : value === "INTEGRITY" ? "Integrity" : value === "NETWORK" ? `Patterns · ${item.intelligence.relationships.length}` : "Transcript"}</button>)}
      </div>

      {detailTab === "TRACE" && <Timeline events={item.events} />}
      {detailTab === "FACTS" && (
        <div className="stored-facts">
          {item.facts.map((fact, index) => <div key={`${String(fact.fieldId)}-${index}`}><span>{String(fact.label || fact.fieldId)}</span><strong>{String(fact.value)}</strong><small>Source: {String(fact.source || "Reviewed input")}</small></div>)}
          {item.unknowns.length > 0 && <div className="unknown-box"><strong>Suspect details not provided</strong>{item.unknowns.map((unknown, index) => <span key={`${String(unknown.fieldId)}-${index}`}>{String(unknown.label)}: {String(unknown.reason)}</span>)}</div>}
        </div>
      )}
      {detailTab === "TRANSCRIPT" && (
        <div className="transcript-pair">
          <div><span>Original narration</span><p lang={htmlLanguageCode(item.languageCode)}>{item.narrativeNative}</p></div>
          {item.narrativeEnglish.trim() !== item.narrativeNative.trim() && <div><span>English working copy</span><p>{item.narrativeEnglish}</p></div>}
        </div>
      )}
      {detailTab === "INTEGRITY" && (
        <div className="stored-integrity">
          <div className="stored-integrity-grid">
            <article><span>Source gate</span><strong>Passed</strong><small>{caseSourceLabel(item.provider)}</small></article>
            <article><span>Exact duplicate gate</span><strong>Unique when saved</strong><small>Probabilistic similarity never auto-rejects or blacklists.</small></article>
            <article><span>Routing packet</span><strong>{ROUTE_LABELS[item.route] || item.route}</strong><small>{item.district || "District needs citizen confirmation"}</small></article>
            <article><span>Filing checklist</span><strong>{storedReadiness.readyCount}/{storedReadiness.requiredCount} ready</strong><small>Gaps remain explicit; official submission is disconnected.</small></article>
          </div>
          <div className="readiness-checks compact">
            {storedReadiness.checks.map((check) => (
              <article key={check.id} className={`readiness-${check.status.toLowerCase()}`}>
                <span aria-hidden="true">{check.status === "READY" ? "✓" : check.status === "BOUNDARY" ? "—" : "!"}</span>
                <div><strong>{check.label}</strong><small>{check.detail}</small></div>
                <em>{check.owner}</em>
              </article>
            ))}
          </div>
          <div className="role-chain">
            <span><b>Citizen</b> owns the account</span><span><b>AI</b> proposes only</span><span><b>Evaluator</b> reviews</span><span><b>Authority</b> not connected</span>
          </div>
        </div>
      )}
      {detailTab === "NETWORK" && <SaarthiGraphPanel item={item} role={role} onAction={onAction} busy={busy} />}
      {detailTab === "SUPPORT" && (
        <div className="support-thread">
          {item.messages.map((message) => <article key={message.id} className={message.senderRole === role ? "mine" : ""}><div><strong>{supportSenderLabel(message, item.reporterName)}</strong><span>{formatDate(message.createdAt)}</span></div><p>{message.body}</p></article>)}
          {item.messages.length === 0 && <div className="empty-state">No follow-up messages yet.</div>}
        </div>
      )}

      <section className="draft-tools" aria-labelledby={`draft-tools-${item.id}`}>
        <div>
          <span className="step-label">PRE-FILING DRAFT</span>
          <h3 id={`draft-tools-${item.id}`}>Export the reviewed preparation packet</h3>
          <p>No penal section is treated as final. Police or qualified legal counsel determine the applicable law.</p>
        </div>
        <div className="draft-actions">
          <button className="button secondary" type="button" onClick={() => void copyPreparationDraft()}>Copy reviewed draft</button>
          <button className="button secondary" type="button" onClick={() => window.print()}>Print / save PDF</button>
        </div>
        {draftStatus && <p className="draft-status" role="status">{draftStatus}</p>}
        <pre className="print-draft">{buildPreparationDraft(item)}</pre>
      </section>

      {role === "EVALUATOR" && item.status !== "CLOSED_SETTLED" && <div className="case-action-box">
        <label>Reviewer note or support reply<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write a concise request or resolution note…" /></label>
        <div className="action-row">
          <button className="button secondary" disabled={busy} onClick={() => void submit("START_REVIEW")}>Start review</button>
          <button className="button secondary" disabled={busy || !note.trim()} onClick={() => void submit("REQUEST_INFORMATION")}>Request information</button>
          <button className="button primary" disabled={busy} onClick={() => void submit("RESOLVE")}>Mark review complete</button>
          <button className="text-button" disabled={busy || !note.trim()} onClick={() => void submit("SUPPORT_REPLY")}>Send support reply</button>
        </div>
      </div>}
      {role === "EVALUATOR" && item.status === "CLOSED_SETTLED" && <div className="case-closed-note"><strong>Closed by the citizen</strong><span>The reported funds were marked settled. Evaluator actions are locked.</span></div>}

      {role === "CITIZEN" && item.route === "FINANCIAL_FRAUD" && item.status !== "CLOSED_SETTLED" && (
        <section className="case-lifecycle-panel">
          <div><span className="step-label">CASE LIFECYCLE</span><h3>Has the money been settled?</h3><p>Close this case only after your bank or payment provider confirms settlement. This changes CyberSaarthi only; it does not withdraw an official complaint.</p></div>
          <label><input type="checkbox" checked={closeConfirmed} onChange={(event) => setCloseConfirmed(event.target.checked)} /><span>I confirm the reported funds are settled.</span></label>
          <textarea rows={2} value={settlementNote} onChange={(event) => setSettlementNote(event.target.value)} placeholder="Optional settlement note · do not enter OTPs, PINs, or full account numbers" />
          <button className="button secondary" disabled={busy || !closeConfirmed} onClick={() => void closeAfterSettlement()}>Close case · funds settled</button>
        </section>
      )}
      {role === "CITIZEN" && item.status === "CLOSED_SETTLED" && (
        <section className="case-lifecycle-panel closed">
          <div><span className="step-label">CLOSED CASE</span><h3>Funds marked settled</h3><p>The conversation is read-only. You may permanently remove this synthetic case from your account.</p></div>
          <label><input type="checkbox" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} /><span>I understand this permanently deletes the case, trace, and messages from the prototype.</span></label>
          <button className="button danger" disabled={busy || !deleteConfirmed} onClick={() => void deleteClosed()}>Delete closed case</button>
        </section>
      )}
    </article>
  );
}

function CitizenCases({
  cases,
  selectedId,
  setSelectedId,
  onAction,
  busy,
}: {
  cases: CaseRecord[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  onAction: CaseActionHandler;
  busy: boolean;
}) {
  const selected = cases.find((item) => item.id === selectedId) || cases[0];
  return (
    <section className="workspace-card cases-workspace">
      <div className="workspace-title-row"><div><span className="step-label">MY CASES</span><h1>Track every step</h1><p>Open a case to review its reference, timeline, facts, and narration.</p></div></div>
      <div className="case-split"><CaseList cases={cases} selectedId={selected?.id || null} onSelect={setSelectedId} />{selected ? <CaseDetail key={selected.id} item={selected} role="CITIZEN" onAction={onAction} busy={busy} /> : <div className="empty-state large">Save a case to see its trace.</div>}</div>
    </section>
  );
}

function SupportWorkspace({
  cases,
  selectedId,
  setSelectedId,
  onAction,
  busy,
  citizenEmail,
}: {
  cases: CaseRecord[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  onAction: CaseActionHandler;
  busy: boolean;
  citizenEmail: string;
}) {
  const selected = cases.find((item) => item.id === selectedId) || cases[0];
  const [note, setNote] = useState("");
  const [optimisticMessage, setOptimisticMessage] = useState<SupportMessage | null>(null);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [selected?.messages.length, optimisticMessage, awaitingReply]);

  async function sendFollowUp() {
    const outgoing = note.trim();
    if (!outgoing || awaitingReply) return;
    setNote("");
    setOptimisticMessage({
      id: clientMessageId(),
      senderEmail: citizenEmail,
      senderRole: "CITIZEN",
      languageCode: "unknown",
      body: outgoing,
      synthetic: true,
      createdAt: new Date().toISOString(),
    });
    setAwaitingReply(true);
    const result = await onAction("FOLLOW_UP", outgoing);
    if (!result.updated) setNote(outgoing);
    setOptimisticMessage(null);
    setAwaitingReply(false);
  }

  return (
    <section className="workspace-card support-workspace">
      <div className="workspace-title-row"><div><span className="step-label">SUPPORT & FOLLOW-UPS</span><h1>Continue the conversation</h1><p>Add a detail or ask what to do next. CyberSaarthi replies in the language you use.</p></div></div>
      {selected ? <div className="support-layout">
        <aside className="support-case-picker" aria-label="Choose case for support">
          {cases.map((item) => <button key={item.id} disabled={awaitingReply} className={selected.id === item.id ? "selected" : ""} onClick={() => { setOptimisticMessage(null); setSelectedId(item.id); }}><span>{item.demoReference || item.id}</span><strong>{item.title}</strong><small>{item.messages.length} {item.messages.length === 1 ? "message" : "messages"} · {STATUS_LABELS[item.status] || item.status}</small></button>)}
        </aside>
        <div className="support-conversation">
          <header><div><span>{selected.demoReference || selected.id}</span><h2>{selected.title}</h2></div><StatusPill status={selected.status} /></header>
          {selected.status === "INFORMATION_REQUESTED" && <div className="support-request"><strong>More information requested</strong><span>Read the latest desk message below and reply with only the missing detail.</span></div>}
          <div className="support-thread support-chat" aria-live="polite" aria-busy={awaitingReply}>
            {selected.messages.map((message) => <article key={message.id} className={message.senderRole === "CITIZEN" ? "mine" : ""}><div><strong>{supportSenderLabel(message)}</strong><span>{formatDate(message.createdAt)}</span></div><p>{message.body}</p></article>)}
            {optimisticMessage && <article className="mine pending-message"><div><strong>You</strong><span>Sending now</span></div><p>{optimisticMessage.body}</p><small>Added immediately</small></article>}
            {awaitingReply && <article className="assistant-message typing-message"><div><strong>CyberSaarthi</strong><span>Replying</span></div><p><i /><i /><i /><span className="sr-only">CyberSaarthi is writing a reply</span></p><small>Preparing a short, case-aware response</small></article>}
            {selected.messages.length === 0 && !optimisticMessage && <div className="empty-state"><strong>No messages yet</strong><span>You can add a transaction reference, corrected time, or another relevant detail.</span></div>}
            <div ref={chatEnd} />
          </div>
          {selected.status === "CLOSED_SETTLED"
            ? <div className="support-closed"><strong>Conversation closed</strong><span>This case is read-only because the citizen marked the funds settled. Delete it from My cases if it is no longer needed.</span></div>
            : <div className="support-composer"><label htmlFor="support-note">Message CyberSaarthi</label><textarea id="support-note" rows={4} value={note} disabled={awaitingReply} onChange={(event) => setNote(event.target.value)} placeholder="Add a new detail or ask what to do next…" /><div><small>{awaitingReply ? "Preparing a case-aware reply…" : "Your message appears immediately and remains in the case trace."}</small><button type="button" className="button primary" disabled={busy || awaitingReply || !note.trim()} aria-busy={awaitingReply} onClick={() => void sendFollowUp()}>{awaitingReply ? "Replying…" : "Send message"}</button></div></div>}
        </div>
      </div> : <div className="empty-state large">Save a case first, then return here for support and follow-ups.</div>}
    </section>
  );
}

function EvaluatorConsole({
  cases,
  selectedId,
  setSelectedId,
  onAction,
  onReset,
  busy,
  asr,
}: {
  cases: CaseRecord[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  onAction: CaseActionHandler;
  onReset: () => Promise<void>;
  busy: boolean;
  asr: AsrStatus;
}) {
  const selected = cases.find((item) => item.id === selectedId) || cases[0];
  const metrics = useMemo(() => {
    const relationships = new Map<string, RelationshipSignal>();
    const campaigns = new Set<string>();
    for (const item of cases) {
      for (const relationship of item.intelligence.relationships) relationships.set(relationship.id, relationship);
      if (item.intelligence.topology.activeCampaignCandidate) {
        for (const pattern of item.intelligence.patterns) campaigns.add(pattern.code);
      }
    }
    return {
      total: cases.length,
      pending: cases.filter((item) => !["SYNTHETIC_RESOLVED", "CLOSED_SETTLED"].includes(item.status)).length,
      followUps: cases.filter((item) => item.status === "FOLLOW_UP_RECEIVED" || item.status === "INFORMATION_REQUESTED").length,
      graphLinks: relationships.size,
      campaigns: campaigns.size,
    };
  }, [cases]);

  return (
    <main className="evaluator-shell" id="main-content">
      <SyntheticBanner />
      <section className="evaluator-heading">
        <div><span className="step-label">EVALUATOR CONSOLE</span><h1>Working prototype evidence</h1><p>Exercise both roles, inspect persisted trace events, and reset the synthetic dataset at any time.</p></div>
        <button className="button secondary" disabled={busy} onClick={() => void onReset()}>Reset synthetic data</button>
      </section>
      <section className="metric-grid">
        <article><span>Cases</span><strong>{metrics.total}</strong><small>Persisted in mock backend</small></article>
        <article><span>Open review</span><strong>{metrics.pending}</strong><small>Prototype statuses only</small></article>
        <article><span>Follow-ups</span><strong>{metrics.followUps}</strong><small>Role-checked actions</small></article>
        <article><span>Graph links</span><strong>{metrics.graphLinks}</strong><small>Explainable proposals</small></article>
        <article><span>Campaigns</span><strong>{metrics.campaigns}</strong><small>Human review required</small></article>
        <article><span>Voice language</span><strong>Auto</strong><small>Detected from every recording</small></article>
      </section>
      <section className="evaluator-grid">
        <div className="evaluator-main"><div className="section-heading"><div><span className="step-label">SYNTHETIC CASE QUEUE</span><h2>Review desk</h2></div><span>{cases.length} records</span></div><div className="case-split evaluator-case-split"><CaseList cases={cases} selectedId={selected?.id || null} onSelect={setSelectedId} />{selected && <CaseDetail key={selected.id} item={selected} role="EVALUATOR" onAction={onAction} busy={busy} />}</div></div>
        <aside className="evidence-panel">
          <span className="step-label">UNIFIED OPERATIONS MODULE</span><h2>Rapid Case Integrity + SaarthiGraph</h2>
          <div className="graph-overview">
            <div><strong>Pattern recognition</strong><span>Rule-based scam playbooks explain every matched signal.</span></div>
            <div><strong>Relationship topology</strong><span>Keyed fingerprints connect cases without storing raw identifiers in the graph index.</span></div>
            <div><strong>Human decision gate</strong><span>Evaluators confirm or reject links; no score establishes a suspect or official outcome.</span></div>
          </div>
          <div className="evidence-item"><span className="evidence-ok">1</span><div><strong>Golden-hour path</strong><p>Urgent 1930 and bank guidance runs in parallel with preparation; no model call blocks the initial route.</p></div></div>
          <div className="evidence-item"><span className="evidence-ok">2</span><div><strong>Evidence integrity</strong><p>Images receive SHA-256 file fingerprints; extracted values stay proposed until citizen confirmation.</p></div></div>
          <div className="evidence-item"><span className="evidence-ok">3</span><div><strong>Duplicate and source gate</strong><p>Race-safe exact signatures block duplicate saves. Scraped or repository data cannot create a case.</p></div></div>
          <div className="evidence-item"><span className="evidence-ok">4</span><div><strong>Jurisdiction packet</strong><p>Citizen-confirmed district and proposed top-level route travel together without inferring a police station.</p></div></div>
          <div className="evidence-item"><span className="evidence-ok">5</span><div><strong>Quality before authority</strong><p>Anonymous or unverifiable external leads are not converted into claims; AI never auto-blacklists.</p></div></div>
          <div className="evidence-item"><span className="evidence-ok">✓</span><div><strong>Mocked backend</strong><p>Cases, events, and support messages persist in the site’s own D1 database.</p></div></div>
          <div className="evidence-item"><span className="evidence-ok">✓</span><div><strong>Functional role auth</strong><p>Signed HttpOnly sessions; citizen and evaluator APIs enforce permissions server-side.</p></div></div>
          <div className="evidence-item"><span className="evidence-ok">✓</span><div><strong>Voice-first intake</strong><p>Automatic language detection, four guided turns, natural playback, direct transcription, district capture, and transcript review.</p></div></div>
          <div className="evidence-item"><span className={asr.configured ? "evidence-ok" : "evidence-demo"}>{asr.configured ? "✓" : "D"}</span><div><strong>Live speech boundary</strong><p>{asr.configured ? "Live transcription, translation, and language-aware playback are configured server-side." : "A working auto-detect example remains available while live transcription is unavailable."}</p></div></div>
          <div className="evidence-item"><span className="evidence-off">×</span><div><strong>Government systems</strong><p>Intentionally disconnected. No NCRP simulator, automatic FIR, or official logo.</p></div></div>
          <div className="schema-proof"><strong>OpenAI Structured Outputs adapter</strong><span>All properties required</span><span>Nullable unknowns</span><span>additionalProperties: false</span><span>strict: true</span></div>
          <details className="hackathon-alignment">
            <summary>Build What Moves India alignment</summary>
            <ul>
              <li>Rapid local response: safety guidance renders before model-assisted preparation.</li>
              <li>Zero-friction reporting: voice, typing, synthetic evidence, and one-click judge access converge on one reviewed record.</li>
              <li>Community defence: explainable cross-case patterns support human review without blacklisting or exposing identities.</li>
            </ul>
          </details>
        </aside>
      </section>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [asr, setAsr] = useState<AsrStatus>({ configured: false, model: "saaras:v3", syntheticFixtureAvailable: true, autoDetect: true, supportedLanguageCount: 23, maxRecordingSeconds: 28 });
  const [tts, setTts] = useState<TtsStatus>({ configured: false, model: "bulbul:v3", autoVoiceLanguage: true, supportedLanguageCount: 23, maxCharacters: 650 });
  const [evidenceStatus, setEvidenceStatus] = useState<EvidenceStatus>({
    configured: false,
    provider: "OpenAI",
    model: "gpt-4o-2024-08-06",
    deterministicMockAvailable: true,
    syntheticOnly: true,
  });
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<CitizenTab>("NEW");
  const [initialising, setInitialising] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const purgeInMemory = useCallback(() => {
    setSession(null);
    setCases([]);
    setSelectedId(null);
    setTab("NEW");
    setError("");
    setBusy(false);
  }, []);

  const refreshCases = useCallback(async () => {
    const payload = await readJson<{ cases: CaseRecord[] }>(await fetch("/api/cases", { cache: "no-store" }));
    setCases(payload.cases);
    setSelectedId((current) => current && payload.cases.some((item) => item.id === current) ? current : payload.cases[0]?.id || null);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [statusResponse, ttsResponse, evidenceResponse, sessionResponse] = await Promise.all([
          fetch("/api/asr", { cache: "no-store" }),
          fetch("/api/tts", { cache: "no-store" }),
          fetch("/api/evidence/analyse", { cache: "no-store" }),
          fetch("/api/auth/session", { cache: "no-store" }),
        ]);
        const status = await readJson<AsrStatus>(statusResponse);
        const voice = await readJson<TtsStatus>(ttsResponse);
        const vision = await readJson<EvidenceStatus>(evidenceResponse);
        if (active) setAsr(status);
        if (active) setTts(voice);
        if (active) setEvidenceStatus(vision);
        if (sessionResponse.ok) {
          const payload = await readJson<{ session: Session }>(sessionResponse);
          if (active) {
            await refreshCases();
            setSession(payload.session);
          }
        }
      } catch {
        // Login remains available even when an optional provider status check fails.
      } finally {
        if (active) setInitialising(false);
      }
    })();
    return () => { active = false; };
  }, [refreshCases]);

  async function login(email: string, password: string) {
    setBusy(true);
    setError("");
    try {
      const payload = await readJson<{ session: Session }>(await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }));
      await refreshCases();
      setSession(payload.session);
      setTab("NEW");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function judgeLogin() {
    setBusy(true);
    setError("");
    try {
      const payload = await readJson<{ session: Session }>(await fetch("/api/auth/judge-session", {
        method: "POST",
      }));
      await refreshCases();
      setSession(payload.session);
      setTab("NEW");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Judge Test Mode could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
      setCases([]);
      setSelectedId(null);
      setError("");
    }
  }

  async function caseAction(action: string, note: string, relationshipId?: string): Promise<CaseActionResponse> {
    if (!selectedId) return { updated: false, synthetic: true };
    setBusy(true);
    setError("");
    try {
      const payload = await readJson<CaseActionResponse>(await fetch("/api/cases/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: selectedId, action, note, relationshipId, languageCode: "unknown" }),
      }));
      await refreshCases();
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be completed.");
      return { updated: false, synthetic: true };
    } finally {
      setBusy(false);
    }
  }

  async function recorded(caseId: string) {
    await refreshCases();
    setSelectedId(caseId);
    setTab("CASES");
  }

  async function reset() {
    setBusy(true);
    setError("");
    try {
      await readJson(await fetch("/api/demo/reset", { method: "POST" }));
      await refreshCases();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The synthetic data could not be reset.");
    } finally {
      setBusy(false);
    }
  }

  if (initialising) return <main className="loading-screen" id="main-content"><Brand /><div className="loading-line"><span /></div><p>Opening CyberSaarthi…</p></main>;
  if (!session) return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <LoginScreen onLogin={login} onJudgeLogin={judgeLogin} busy={busy} error={error} />
      <QuickExitButton onPurge={purgeInMemory} />
    </>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <QuickExitButton onPurge={purgeInMemory} />
      <AppHeader session={session} onLogout={logout} />
      {session.role === "CITIZEN" ? (
        <div className="citizen-layout">
          <CitizenNavigation tab={tab} setTab={setTab} caseCount={cases.length} />
          <main className="citizen-main" id="main-content">
            <SyntheticBanner />
            {error && <p className="global-error" role="alert">{error}</p>}
            {tab === "NEW" && <IntakeWorkspace asr={asr} tts={tts} evidenceStatus={evidenceStatus} onRecorded={recorded} />}
            {tab === "CASES" && <CitizenCases cases={cases} selectedId={selectedId} setSelectedId={setSelectedId} onAction={caseAction} busy={busy} />}
            {tab === "SUPPORT" && <SupportWorkspace cases={cases} selectedId={selectedId} setSelectedId={setSelectedId} onAction={caseAction} busy={busy} citizenEmail={session.email} />}
          </main>
        </div>
      ) : (
        <><EvaluatorConsole cases={cases} selectedId={selectedId} setSelectedId={setSelectedId} onAction={caseAction} onReset={reset} busy={busy} asr={asr} />{error && <p className="global-error evaluator-error" role="alert">{error}</p>}</>
      )}
      <footer className="app-footer"><span>CyberSaarthi · Independent hackathon prototype · Synthetic data only</span><div><span>Internal safety workflows</span><span>No outbound filing</span><span>Resettable demo</span></div></footer>
    </div>
  );
}
