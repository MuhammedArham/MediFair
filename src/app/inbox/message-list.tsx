"use client";

import { useState, useTransition } from "react";
import { updateReadStateAction } from "./actions";

type Item = { id: string; providerName: string; caseLabel: string; direction: string; fromAddress: string; recipientAddress: string; subject: string; body: string; threadId: string | null; deliveryStatus: string; isSimulation: boolean; isRead: boolean; createdAt: string; quoteResponseStatus: string; matchStatus: string | null };

export function InboxMessageList({ messages }: { messages: Item[] }) {
  const [items, setItems] = useState(messages);
  const [pending, startTransition] = useTransition();
  function toggle(item: Item) {
    startTransition(async () => {
      const result = await updateReadStateAction(item.id, !item.isRead);
      if (result.ok) setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: !entry.isRead } : entry));
    });
  }
  if (!items.length) return <section className="rounded-2xl border border-[#dce8df] bg-white p-7"><h2 className="font-serif text-2xl text-[#173d39]">No messages yet</h2><p className="mt-2 text-sm leading-6 text-[#607367]">Simulated provider replies will appear here with their thread history. Use the local email simulator to create a reply.</p><a className="button button-primary mt-4" href="/dev/email-simulator">Open email simulator</a></section>;
  return <div className="grid gap-3">{items.map((item) => <article key={item.id} className={`rounded-xl border bg-white p-4 sm:p-5 ${item.isRead ? "border-[#dce8df]" : "border-[#9dc8a9] shadow-sm"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#557463]">{item.providerName} · {item.caseLabel}</p><h2 className="mt-1 text-base font-semibold text-[#173d39]">{item.subject}</h2></div><div className="flex flex-wrap gap-2"><span className="badge">{item.isSimulation ? "SIMULATED" : item.deliveryStatus}</span><span className="badge">{item.direction}</span><span className="badge">{item.quoteResponseStatus.replaceAll("_", " ")}</span></div></div>
    <dl className="mt-3 grid gap-x-4 gap-y-1 break-all text-xs text-[#667b6d] sm:grid-cols-2"><div><dt className="inline font-semibold">From: </dt><dd className="inline">{item.fromAddress}</dd></div><div><dt className="inline font-semibold">To: </dt><dd className="inline">{item.recipientAddress}</dd></div><div><dt className="inline font-semibold">Received: </dt><dd className="inline">{new Date(item.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" })}</dd></div><div><dt className="inline font-semibold">Thread: </dt><dd className="inline">{item.threadId ?? "Unmatched message"}</dd></div></dl>
    {item.direction === "INBOUND" && item.matchStatus !== "MATCHED" && <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-950">{item.matchStatus === "PROVIDER_MISMATCH" ? "Reply identifier matched a request, but sender address did not match the selected practice. Kept unassigned." : "Could not associate this message with a case and provider; kept unassigned for review."}</p>}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-[#315942]">View thread message</summary><pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-[#f6f8f5] p-4 font-sans text-sm leading-6 text-[#31483b]">{item.body}</pre><p className="mt-2 text-xs text-[#738277]">Email content is untrusted text. It is displayed as text and never executed.</p></details>
    <button type="button" disabled={pending} onClick={() => toggle(item)} className="mt-3 rounded-lg border border-[#bfd0c3] px-3 py-2 text-xs font-semibold text-[#315942] disabled:opacity-50">Mark as {item.isRead ? "unread" : "read"}</button>
  </article>)}</div>;
}
