"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { simulateReplyAction } from "./actions";

type Option = { providerId: string; practiceName: string; caseId: string; threadId: string | null; requestStatus: string; subject: string };
type Template = { id: string; label: string; body: string };

export function SimulatorForm({ options, templates }: { options: Option[]; templates: Template[] }) {
  const router = useRouter();
  const [providerId, setProviderId] = useState(options[0]?.providerId ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [body, setBody] = useState(templates[0]?.body ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = options.find((option) => option.providerId === providerId);
  function chooseTemplate(id: string) { setTemplateId(id); setBody(templates.find((item) => item.id === id)?.body ?? ""); }
  function submit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      const result = await simulateReplyAction(formData);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  return <form action={submit} className="grid max-w-3xl gap-5 rounded-2xl border border-[#dce8df] bg-white p-5 sm:p-7">
    <input type="hidden" name="caseId" value={selected?.caseId ?? ""} />
    <label className="grid gap-2 text-sm font-medium">Fictional specialist practice
      <select aria-label="Fictional specialist practice" name="providerId" value={providerId} onChange={(event) => setProviderId(event.target.value)} className="rounded-lg border border-slate-300 bg-white p-3">{options.map((option) => <option key={option.providerId} value={option.providerId}>{option.practiceName} · {option.requestStatus}</option>)}</select>
    </label>
    <section className="rounded-lg bg-slate-50 p-4 text-sm"><strong>Outgoing request thread</strong><p className="mt-1">{selected?.subject}</p><p className="mt-2 text-xs text-slate-600">Thread: {selected?.threadId ?? "not available"}</p></section>
    <label className="grid gap-2 text-sm font-medium">Synthetic response template
      <select name="templateId" value={templateId} onChange={(event) => chooseTemplate(event.target.value)} className="rounded-lg border border-slate-300 bg-white p-3">{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select>
    </label>
    <label className="grid gap-2 text-sm font-medium">Reply body (editable)
      <textarea name="body" required minLength={1} maxLength={200000} rows={9} value={body} onChange={(event) => setBody(event.target.value)} className="rounded-lg border border-slate-300 p-3 text-sm leading-6" />
    </label>
    <button type="submit" disabled={pending || !selected?.threadId} className="button button-primary justify-center disabled:opacity-50">{pending ? "Adding simulated reply…" : "Simulate Provider Reply"}</button>
    {message && <p role="status" className="text-sm text-[#315942]">{message} <a className="underline" href={`/inbox?case=${selected?.caseId}`}>View inbox</a></p>}
  </form>;
}
