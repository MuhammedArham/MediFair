"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBillOpportunityAction, deleteDocumentAction, seedDocumentsAction, startBillNegotiationAction, uploadDocumentAction } from "./actions";

const inputClass = "w-full rounded-lg border border-[#cbdccf] bg-white px-3 py-2 text-sm text-[#173d39] focus:outline-none focus:ring-2 focus:ring-[#95c8a2]";
const types = [
  ["SPECIALIST_ESTIMATE", "Specialist fee estimate"], ["HOSPITAL_QUOTE", "Hospital quote"], ["ANAESTHETIST_QUOTE", "Anaesthetist quote"],
  ["FINAL_INVOICE", "Final invoice"], ["BENEFIT_STATEMENT", "Medicare or insurer benefit statement"], ["PREVIOUS_ESTIMATE", "Previous estimate"],
] as const;

export function DocumentUploadPanel({ caseId, providers }: { caseId: string; providers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(formData: FormData) {
    startTransition(async () => { const result = await uploadDocumentAction(formData); setMessage(result.message); if (result.ok) router.refresh(); });
  }
  function seed() {
    startTransition(async () => { const result = await seedDocumentsAction(caseId); setMessage(result.message); if (result.ok) router.refresh(); });
  }
  return <section className="rounded-2xl border border-[#dce8df] bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-serif text-xl">Add a fictional PDF</h2><p className="mt-1 text-xs leading-5 text-[#62776a]">Text-based PDF only, up to 4 MB and 20 pages. Unsupported or scanned PDFs need manual entry.</p></div><button type="button" hidden={caseId !== "demo-case"} onClick={seed} disabled={pending} className="rounded-lg border border-[#b9d4c0] px-3 py-2 text-xs font-semibold text-[#24553f] disabled:opacity-50">Load five synthetic examples</button></div>
    <form action={submit} className="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="caseId" value={caseId} /><div><label htmlFor="document-type" className="text-xs font-semibold">Document type</label><select id="document-type" name="documentType" className={`${inputClass} mt-1`} required>{types.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div><div><label htmlFor="document-provider" className="text-xs font-semibold">Practice, if relevant</label><select id="document-provider" name="providerId" className={`${inputClass} mt-1`}><option value="">No practice / benefit statement</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div><div className="md:col-span-2"><label htmlFor="document-file" className="text-xs font-semibold">PDF file</label><input id="document-file" name="file" type="file" accept="application/pdf,.pdf" required className={`${inputClass} mt-1`} /></div><label className="flex items-start gap-2 text-xs leading-5 md:col-span-2"><input type="checkbox" name="attestSynthetic" value="yes" required className="mt-0.5" />I confirm this PDF contains synthetic demo data only, with no real patient records.</label><div className="md:col-span-2"><button className="button button-primary" type="submit" disabled={pending}>Upload and analyse</button></div></form><p role="status" aria-live="polite" className="mt-3 text-xs font-medium text-[#356d4b]">{pending ? "Processing PDF…" : message}</p>
  </section>;
}

export function DeleteDocumentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <span className="inline-flex flex-col items-start"><button type="button" disabled={pending} onClick={() => { if (!window.confirm("Delete this private PDF and its analysis?")) return; startTransition(async () => { const result = await deleteDocumentAction(id); setMessage(result.message); if (result.ok) router.refresh(); }); }} className="text-xs font-semibold text-red-700 underline disabled:opacity-50">Delete PDF</button>{message && <span role="status" className="text-[11px]">{message}</span>}</span>;
}

export function SaveBillFindingButton({ caseId, selection, issueIndex }: { caseId: string; selection: { previous: string; revised: string; invoice: string; statement: string }; issueIndex: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function save() {
    const form = new FormData();
    form.set("caseId", caseId); form.set("issueIndex", String(issueIndex));
    for (const [key, value] of Object.entries(selection)) form.set(key, value);
    startTransition(async () => { const result = await createBillOpportunityAction(form); setMessage(result.message); if (result.ok) router.refresh(); });
  }
  return <span className="inline-flex flex-col items-start"><button type="button" onClick={save} disabled={pending} className="text-xs font-bold text-[#276b50] underline disabled:opacity-50">Save review opportunity</button>{message && <span role="status" className="text-[11px]">{message}</span>}</span>;
}

export function StartBillNegotiationButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <span className="inline-flex flex-col items-start"><button type="button" disabled={pending} className="text-xs font-bold text-[#276b50] underline disabled:opacity-50" onClick={() => startTransition(async () => { const result = await startBillNegotiationAction(opportunityId); if (result.ok) router.push(`/negotiation?case=${encodeURIComponent(result.caseId)}&draft=${encodeURIComponent(result.draftId)}`); else setMessage(result.message); })}>Start negotiation draft</button>{message && <span role="status" className="text-[11px] text-red-700">{message}</span>}</span>;
}
