import Link from "next/link";
import { connection } from "next/server";
import { Inbox } from "lucide-react";
import { Notice, PageHeading, PlaceholderCard } from "@/components/page-elements";
import { getDatabaseClient } from "@/lib/db/client";
import { InboxMessageList } from "./message-list";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const { case: caseId = "demo-case" } = await searchParams;
  await connection();
  const mockMode = (process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") === "mock";
  const messages = await getDatabaseClient().emailMessage.findMany({
    where: { caseId, case: { isFictional: true } },
    include: { provider: true, quoteRequest: true, negotiation: true }, orderBy: { createdAt: "desc" },
  });
  const display = messages.map((message) => ({
    id: message.id, providerName: message.provider?.practiceName ?? "Unmatched provider reply",
    caseLabel: message.caseId ?? "Unmatched", direction: message.direction, subject: message.subject,
    fromAddress: message.fromAddress ?? "not recorded", recipientAddress: message.recipientAddress ?? "not recorded",
    body: message.body, threadId: message.threadId, deliveryStatus: message.deliveryStatus,
    isSimulation: message.isSimulation, isRead: message.isRead, createdAt: message.receivedAt?.toISOString() ?? message.createdAt.toISOString(),
    quoteResponseStatus: message.negotiation ? `NEGOTIATION ${message.negotiation.status}` : message.quoteRequest?.quoteResponseStatus ?? "NONE", matchStatus: message.matchStatus,
  }));
  return <>
    <PageHeading eyebrow="CONVERSATIONS" title="Inbox" description="Review provider requests and replies by thread, including simulated status and response classification." action={mockMode ? { href: `/dev/email-simulator?case=${caseId}`, label: "Open email simulator" } : undefined} />
    <p className="mb-4 text-sm"><Link href={`/quote-analysis?case=${caseId}`} className="font-semibold text-[#246a50] underline">Open Quote Analysis</Link><span className="text-[#708075]"> to review extracted values beside the source emails.</span></p>
    <section className={`mb-5 rounded-xl border p-4 text-sm leading-6 ${mockMode ? "border-amber-300 bg-amber-50 text-amber-950" : "border-[#cfe5d5] bg-[#eaf5ed] text-[#28543d]"}`}><strong>{mockMode ? "MOCK EMAIL MODE — SIMULATED ONLY." : "RESEND EMAIL MODE."}</strong> {mockMode ? "Replies are synthetic test data. They are not sent by or received from real providers, and simulated sending is not delivery." : "Inbound content is untrusted and is displayed as text. Verify all figures with the provider."}</section>
    {display.length ? <InboxMessageList messages={display} /> : <div className="detail-grid"><PlaceholderCard icon={<Inbox size={29} />} title="No messages loaded" body="No requests or replies are available for this case yet." steps={["Approve a quote request", "Use the simulator in mock mode", "Review replies in their thread"]} /><Notice title="Keep unknown amounts unconfirmed">A reply is not a verified quote or coverage confirmation. Review the provider’s written terms.</Notice></div>}
    {mockMode && <p className="mt-4 text-xs text-[#6c7d71]">The development simulator is restricted to local development on a loopback address. <Link className="underline" href={`/dev/email-simulator?case=${caseId}`}>Open simulator</Link>.</p>}
  </>;
}
