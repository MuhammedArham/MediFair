"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, X } from "lucide-react";
import { decideDraftAction, personaliseDraftAction, saveDraftAction } from "./actions";

type CardData = {
  providerId: string; practiceName: string; recipientEmail: string; sourceType: string;
  requestId: string | null; version: number | null; status: string; subject: string; body: string;
};

const fieldStyle = "mt-1.5 w-full rounded-lg border border-[#cdded2] bg-white px-3 py-2.5 text-sm text-[#173d39] focus:border-[#337758] focus:outline-none focus:ring-2 focus:ring-[#bcead0]";

function QuoteDraftCard({ caseId, aiAvailable, initial }: { caseId: string; aiAvailable: boolean; initial: CardData }) {
  const router = useRouter();
  const [draft, setDraft] = useState({ subject: initial.subject, body: initial.body });
  const [saved, setSaved] = useState({ subject: initial.subject, body: initial.body });
  const [status, setStatus] = useState(initial.status);
  const [version, setVersion] = useState(initial.version);
  const [message, setMessage] = useState("");
  const [approvedExact, setApprovedExact] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = draft.subject !== saved.subject || draft.body !== saved.body;
  const locked = !changed && ["SENT", "SIMULATED", "FAILED"].includes(status);
  const displayStatus = changed ? "CHANGES NOT SAVED" : status;

  function edit(key: "subject" | "body", value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setApprovedExact(false);
    setMessage("");
  }

  function applyResult(result: { id: string; status: string; version: number; subject: string; body: string; message: string }) {
    setDraft({ subject: result.subject, body: result.body });
    setSaved({ subject: result.subject, body: result.body });
    setStatus(result.status);
    setVersion(result.version);
    setMessage(result.message);
    setApprovedExact(false);
  }

  function save() {
    startTransition(async () => {
      const result = await saveDraftAction(caseId, initial.providerId, draft);
      if (result.ok) applyResult(result); else setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  function decide(decision: "APPROVE" | "REJECT") {
    startTransition(async () => {
      const result = await decideDraftAction(caseId, initial.providerId, draft, decision);
      if (result.ok) applyResult(result); else setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  function personalise() {
    startTransition(async () => {
      const result = await personaliseDraftAction(caseId, initial.providerId);
      if (result.ok) {
        setDraft(result.draft);
        setApprovedExact(false);
      }
      setMessage(result.message);
    });
  }

  return <article className="rounded-2xl border border-[#dce8df] bg-white p-5 shadow-sm sm:p-7" aria-labelledby={`practice-${initial.providerId}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.15em] text-[#468066]">{initial.sourceType === "DEMO" ? "FICTIONAL DEMO PRACTICE" : "USER-VERIFIED CONTACT"}</p><h2 id={`practice-${initial.providerId}`} className="mt-1 font-serif text-2xl text-[#173d39]">{initial.practiceName}</h2></div><span className="badge">{displayStatus.replaceAll("_", " ").toLowerCase()}{version ? ` · v${version}` : ""}</span></div>
    <div className="mt-5 grid gap-4"><div><label htmlFor={`recipient-${initial.providerId}`} className="block text-xs font-semibold text-[#325848]">Recipient — fixed to the selected practice</label><input id={`recipient-${initial.providerId}`} readOnly value={initial.recipientEmail} className={`${fieldStyle} bg-[#f4f8f4]`} /></div><div><label htmlFor={`subject-${initial.providerId}`} className="block text-xs font-semibold text-[#325848]">Subject shared with practice</label><input id={`subject-${initial.providerId}`} value={draft.subject} onChange={(event) => edit("subject", event.target.value)} readOnly={locked} maxLength={180} className={fieldStyle} /></div><div><label htmlFor={`body-${initial.providerId}`} className="block text-xs font-semibold text-[#325848]">Full message shared with practice</label><textarea id={`body-${initial.providerId}`} value={draft.body} onChange={(event) => edit("body", event.target.value)} readOnly={locked} maxLength={12000} rows={24} className={`${fieldStyle} min-h-[28rem] resize-y leading-6`} /></div></div>
    <p className="mt-3 text-xs leading-5 text-[#687e6d]">Only the recipient, subject and message shown above are part of this request. No attachments, membership numbers or medical records are included. Editing and approval do not send email.</p>
    {aiAvailable && <button type="button" onClick={personalise} disabled={pending || locked} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#246b50] underline disabled:opacity-50"><Sparkles size={14} aria-hidden="true" />Try an AI-selected opening</button>}
    <label className="mt-5 flex items-start gap-3 rounded-lg bg-[#f1f8f2] p-3 text-sm leading-5 text-[#365a45]"><input type="checkbox" checked={approvedExact} onChange={(event) => setApprovedExact(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#276b54]" /><span>I have reviewed this exact recipient, subject and full message and approve this draft for this practice. I understand this does not send it.</span></label>
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={save} disabled={pending || locked || (!changed && status !== "UNSAVED" && status !== "REJECTED")} className="button button-primary disabled:cursor-not-allowed disabled:opacity-45">Save draft</button><button type="button" onClick={() => decide("APPROVE")} disabled={pending || locked || !approvedExact || (!changed && status === "APPROVED")} className="button button-primary disabled:cursor-not-allowed disabled:opacity-45"><Check size={16} aria-hidden="true" />Approve this draft</button><button type="button" onClick={() => decide("REJECT")} disabled={pending || locked || (!changed && status === "REJECTED")} className="inline-flex items-center gap-2 rounded-lg border border-[#d5deda] px-4 py-2.5 text-sm font-semibold text-[#5c665f] disabled:opacity-45"><X size={16} aria-hidden="true" />Reject</button></div>
    <p role="status" aria-live="polite" className="mt-3 text-xs font-medium text-[#456e55]">{pending ? "Saving decision…" : message || (changed ? "Edits need saving or a new approval." : status === "SIMULATED" ? "Simulated locally; no email was sent or delivered." : status === "SENT" ? "Submitted to Resend; delivery is tracked above." : status === "FAILED" ? "Delivery or sending failed; review the outcome above." : status === "APPROVED" ? "Approved exact draft; not yet sent." : status === "REJECTED" ? "Rejected; no email sent." : status === "UNSAVED" ? "Template ready to review; not yet saved." : "Saved draft; no email sent.")}</p>
  </article>;
}

export function QuoteDraftCards({ caseId, aiAvailable, drafts }: { caseId: string; aiAvailable: boolean; drafts: CardData[] }) {
  return <div className="space-y-6">{drafts.map((draft) => <QuoteDraftCard key={`${draft.providerId}:${draft.requestId}:${draft.status}`} caseId={caseId} aiAvailable={aiAvailable} initial={draft} />)}</div>;
}
