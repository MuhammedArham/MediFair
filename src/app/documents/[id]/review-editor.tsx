"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { correctDocumentAction } from "../actions";

export function DocumentReviewEditor({ documentId, initial }: { documentId: string; initial: string }) {
  const router = useRouter();
  const [json, setJson] = useState(initial);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function save() {
    startTransition(async () => { const result = await correctDocumentAction(documentId, json, note); setMessage(result.message); if (result.ok) router.refresh(); });
  }
  return <section className="rounded-2xl border border-[#dce8df] bg-white p-5"><h2 className="font-serif text-xl">Manual entry or correction</h2><p className="mt-2 text-xs leading-5 text-[#65786a]">Edit structured values against the PDF. Use integer cents (for example, $700 is 70000); use null for unknown amounts and cite the page and excerpt for each line. Saving retains the original extraction and records your note. This does not independently verify coverage.</p><label htmlFor="document-json" className="mt-4 block text-xs font-semibold">Document values (JSON)</label><textarea id="document-json" value={json} onChange={(event) => setJson(event.target.value)} rows={20} spellCheck={false} className="mt-1 w-full rounded-lg border border-[#cbdccf] bg-[#fbfcfa] p-3 font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-[#95c8a2]" /><label htmlFor="document-review-note" className="mt-3 block text-xs font-semibold">Source check or correction note</label><textarea id="document-review-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} minLength={12} maxLength={1200} placeholder="State what you checked and why you changed the values." className="mt-1 w-full rounded-lg border border-[#cbdccf] p-3 text-sm" /><button type="button" onClick={save} disabled={pending || note.trim().length < 12} className="button button-primary mt-3 disabled:opacity-50">Save reviewed values</button><p role="status" aria-live="polite" className="mt-2 text-xs text-[#326a47]">{pending ? "Saving…" : message}</p></section>;
}
