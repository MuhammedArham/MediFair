"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetDemoAction } from "./actions";
export function ResetDemo() {
  const [confirmed, setConfirmed] = useState(false); const [message, setMessage] = useState("");
  const [pending, start] = useTransition(); const router = useRouter();
  return <section className="workspace-panel"><h2>Reset the sample case</h2><p>Restore Alex’s fictional case, the three sample quotes and initial negotiation state. Only records belonging to the seeded sample case are cleared. Cases you created are preserved.</p><label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm I want to reset the sample case and delete its uploaded PDFs.</label><button className="button button-primary mt-4" disabled={!confirmed || pending} onClick={() => start(async () => { const result = await resetDemoAction(confirmed); setMessage(result.message); if (result.ok) { setConfirmed(false); router.refresh(); } })}>{pending ? "Resetting…" : "Reset Demo"}</button><p role="status" className="mt-3 text-sm">{message}</p></section>;
}
