"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendApprovedRequestsAction } from "./send-actions";

type Row = { providerId: string; practiceName: string; status: string; message: string; providerMessageId?: string; recipientEmail?: string; fromEmail?: string; replyToEmail?: string };

export function SendPanel({ caseId, configurationMissing, initialRows, transportMode }: { caseId: string; configurationMissing: string[]; initialRows: Row[]; transportMode: "mock" | "resend" }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const configured = configurationMissing.length === 0;

  function send() {
    startTransition(async () => {
      const result = await sendApprovedRequestsAction(caseId, confirmed);
      if (result.ok) {
        setRows((current) => result.outcomes.map((outcome) => ({ ...current.find((row) => row.providerId === outcome.providerId), ...outcome })));
        setConfirmed(false);
        router.refresh();
      } else setError(result.message);
    });
  }

  return <section className="mb-6 rounded-2xl border border-[#b9d9c5] bg-[#f4faf5] p-5 shadow-sm sm:p-7" aria-labelledby="send-heading">
    <p className="text-[11px] font-bold uppercase tracking-[.15em] text-[#468066]">Outbound requests</p>
    <h2 id="send-heading" className="mt-1 font-serif text-2xl text-[#173d39]">Send approved requests</h2>
    <p className="mt-2 text-sm leading-6 text-[#567363]">{transportMode === "mock" ? "This creates a simulated outbound message in the local database; it does not send or deliver email." : "This action sends only separately approved messages. Each practice has its own result. A Resend acceptance is not a delivery confirmation."}</p>
    {!configured && <p className="mt-4 rounded-lg border border-[#e7d6b9] bg-[#fff9ef] p-3 text-sm text-[#79552d]"><strong>Configuration required.</strong> Add {configurationMissing.join(", ")} to your local environment file and verify the sending domain in Resend. No email can be sent yet.</p>}
    {configured && transportMode === "resend" && <p className="mt-4 text-xs leading-5 text-[#5a765e]">The configured From domain is checked with Resend when you press Send. Recipient and exact approval are rechecked on the server.</p>}
    <ol className="mt-5 grid gap-3 sm:grid-cols-3">{rows.map((row) => <li key={row.providerId} className="rounded-xl border border-[#d9e8db] bg-white p-4"><h3 className="text-sm font-semibold text-[#214b39]">{row.practiceName}</h3><span className="badge mt-2">{row.status.replaceAll("_", " ").toLowerCase()}</span><p className="mt-2 text-xs leading-5 text-[#607367]">{row.message}</p><dl className="mt-3 space-y-1 break-all text-[11px] text-[#607367]"><div><dt className="inline font-semibold">To: </dt><dd className="inline">{row.recipientEmail ?? "—"}</dd></div>{row.fromEmail && <div><dt className="inline font-semibold">From: </dt><dd className="inline">MediFair AI &lt;{row.fromEmail}&gt;</dd></div>}{row.replyToEmail && <div><dt className="inline font-semibold">Reply-To: </dt><dd className="inline">{row.replyToEmail}</dd></div>}</dl>{row.providerMessageId && <p className="mt-2 break-all text-[11px] text-[#7a8b7d]">{transportMode === "mock" ? "Simulation ID" : "Resend ID"}: {row.providerMessageId}</p>}</li>)}</ol>
    <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-[#315942]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-[#276b54]" /><span>{transportMode === "mock" ? "I want to create simulated messages for these approved drafts. No email will be sent." : "I want to send the approved messages now. I understand that this sends real email to eligible, allowlisted test recipients."}</span></label>
    <button type="button" onClick={send} disabled={!configured || !confirmed || pending || !rows.some((row) => row.status === "APPROVED" || row.status === "READY")} className="button button-primary mt-4 disabled:cursor-not-allowed disabled:opacity-45"><Send size={16} aria-hidden="true" />{pending ? "Sending…" : "Send approved requests"}</button>
    {error && <p role="alert" className="mt-3 text-xs text-[#a23a31]">{error}</p>}
  </section>;
}
