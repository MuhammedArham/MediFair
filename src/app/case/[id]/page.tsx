import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { Notice, PageHeading } from "@/components/page-elements";
import { getCase } from "@/lib/db/repository";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const caseRecord = await getCase(id);
  if (!caseRecord) notFound();
  const practiceCount = caseRecord.selectedProviders.length;
  const latestQuotes = caseRecord.quotes.filter((quote) =>
    !caseRecord.quotes.some((other) => other.providerId === quote.providerId && other.revisionNumber > quote.revisionNumber)
  );

  return <>
    <PageHeading eyebrow="FICTIONAL DEMO CASE" title="Your case at a glance" description="A synthetic example of how written practice responses and open cost questions can stay together." action={caseRecord.status === "DRAFT" ? { href: `/case/new?edit=${caseRecord.id}`, label: "Edit details" } : { href: "/comparison", label: "View comparison" }} />
    <div className="case-banner"><div className="case-emblem"><FileText size={30} aria-hidden="true" /></div><div><span className="case-label">SAMPLE · NO REAL PATIENT</span><h2>{caseRecord.title}</h2><p>{caseRecord.procedureName} · {caseRecord.suburb}, {caseRecord.state} · illustrative MBS item {caseRecord.mbsItemNumber ?? "not recorded"}</p></div><span className="case-status">{caseRecord.status.replaceAll("_", " ").toLowerCase()}</span></div>
    <div className="metric-grid"><div className="metric-card"><span>Practices selected</span><strong>{practiceCount} of 3</strong><small>Selection sends no messages</small></div><div className="metric-card"><span>Synthetic quotes</span><strong>{latestQuotes.length}</strong><small>{latestQuotes.filter((quote) => quote.completeness === "INCOMPLETE").length} incomplete</small></div><div className="metric-card"><span>Confirmed patient gap</span><strong>—</strong><small>Benefits and coverage unverified</small></div></div>
    <div className="detail-grid"><section className="panel"><h3>Written responses</h3>{latestQuotes.length ? <ul className="plain-list">{latestQuotes.map((quote) => <li key={quote.id}><span className="list-check" aria-hidden="true">✓</span><span><strong>{quote.provider.practiceName}</strong> · fictional {quote.completeness.toLowerCase()} quote</span></li>)}</ul> : <p className="text-sm text-[#647875]">No quote responses are attached to this case.</p>}<p className="footnote">These amounts are illustrative. The insurer has not confirmed benefits, so no final out-of-pocket comparison is available.</p></section><div className="side-stack"><div className="info-card"><h3>Simulated inbox</h3><p>Original fictional responses are retained alongside the extracted demo line items.</p><Link href="/inbox">Open inbox <ArrowRight size={16} /></Link></div><Notice title="MBS item is context only">{caseRecord.sourceReference ? "The official MBS item reference is stored separately from fictional practice fees." : "Any entered MBS number has not been checked against an official source by this app."} Item eligibility and benefits need individual confirmation.</Notice></div></div>
    {practiceCount > 0 && <p className="mt-5"><Link href={`/requests?case=${caseRecord.id}`} className="button button-primary">Review quote-request drafts <ArrowRight size={16} aria-hidden="true" /></Link></p>}
    <p className="footnote"><ShieldCheck size={15} aria-hidden="true" /> Synthetic patient, practices, insurer, emails and quotes. No new messages are sent by drafting.</p>
  </>;
}
