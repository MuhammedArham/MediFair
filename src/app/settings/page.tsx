import Link from "next/link";
import { connection } from "next/server";
import { headers } from "next/headers";
import { PageHeading } from "@/components/page-elements";
import { serviceStatus } from "@/lib/service-status";
import { ResetDemo } from "./reset-demo";
import { emailSimulatorAllowed } from "@/lib/email/dev-simulator-gate";
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  await connection(); const mode = serviceStatus(); const { case: caseId = "demo-case" } = await searchParams;
  const simulatorEnabled = emailSimulatorAllowed((await headers()).get("host"));
  return <><PageHeading eyebrow="DEVELOPER SETTINGS" title="Services and demo tools" description="The complete synthetic workflow runs locally without external credentials." />
    <div className="grid gap-5 lg:grid-cols-2"><section className="workspace-panel"><h2>Service status</h2><dl className="status-list"><div><dt>EMAIL_TRANSPORT</dt><dd>{mode.email}</dd></div><div><dt>AI_PROVIDER</dt><dd>{mode.ai}</dd></div><div><dt>DEMO_MODE</dt><dd>{String(mode.demo)}</dd></div><div><dt>PostgreSQL</dt><dd>{mode.databaseReady ? "Configured" : "Configuration required"}</dd></div><div><dt>Document storage</dt><dd>{mode.storageMode}: {mode.storageReady ? "configured" : "configuration required"}</dd></div><div><dt>Workspace gate</dt><dd>{mode.accessReady ? "Configured" : "Configuration required"}</dd></div></dl>
    {!mode.valid && <p role="alert">Invalid provider configuration. No automatic fallback is available.</p>}
    <p className="mt-4">{mode.email === "mock" ? "MOCK EMAIL: messages are stored locally and labelled simulated. Nothing is externally delivered." : mode.emailMissing.length ? `Configuration required: ${mode.emailMissing.join(", ")}.` : "Resend settings present. Domain verification and provider connectivity have not been verified; sending performs server checks."}</p>
    {mode.email !== "mock" && mode.emailTestMode && <p className="mt-3">Restricted Resend test sender: only the configured account inbox may receive test messages. This does not verify a custom domain or enable sending to specialist practices.</p>}
    <p className="mt-3">{mode.ai === "mock" ? "SIMULATED AI: checked-in fixtures only; unfamiliar content needs manual review." : mode.aiMissing.length ? `Configuration required: ${mode.aiMissing.join(", ")}.` : "OpenAI settings present. Model access and live extraction have not been verified."}</p>
    <p className="mt-3">Future service configuration belongs in the ignored <code>.env.local</code> file at the project root. Restart after changing it. No secret values are displayed here.</p></section>
    <section className="workspace-panel"><h2>Continue a demo</h2><p>Approve a request and simulate sending it before adding a provider reply. Modified, unfamiliar replies visibly require manual review.</p><div className="mt-5 flex flex-wrap gap-3">{simulatorEnabled && <Link className="button button-primary" href={`/dev/email-simulator?case=${caseId}`}>Open email simulator</Link>}<Link className="button" href={`/documents?case=${caseId}`}>Analyse synthetic PDFs</Link></div><p className="mt-4">This is a fictional single-operator workspace. Real services never silently fall back to mock mode.</p></section></div>
    <div className="mt-5">{simulatorEnabled && mode.email === "mock" && mode.ai === "mock" && <ResetDemo />}</div></>;
}
