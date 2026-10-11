"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { simulateNegotiationReplyAction } from "./actions";

type Option = { id: string; providerName: string; requestSubject: string; status: string; caseId: string };
type Template = { id: string; label: string; body: string };
export function NegotiationSimulator({ options, templates }: { options: Option[]; templates: Template[] }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
  const [negotiationId, setNegotiationId] = useState(options[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? ""); const [body, setBody] = useState(templates[0]?.body ?? "");
  function submit(formData: FormData) { start(async () => { const result = await simulateNegotiationReplyAction(formData); setMessage(result.message); if (result.ok) router.refresh(); }); }
  return <form action={submit} className="mt-5 grid max-w-3xl gap-4 rounded-2xl border border-[#dce8df] bg-white p-5 sm:p-7"><h2 className="font-serif text-2xl">Simulate a negotiation response</h2><p className="text-xs text-[#65786a]">Choose an approved request already in the simulated outbox. Edited replies are stored, then flagged for manual review unless they exactly match a synthetic fixture.</p>
    <label className="grid gap-2 text-sm font-medium">Pending fictional negotiation<select name="negotiationId" value={negotiationId} onChange={(event) => setNegotiationId(event.target.value)} className="rounded-lg border border-slate-300 p-3">{options.map((item) => <option key={item.id} value={item.id}>{item.providerName} · {item.requestSubject} · {item.status}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-medium">Synthetic outcome<select name="templateId" value={templateId} onChange={(event) => { const next = event.target.value; setTemplateId(next); setBody(templates.find((item) => item.id === next)?.body ?? ""); }} className="rounded-lg border border-slate-300 p-3">{templates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-medium">Provider reply (editable)<textarea name="body" rows={9} required value={body} onChange={(event) => setBody(event.target.value)} className="rounded-lg border border-slate-300 p-3 text-sm leading-6" /></label>
    <button className="button button-primary w-fit" disabled={pending || !negotiationId}>{pending ? "Simulating…" : "Simulate Provider Reply"}</button>{message && <p role="status" className="text-sm">{message} <a href={`/inbox?case=${options.find((item) => item.id === negotiationId)?.caseId ?? "demo-case"}`} className="text-[#276b50] underline">View inbox</a></p>}
  </form>;
}
