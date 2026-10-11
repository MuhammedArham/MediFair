import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeading } from "@/components/page-elements";
import { workspaceAccessAllowed } from "@/lib/auth/workspace-access";
import { analyseSelectedDocuments, effectiveDocumentResult, listCaseDocuments } from "@/lib/documents/service";
import { getDatabaseClient } from "@/lib/db/client";
import { DeleteDocumentButton, DocumentUploadPanel, SaveBillFindingButton, StartBillNegotiationButton } from "./document-controls";

const aud = (cents: number | null) => cents === null ? "Not stated" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const typeLabel = (value: string) => value.replaceAll("_", " ").toLowerCase();

type Search = { case?: string; previous?: string; revised?: string; invoice?: string; statement?: string };
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  await connection();
  if (!workspaceAccessAllowed(await headers())) notFound();
  const caseId = typeof query.case === "string" ? query.case : "demo-case";
  const db = getDatabaseClient();
  const caseRecord = await db.case.findUnique({ where: { id: caseId, isFictional: true }, include: { selectedProviders: { include: { provider: true } } } });
  if (!caseRecord) notFound();
  const mockAI = (process.env.AI_PROVIDER?.trim().toLowerCase() || "mock") === "mock";
  const documents = await listCaseDocuments(caseId, db);
  const defaults = (name: string) => documents.find((item) => item.sourceType === "DEMO" && item.fileName === name)?.id ?? "";
  const chosen = ["previous", "revised", "invoice", "statement"].some((role) => role in query);
  const selected = {
    previous: chosen ? query.previous ?? "" : defaults("synthetic-original-estimate.pdf"),
    revised: chosen ? query.revised ?? "" : defaults("synthetic-revised-estimate.pdf"),
    invoice: chosen ? query.invoice ?? "" : defaults("synthetic-final-invoice.pdf"),
    statement: chosen ? query.statement ?? "" : defaults("synthetic-insurer-statement.pdf"),
  };
  let comparison: Awaited<ReturnType<typeof analyseSelectedDocuments>> | null = null;
  let compareError: string | null = null;
  if (Object.values(selected).some(Boolean)) {
    try { comparison = await analyseSelectedDocuments(caseId, selected, db); }
    catch (error) { compareError = error instanceof Error ? error.message : "Comparison unavailable."; }
  }
  const opportunities = await db.billReviewOpportunity.findMany({ where: { caseId, isFictional: true }, include: { primaryDocument: true, quote: true }, orderBy: { createdAt: "desc" }, take: 20 });
  return <>
    <PageHeading eyebrow="BILL REVIEW" title="Documents & bill analysis" description={`${caseRecord.title}. Upload fictional text PDFs, review source-backed amounts, and compare written estimates with an invoice.`} action={{ href: `/comparison?case=${caseId}`, label: "Quote comparison" }} />
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>{mockAI ? "MOCK DOCUMENT MODE" : "EXTERNAL AI MODE"} — SYNTHETIC DATA ONLY.</strong> Files stay in private local storage. {mockAI ? "Exact fixture PDFs receive simulated extraction; unfamiliar or scanned PDFs require manual entry." : "Only exact synthetic fixtures may be sent to configured OpenAI. Configuration errors require correction or manual entry; no mock fallback is used."} Findings are prompts for clarification, not claims of unlawful billing.</div>
    <DocumentUploadPanel caseId={caseId} providers={caseRecord.selectedProviders.map((item) => ({ id: item.providerId, name: item.provider.practiceName }))} />
    <section className="mt-6"><h2 className="font-serif text-2xl text-[#173d39]">Stored PDFs</h2>{documents.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{documents.map((document) => {
      const result = effectiveDocumentResult(document.analysis);
      return <article key={document.id} className="rounded-2xl border border-[#dce8df] bg-white p-5 shadow-sm"><div className="flex flex-wrap gap-2"><span className="badge">{document.sourceType === "DEMO" ? "SYNTHETIC FIXTURE" : "FICTIONAL UPLOAD"}</span><span className="badge">{document.analysis?.status.replaceAll("_", " ") ?? "UNANALYSED"}</span></div><h3 className="mt-3 break-words font-serif text-lg">{document.fileName}</h3><p className="mt-1 text-xs text-[#61766a]">{typeLabel(document.documentType)} · {document.provider?.practiceName ?? "No specialist practice linked"}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[#718274]">Total shown</dt><dd className="mt-1 font-bold">{aud(result?.totalCents ?? null)}</dd></div><div><dt className="text-[#718274]">Patient balance</dt><dd className="mt-1 font-bold">{aud(result?.patientBalanceCents ?? null)}</dd></div><div><dt className="text-[#718274]">Confidence</dt><dd className="mt-1 font-bold">{result?.confidence ?? "Manual review"}</dd></div><div><dt className="text-[#718274]">Verification</dt><dd className="mt-1 font-bold">{document.analysis?.reviewedAt ? "Patient reviewed" : "Not independently verified"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-4"><Link href={`/documents/${document.id}`} className="text-xs font-bold text-[#276b50] underline">View analysis & edit</Link><Link href={`/api/documents/${document.id}`} className="text-xs font-bold text-[#276b50] underline">Download source PDF</Link><DeleteDocumentButton id={document.id} /></div></article>;
    })}</div> : <div className="mt-3 rounded-xl border border-dashed border-[#cbdccf] bg-white p-7 text-center text-sm text-[#65786a]">No private PDFs yet. Load the synthetic examples or upload a fictional PDF.</div>}</section>
    <section className="mt-7 rounded-2xl border border-[#dce8df] bg-white p-5"><h2 className="font-serif text-2xl">Compare documents</h2><p className="mt-1 text-xs leading-5 text-[#65786a]">Choose records covering the same provider, procedure, MBS item and service date. Unknown amounts stay unknown. The invoice can be compared with the revised or previous estimate.</p><form action="/documents" method="get" className="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="case" value={caseId} />{(["previous", "revised", "invoice", "statement"] as const).map((role) => <div key={role}><label htmlFor={`compare-${role}`} className="text-xs font-semibold capitalize">{role === "statement" ? "Insurance/payment statement" : role === "invoice" ? "Final invoice" : `${role} quote`}</label><select id={`compare-${role}`} name={role} defaultValue={selected[role]} className="mt-1 w-full rounded-lg border border-[#cbdccf] bg-white px-3 py-2 text-sm"><option value="">None selected</option>{documents.filter((item) => effectiveDocumentResult(item.analysis)).map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}</select></div>)}<div className="md:col-span-2"><button className="button button-primary" type="submit">Compare selected PDFs</button></div></form>
      {compareError && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{compareError}</p>}
      {comparison && <div className="mt-6"><div className="flex flex-wrap gap-2"><span className="badge">{comparison.comparison.revisedToInvoice ? "REVISED QUOTE / INVOICE MATCHED" : "SCOPE REVIEW NEEDED"}</span><span className="badge">{comparison.comparison.issues.length} REVIEW FINDINGS</span></div><div className="mt-4 overflow-x-auto"><table className="min-w-[650px] w-full text-left text-xs"><thead className="bg-[#f4f8f4]"><tr><th className="p-3">Document</th><th className="p-3">Type</th><th className="p-3">Stated total</th><th className="p-3">Patient balance</th></tr></thead><tbody>{Object.entries(comparison.selection).filter((item) => item[1] !== null).map(([role, item]) => <tr key={role} className="border-t"><th className="p-3 capitalize">{role}</th><td className="p-3">{item!.label}</td><td className="p-3">{aud(item!.result.totalCents)}</td><td className="p-3">{aud(item!.result.patientBalanceCents)}</td></tr>)}</tbody></table></div><h3 className="mt-5 font-serif text-xl">Potential discrepancies</h3>{comparison.comparison.issues.length ? <ol className="mt-3 space-y-3">{comparison.comparison.issues.map((issue, index) => <li key={`${issue.kind}-${index}`} className="rounded-xl border border-[#e1e9e2] bg-[#fbfcfa] p-4"><div className="flex flex-wrap items-center gap-2"><span className="badge">{typeLabel(issue.kind)}</span><span className="text-xs text-[#667b6c]">Confidence: {issue.confidence.toLowerCase()}</span>{issue.deltaCents !== null && <strong className="text-xs">Change: {aud(issue.deltaCents)}</strong>}</div><p className="mt-2 text-sm leading-5">{issue.description}</p>{issue.evidence.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-[#65786a]">{issue.evidence.map((evidence, i) => <li key={i}>{evidence.role}, page {evidence.page}: {evidence.excerpt}</li>)}</ul>}<div className="mt-3"><SaveBillFindingButton caseId={caseId} selection={selected} issueIndex={index} /></div></li>)}</ol> : <p className="mt-3 text-sm text-[#65786a]">No deterministic discrepancy was found in the selected records. This does not verify the charges or cover.</p>}</div>}
    </section>
    <section className="mt-7"><h2 className="font-serif text-2xl">Saved review opportunities</h2>{opportunities.length ? <ul className="mt-3 space-y-2">{opportunities.map((opportunity) => <li key={opportunity.id} className="rounded-xl border border-[#dce8df] bg-white p-4 text-sm"><span className="badge">{opportunity.confidence} CONFIDENCE · {opportunity.status}</span><p className="mt-2">{opportunity.title}</p><p className="mt-1 text-xs text-[#667b6a]">Source: {opportunity.primaryDocument.fileName}</p>{opportunity.quote && <StartBillNegotiationButton opportunityId={opportunity.id} />}</li>)}</ul> : <p className="mt-2 text-sm text-[#65786a]">No bill review opportunities saved yet.</p>}</section>
  </>;
}
