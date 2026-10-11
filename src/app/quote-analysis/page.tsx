import { connection } from "next/server";
import { FileSearch, ShieldAlert } from "lucide-react";
import { PageHeading } from "@/components/page-elements";
import { getDatabaseClient } from "@/lib/db/client";
import { quoteExtractionSchema } from "@/lib/ai/quote-extraction-schema";
import { QuoteAnalysisCard } from "./quote-analysis-card";

export default async function QuoteAnalysisPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const { case: caseId = "demo-case" } = await searchParams;
  await connection();
  const mockMode = (process.env.AI_PROVIDER?.trim().toLowerCase() || "mock") === "mock";
  const messages = await getDatabaseClient().emailMessage.findMany({
    where: { caseId, case: { isFictional: true, patientProfile: { isFictional: true } }, direction: "INBOUND", matchStatus: "MATCHED" },
    include: { case: true, provider: true, quoteExtractions: { include: { evidence: { orderBy: { createdAt: "asc" } }, quote: true } }, quoteRequest: true },
    orderBy: { receivedAt: "desc" }, take: 30,
  });
  return <>
    <PageHeading eyebrow="COST REVIEW" title="Quote Analysis" description="Review extracted figures beside each original fictional provider email. Unknown values stay blank until a provider states them." />
    <section className={`mb-5 rounded-xl border p-4 text-sm leading-6 ${mockMode ? "border-amber-300 bg-amber-50 text-amber-950" : "border-[#cfe5d5] bg-[#eaf5ed] text-[#28543d]"}`}><strong>{mockMode ? "MOCK AI MODE — SIMULATED EXTRACTION." : "OPENAI EXTRACTION MODE."}</strong> {mockMode ? "Only supported synthetic fixtures are parsed. Other messages require manual review; no external AI calls are made." : "Only fictional demo email content is eligible while demo mode is on. Confirm every extracted field against the source."}</section>
    <aside className="mb-5 flex gap-3 rounded-xl border border-[#dce8df] bg-white p-4 text-xs leading-5 text-[#526b5b]"><ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><p>These results are extraction aids, not coverage decisions or clinical advice. A provider’s fee, Medicare benefit, insurer benefit and patient out-of-pocket amount are separate values. No MBS eligibility or insurer contribution is inferred.</p></aside>
    {messages.length ? <div className="grid gap-5">{messages.map((message) => {
      const stored = message.quoteExtractions[0];
      let extraction = null;
      if (stored?.reviewedResultJson || stored?.resultJson) {
        try { const parsed = quoteExtractionSchema.safeParse(JSON.parse(stored.reviewedResultJson ?? stored.resultJson!)); if (parsed.success) extraction = parsed.data; } catch { extraction = null; }
      }
      return <QuoteAnalysisCard key={message.id} item={{
        messageId: message.id, practice: message.provider?.practiceName ?? "Unknown practice", caseTitle: message.case?.title ?? "Fictional case", subject: message.subject,
        body: message.body, receivedAt: (message.receivedAt ?? message.createdAt).toISOString(), isSimulation: message.isSimulation,
        extractionStatus: stored?.status ?? "NOT_PROCESSED", providerMode: stored?.providerMode ?? (mockMode ? "MOCK_AI" : "OPENAI"), error: stored?.errorSummary ?? null,
        extraction, alreadyReviewed: Boolean(stored?.reviewedAt), quoteStatus: message.quoteRequest?.quoteResponseStatus ?? "AMBIGUOUS", quoteConfirmation: stored?.quote?.confirmationStatus ?? null,
      }} />;
    })}</div> : <section className="rounded-2xl border border-dashed border-[#cbd9ce] bg-white p-8 text-center"><FileSearch size={32} className="mx-auto text-[#5b9270]" aria-hidden="true" /><h2 className="mt-3 font-serif text-2xl text-[#173d39]">No matched provider replies yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#607367]">Save and approve a synthetic quote request, then use the local email simulator. Matched replies enter the same quote extraction pipeline as verified inbound messages.</p><a className="button button-primary mt-4" href={`/dev/email-simulator?case=${caseId}`}>Open email simulator</a></section>}
  </>;
}
