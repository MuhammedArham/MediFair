import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PageHeading } from "@/components/page-elements";
import { getDatabaseClient } from "@/lib/db/client";
import { emailSimulatorAllowed } from "@/lib/email/dev-simulator-gate";
import { responseTemplates } from "@/lib/email/simulator-templates";
import { SimulatorForm } from "./simulator-form";
import { NegotiationSimulator } from "./negotiation-simulator";
import { negotiationResponseTemplates } from "@/lib/negotiation/response-provider";

export default async function EmailSimulatorPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const { case: caseId = "demo-case" } = await searchParams;
  const requestHeaders = await headers();
  if (!emailSimulatorAllowed(requestHeaders.get("host"))) notFound();
  const db = getDatabaseClient();
  const providers = await db.provider.findMany({
    where: { isFictional: true }, orderBy: { practiceName: "asc" },
    include: { quoteRequests: { where: { caseId, isSimulation: true, messages: { some: { direction: "OUTBOUND" } } }, orderBy: { requestVersion: "desc" }, take: 1, include: { messages: { where: { direction: "OUTBOUND" }, orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  const options = providers.flatMap((provider) => {
    const request = provider.quoteRequests[0];
    const message = request?.messages[0];
    return request && message ? [{ providerId: provider.id, practiceName: provider.practiceName, caseId: request.caseId, threadId: message.threadId, requestStatus: request.status, subject: message.subject }] : [];
  });
  const negotiations = await db.negotiation.findMany({ where: { caseId, isSimulation: true, status: { not: "CLOSED" }, requests: { some: { status: "SIMULATED" } } }, include: { provider: true, requests: { where: { status: "SIMULATED" }, orderBy: { version: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
  const negotiationOptions = negotiations.filter((item) => Boolean(item.requests[0])).map((item) => ({ id: item.id, providerName: item.requestType === "INSURER_BENEFITS_REVIEW" ? `${item.requests[0].recipientEmail} (fictional insurer contact)` : item.provider.practiceName, requestSubject: item.requests[0].subject, status: item.status, caseId: item.caseId }));
  return <>
    <PageHeading eyebrow="DEVELOPMENT TOOL" title="Email simulator" description="Create synthetic provider replies for fictional practices. Every response uses the same inbox ingestion path as a received email." />
    <section className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>MOCK EMAIL MODE — SIMULATED ONLY.</strong> Nothing is sent or received outside this local development app. Replies are synthetic and do not represent real practices or quotes.</section>
    {options.length ? <SimulatorForm options={options} templates={responseTemplates.map(({ id, label, body }) => ({ id, label, body }))} /> : <section className="rounded-xl border bg-white p-5 text-sm">No outgoing synthetic quote requests found. Seed demo data or save and approve a draft first.</section>}
    {negotiationOptions.length ? <NegotiationSimulator options={negotiationOptions} templates={negotiationResponseTemplates.map(({ id, label, body }) => ({ id, label, body }))} /> : <section className="mt-5 rounded-xl border bg-white p-5 text-sm">No approved negotiation request in the simulated outbox yet. Start one from Opportunities, approve it, then use the separate send action.</section>}
  </>;
}
