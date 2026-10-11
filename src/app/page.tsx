import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { getDatabaseClient } from "@/lib/db/client";
import { loadComparison } from "@/lib/comparison/data";
import { loadReviewPage } from "@/lib/opportunities/service";
import { PageHeading } from "@/components/page-elements";
const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
export default async function Home({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  await connection(); const query = await searchParams; const db = getDatabaseClient();
  const cases = await db.case.findMany({ where: { isFictional: true, patientProfile: { isFictional: true } }, orderBy: { createdAt: "desc" }, include: { selectedProviders: true } });
  const active = cases.find((item) => item.id === query.case) ?? cases[0];
  if (!active) return <><PageHeading eyebrow="YOUR WORKSPACE" title="Clearer costs start here" description="Create a fictional patient case to collect quotes, understand missing costs and ask informed questions." /><Link className="button button-primary" href="/case/new">Start a new case <ArrowRight size={18} /></Link></>;
  const [comparison, review, messages, requests, negotiations] = await Promise.all([
    loadComparison(active.id), loadReviewPage(active.id), db.emailMessage.findMany({ where: { caseId: active.id } }),
    db.quoteRequest.findMany({ where: { caseId: active.id } }), db.negotiation.findMany({ where: { caseId: active.id }, include: { provider: true } }),
  ]);
  const link = (route: string) => `${route}?case=${active.id}`;
  const entries = comparison?.groups.map((group) => group.current) ?? [];
  const contacted = new Set(messages.filter((item) => item.direction === "OUTBOUND").map((item) => item.providerId)).size;
  const responses = new Set(messages.filter((item) => item.direction === "INBOUND" && item.matchStatus === "MATCHED").map((item) => item.providerId)).size;
  const versions = comparison?.groups.flatMap((group) => group.versions) ?? [];
  const reductions = negotiations.flatMap((item) => {
    const before = versions.find((entry) => entry.quote.id === item.originalQuoteId);
    const after = versions.find((entry) => entry.quote.id === item.revisedQuoteId);
    return before?.result.rankable && after?.result.rankable ? [{ id: item.id, provider: item.provider.practiceName, cents: Math.max(0, before.result.quotedPatientCostCents! - after.result.quotedPatientCostCents!) }] : [];
  });
  return <><PageHeading eyebrow="YOUR WORKSPACE" title="Your healthcare cost dashboard" description="Follow each quote from the first question to a clearer written answer. All records and financial values in this workspace are fictional." action={{ href: "/case/new", label: "Start a new case" }} />
    <section className="dashboard-case"><div><p className="eyebrow">ACTIVE PATIENT CASE</p><h2>{active.procedureName}</h2><p>{active.medicalSpecialty} · {active.suburb}, {active.state} {active.postcode}</p><span className="badge mt-3">SYNTHETIC DATA · {active.status.replaceAll("_", " ")}</span></div><form method="get"><label htmlFor="active-case" className="block text-xs font-bold">Switch case</label><select id="active-case" name="case" defaultValue={active.id} className="mt-2 max-w-full rounded-lg border bg-white p-2 text-sm">{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button className="button mt-2">Open case</button></form></section>
    <div className="dashboard-metrics">{[["Practices contacted", `${contacted} / ${active.selectedProviders.length}`, "Simulated outbox"], ["Practices replied", String(responses), "Synthetic replies"], ["Quotes needing review", String(entries.filter((entry) => !entry.result.rankable).length), "Missing costs, scope or cover"], ["Active negotiations", String(negotiations.filter((item) => !["CLOSED", "REJECTED", "ACCEPTED"].includes(item.status)).length), `${negotiations.filter((item) => item.revisedQuoteId).length} revised quotes`]].map(([label, value, detail]) => <section className="metric-card" key={label}><h2>{label}</h2><strong>{value}</strong><p>{detail}</p></section>)}</div>
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]"><section className="workspace-panel"><div className="flex flex-wrap items-center justify-between gap-2"><h2>Provider comparison</h2><Link className="text-link-green" href={link("/comparison")}>Compare all quotes →</Link></div>{entries.length ? <ul className="dashboard-quotes">{entries.map((entry) => <li key={entry.quote.id}><div><Link href={`/comparison/quote/${entry.quote.id}?case=${active.id}`}>{entry.quote.provider.practiceName}</Link><p>{entry.result.status.replaceAll("_", " ")}</p></div><strong>{entry.result.quotedPatientCostCents === null ? "Not established" : aud(entry.result.quotedPatientCostCents)}</strong></li>)}</ul> : <p>No quotes yet. Select practices, approve the drafts and simulate replies.</p>}<p className="mt-4">Incomplete quotes are excluded from ranking. Similar procedure names do not establish comparable treatment.</p></section>
    <section className="workspace-panel"><h2>Next actions</h2><ol className="next-actions"><li><Link href={link("/providers")}>{active.selectedProviders.length ? "Review selected practices" : "Choose up to three practices"}</Link></li><li><Link href={link("/requests")}>{requests.some((item) => item.status === "APPROVED") ? "Send approved requests" : "Review and approve quote requests"}</Link></li><li><Link href={link("/dev/email-simulator")}>{responses < contacted ? "Awaiting replies — open simulator" : "Simulate a provider reply"}</Link></li><li><Link href={link("/quote-analysis")}>Review extracted figures and evidence</Link></li><li><Link href={link("/opportunities")}>Explore {review.opportunities.length} opportunities to review</Link></li><li><Link href={link("/documents")}>Upload and analyse a bill</Link></li></ol></section></div>
    <section className="workspace-panel mt-5"><h2>Negotiation outcomes</h2>{reductions.length ? <ul className="dashboard-quotes">{reductions.map((item) => <li key={item.id}><Link href={`${link("/negotiation")}&draft=${item.id}`}>{item.provider}</Link><strong>{aud(item.cents)} potential quoted reduction</strong></li>)}</ul> : <p>No comparable revised quote yet. Review an opportunity to prepare a request.</p>}<p className="mt-3">All outcomes are simulated. A quoted reduction is not a realised saving; payment, clinical scope and insurer cover still need independent confirmation.</p><Link className="text-link-green mt-3 inline-block" href={link("/negotiation")}>Open negotiations →</Link></section></>;
}
