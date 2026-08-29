import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("./cloudflare-loader.mjs", import.meta.url), import.meta.url);

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders the production page without development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin");
  assert.doesNotMatch(await response.text(), developmentPreviewMeta);
});

test("keeps citizen UI language-generic and support-chat ready", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /Speak in your own language/);
  assert.match(source, /Continue the conversation/);
  assert.match(source, /CyberSaarthi is writing a reply/);
  assert.match(source, /Rapid Case Integrity \+ SaarthiGraph/);
  assert.match(source, /SAARTHIGRAPH · PATTERN & RELATIONSHIP INTELLIGENCE/);
  assert.match(source, /Confirm for triage/);
  assert.match(source, /Your privacy is preserved/);
  assert.match(source, /Scraped pages, threat feeds, and repository matches remain leads only/);
  assert.match(source, /Close case · funds settled/);
  assert.match(source, /Delete closed case/);
  assert.match(source, /Did money move in the last two hours/);
  assert.match(source, /Citizen-checked screenshot time/);
  assert.match(source, /Confirm & use this time/);
  assert.doesNotMatch(source, /No · earlier/);
  assert.doesNotMatch(source, /continue-reporting-banner/);
  assert.match(source, /Dictation added to Your narration/);
  assert.match(source, /Speak reply/);
  assert.match(source, /Stop & use reply/);
  assert.match(source, /Stop & add to narration/);
  assert.match(source, /startRecording\("AGENT_REPLY"\)/);
  assert.match(source, /startRecording\("NARRATION"\)/);
  assert.match(source, /Quick exit/);
  assert.match(source, /Copy reviewed draft/);
  assert.match(source, /STRUCTURED FINANCIAL DETAILS/);
  assert.match(source, /\/api\/prepare-fields/);
  assert.match(source, /Every value stays editable and requires your review/);
  assert.match(source, /No penal section is treated as final/);
  assert.match(source, /Simulation only · no call or report was sent/);
  assert.match(source, /className="button primary full"[^>]*onClick=\{\(\) => void onJudgeLogin\(\)\}/);
  assert.match(source, /className="button primary"[^>]*onClick=\{\(\) => void startVoiceAgent\(\)\}/);
  assert.match(source, /className="button primary prepare-button"/);
  assert.match(source, /Save case and get reference/);
  assert.match(source, /className="button primary"[^>]*onClick=\{\(\) => void sendFollowUp\(\)\}/);
  assert.match(source, /className=\{`button secondary safety-simulation-button/);
  assert.doesNotMatch(source, /MinimalAction|structural-mic|arrow-action|MicrophoneIcon|UpArrowIcon/);
  assert.match(source, /INDIAN_BANK_CATALOG/);
  assert.match(source, /citizenEmail=\{session\.email\}/);
  assert.match(source, /cybersaarthi-mark\.png/);
  assert.doesNotMatch(source, /href="(?:https?:\/\/|tel:)/);
  assert.doesNotMatch(source, /cybercrime\.gov\.in|buildwhatmovesindia\.com/);
  assert.doesNotMatch(source, /const DEMO_ACCOUNTS/);
  assert.match(layout, /favicon\.ico/);
  assert.match(styles, /\.safety-simulation-button\.compact\s*\{[^}]*min-height:\s*44px;/s);
  assert.doesNotMatch(styles, /\.minimal-action|\.structural-mic|\.arrow-action/);
  assert.doesNotMatch(source, /Hindi|Hinglish|Kannada|English \(India\)/);
  assert.doesNotMatch(source, /id="intake-language"/);
});
