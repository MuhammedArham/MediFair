import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeading } from "@/components/page-elements";
import { getCase } from "@/lib/db/repository";
import { listCurrentQuoteDrafts } from "@/lib/db/quote-drafts";
import { getDatabaseClient } from "@/lib/db/client";
import { readEmailConfiguration } from "@/lib/email/email-service";
import { replyAddress, replyIdentifier } from "@/lib/db/outbound-sends";
import { buildQuoteRequestDraft, quoteFactsFromCase } from "@/lib/quote-request-template";
import { QuoteDraftCards } from "./quote-draft-cards";
import { SendPanel } from "./send-panel";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ case?: string | string[] }> }) {
  const query = await searchParams;
  const caseId = typeof query.case === "string" ? query.case : null;
  if (query.case && !caseId) notFound();
  await connection();
  if (!caseId) return <><PageHeading eyebrow="PATIENT APPROVAL" title="Quote request drafts" description="Review and approve each exact message before any future sending step." /><section className="rounded-2xl border border-[#dce8df] bg-white p-6"><h2 className="font-serif text-2xl">Choose a case</h2><p className="mt-2 text-sm text-[#667b6d]">Open the fictional case to prepare requests for its selected practices.</p><Link href="/requests?case=demo-case" className="button button-primary mt-5">Open demo drafts</Link></section></>;
  const record = await getCase(caseId);
  if (!record) notFound();
  const selected = await listCurrentQuoteDrafts(caseId);
  const attempts = await getDatabaseClient().outboundSend.findMany({ where: { caseId }, include: { quoteRequest: { include: { messages: { where: { direction: "OUTBOUND" } } } } } });
  const transportMode = (process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") === "mock" ? "mock" : "resend";
  const emailConfiguration = readEmailConfiguration();
  const configurationMissing = transportMode === "mock" ? [] : [...emailConfiguration.missing];
  const template = buildQuoteRequestDraft(quoteFactsFromCase(record));
  const drafts = selected.map(({ provider, request }) => ({
    providerId: provider.id, practiceName: provider.practiceName, recipientEmail: provider.email ?? "",
    sourceType: provider.sourceType, requestId: request?.id ?? null,
    version: request?.requestVersion ?? null, status: request?.status ?? "UNSAVED",
    subject: request?.subject ?? template.subject, body: request?.body ?? template.body,
  }));
  const rows = selected.map(({ provider, request }) => {
    const attempt = attempts.find((item) => item.quoteRequestId === request?.id);
    const delivery = attempt?.quoteRequest.messages[0]?.deliveryStatus;
    const status = attempt ? delivery === "DELIVERED" || delivery === "BOUNCED" ? delivery : attempt.status : request?.status === "APPROVED" ? configurationMissing.length ? "CONFIG_REQUIRED" : "READY" : request?.status === "SENT" ? "SENT" : request?.status === "SIMULATED" ? "SIMULATED" : "NOT_APPROVED";
    const message = status === "READY" ? transportMode === "mock" ? "Approved and ready to simulate. No email will be sent." : "Approved and ready for an explicit send action; Resend configuration is checked only after you press Send." : status === "CONFIG_REQUIRED" ? "Sending configuration is missing; no email can be sent." : status === "NOT_APPROVED" ? "Review and approve this exact draft first." : status === "DELIVERED" ? "Resend reported delivery." : status === "BOUNCED" ? "Resend reported a bounce; review the address." : status === "SIMULATED" ? "Simulated locally. This message was not sent or delivered." : status === "DOMAIN_ERROR" ? "Resend sending domain is not verified and enabled. No message was sent." : status === "AUTH_ERROR" ? "Resend authentication failed. Check the server-side key and permissions." : status === "RATE_LIMITED" ? "Resend rate limit reached. No automatic retry was made." : status === "SENT" ? "Accepted by Resend; delivery is not yet confirmed." : status === "SENDING" ? "Send in progress or awaiting reconciliation; duplicate blocked." : "Sending needs review; no automatic retry will occur.";
    const replyToEmail = attempt?.replyToEmail ?? (request && emailConfiguration.configuration ? replyAddress(emailConfiguration.configuration.inboundAddress, replyIdentifier(record.id, provider.id, request.id)) : undefined);
    return { providerId: provider.id, practiceName: provider.practiceName, status, message, providerMessageId: attempt?.providerMessageId ?? undefined, recipientEmail: request?.recipientEmail ?? provider.email ?? "", fromEmail: attempt?.fromEmail ?? emailConfiguration.configuration?.fromEmail, replyToEmail };
  });
  return <>
    <PageHeading eyebrow="PATIENT APPROVAL" title="Quote request drafts" description={`Review one exact message for each selected practice. ${record.procedureName} · ${record.medicalSpecialty ?? "Specialty not supplied"}.`} action={{ href: `/providers?case=${record.id}`, label: "Edit shortlist" }} />
    <section className="mb-6 rounded-2xl border border-[#cfe5d5] bg-[#eaf5ed] p-5 text-sm leading-6 text-[#28543d]"><strong>Fictional patient data.</strong> Saving or approving a draft sends nothing. {transportMode === "mock" ? "The separate Send action creates simulated local messages only." : "The separate Send action sends real email only to user-verified contacts on the configured demo allowlist."} Practices may require a consultation or referral before quoting, and estimates may omit separately billing clinicians.</section>
    {drafts.length ? <><SendPanel key={rows.map((row) => `${row.providerId}:${row.status}`).join("|")} caseId={record.id} configurationMissing={configurationMissing} initialRows={rows} transportMode={transportMode} /><QuoteDraftCards caseId={record.id} aiAvailable={(process.env.AI_PROVIDER?.trim().toLowerCase() || "mock") === "openai" && Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL)} drafts={drafts} /></> : <section className="rounded-2xl border border-[#dce8df] bg-white p-6"><h2 className="font-serif text-2xl">Select practices first</h2><p className="mt-2 text-sm text-[#667b6d]">Choose up to three practices for this case before drafting requests.</p><Link href={`/providers?case=${record.id}`} className="button button-primary mt-5">Choose practices</Link></section>}
  </>;
}
