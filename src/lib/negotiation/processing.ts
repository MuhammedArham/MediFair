import type { DatabaseClient } from "../db/client";
import { getDatabaseClient } from "../db/client";
import { quoteExtractionSchema } from "../ai/quote-extraction-schema";
import { loadComparison } from "../comparison/data";
import { createNegotiationResponseProvider, type NegotiationInterpretation } from "./response-provider";
import { assertNegotiationTransition } from "./service";

function parsedExtraction(json: string | null) {
  if (!json) return null;
  try { return quoteExtractionSchema.parse(JSON.parse(json)); } catch { return null; }
}

export function revisedQuoteIsComparable(original: ReturnType<typeof parsedExtraction>, revised: ReturnType<typeof parsedExtraction>, interpretation: NegotiationInterpretation) {
  if (!original || !revised || !interpretation.sameServiceScopeExplicit || !interpretation.sameFinancialAssumptionsExplicit || interpretation.changedInclusions.length || interpretation.missingInformation.length || revised.missingFees.length) return false;
  if (revised.fees.some((fee) => fee.billedAmountCents === null || fee.includedInTotal !== true) || revised.totalFeesCents === null || revised.benefits.medicareCents === null || revised.benefits.privateInsurerCents === null || revised.insurance.excessCents === null || revised.insurance.coPaymentCents === null || revised.insurance.expectedPatientOutOfPocketCents === null) return false;
  if (revised.fees.reduce((sum, fee) => sum + fee.billedAmountCents!, 0) !== revised.totalFeesCents) return false;
  const expected = revised.totalFeesCents - revised.benefits.medicareCents - revised.benefits.privateInsurerCents + revised.insurance.excessCents + revised.insurance.coPaymentCents;
  if (expected !== revised.insurance.expectedPatientOutOfPocketCents || interpretation.revisedPatientGapCents !== expected) return false;
  const originalCategories = original.fees.map((fee) => fee.category).sort().join(",");
  const revisedCategories = revised.fees.map((fee) => fee.category).sort().join(",");
  const sameList = (a: string[], b: string[]) => a.slice().sort().join("|") === b.slice().sort().join("|");
  const statedFeesMatch = interpretation.revisedFees.every((item) => revised.fees.some((fee) => fee.category === item.category && fee.billedAmountCents === item.amountCents));
  return statedFeesMatch && originalCategories === revisedCategories && sameList(original.mbsItemNumbers, revised.mbsItemNumbers) && sameList(original.includedComponents, revised.includedComponents) && sameList(original.excludedComponents, revised.excludedComponents) && original.provider.facility === revised.provider.facility && original.benefits.medicareCents === revised.benefits.medicareCents && original.benefits.privateInsurerCents === revised.benefits.privateInsurerCents && original.insurance.excessCents === revised.insurance.excessCents && original.insurance.coPaymentCents === revised.insurance.coPaymentCents && original.insurance.coverageConfirmation === revised.insurance.coverageConfirmation;
}

export async function processNegotiationReply(emailMessageId: string, client: DatabaseClient = getDatabaseClient()) {
  const message = await client.emailMessage.findUniqueOrThrow({ where: { id: emailMessageId }, include: { case: { include: { patientProfile: true } }, negotiation: { include: { originalQuote: { include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 } } } } } } });
  if (!message.negotiation || message.direction !== "INBOUND" || message.matchStatus !== "MATCHED") throw new Error("A matched negotiation reply is required.");
  const fictional = Boolean(message.case?.isFictional && message.case.patientProfile.isFictional);
  if (!fictional || !message.case?.patientProfile.consentGivenAt || message.case.patientProfile.consentWithdrawnAt) throw new Error("A consenting fictional case is required.");
  const existing = await client.negotiationResponse.findUnique({ where: { emailMessageId } });
  if (existing) return existing;
  const negotiation = message.negotiation;
  let result;
  try { result = await createNegotiationResponseProvider().interpret(message.body, fictional); }
  catch (error) {
    if (["SIMULATED_SENT", "SENT", "AWAITING_RESPONSE"].includes(negotiation.status)) await client.negotiation.update({ where: { id: negotiation.id }, data: { status: "NEEDS_CLARIFICATION" } });
    return client.negotiationResponse.create({ data: { negotiationId: negotiation.id, emailMessageId, providerMode: (process.env.AI_PROVIDER?.toLowerCase() === "openai" ? "OPENAI" : "MOCK_AI"), interpretationStatus: "FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 300) : "Interpretation failed." } });
  }
  let decision = result.interpretation?.decision ?? "NEEDS_CLARIFICATION";
  const interpretation = result.interpretation;
  let revisedQuoteId: string | null = null;
  if (interpretation?.decision === "ACCEPTED") {
    const quote = await client.quote.findFirst({ where: { sourceEmailId: emailMessageId }, include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 } } });
    const original = parsedExtraction(negotiation.originalQuote.extractions[0]?.reviewedResultJson ?? negotiation.originalQuote.extractions[0]?.resultJson ?? null);
    const revised = parsedExtraction(quote?.extractions[0]?.reviewedResultJson ?? quote?.extractions[0]?.resultJson ?? null);
    if (quote && quote.caseId === negotiation.caseId && quote.providerId === negotiation.providerId && quote.procedureName === negotiation.originalQuote.procedureName && revisedQuoteIsComparable(original, revised, interpretation)) {
      await client.quote.update({ where: { id: quote.id }, data: { scopeConfirmedAt: message.receivedAt ?? new Date(), scopeEvidenceNote: "Synthetic provider explicitly stated the same one-eye scope and unchanged inclusions; compare with original source email before relying on it." } });
      const comparison = await loadComparison(negotiation.caseId, client);
      const entry = comparison?.groups.find((group) => group.current.quote.id === quote.id)?.current;
      if (entry?.result.rankable && entry.result.quotedPatientCostCents === interpretation.revisedPatientGapCents) revisedQuoteId = quote.id;
    }
    if (!revisedQuoteId) decision = "NEEDS_CLARIFICATION";
  }
  if (negotiation.status === "SIMULATED_SENT" || negotiation.status === "SENT") {
    assertNegotiationTransition(negotiation.status, "AWAITING_RESPONSE");
    await client.negotiation.update({ where: { id: negotiation.id }, data: { status: "AWAITING_RESPONSE" } });
    await client.auditEvent.create({ data: { caseId: negotiation.caseId, negotiationId: negotiation.id, action: "NEGOTIATION_UPDATED", actor: "SYSTEM", detailsJson: JSON.stringify({ from: negotiation.status, to: "AWAITING_RESPONSE", simulated: message.isSimulation }) } });
  }
  const current = await client.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } });
  if (!["CLOSED", "ACCEPTED", "DRAFT", "AWAITING_APPROVAL"].includes(current.status) && current.status !== decision) {
    assertNegotiationTransition(current.status as Parameters<typeof assertNegotiationTransition>[0], decision);
    await client.negotiation.update({ where: { id: negotiation.id }, data: {
      status: decision, counteroffer: decision === "COUNTEROFFERED" ? message.body : current.counteroffer,
      revisedQuoteId: revisedQuoteId ?? current.revisedQuoteId,
      agreedPatientAmountCents: revisedQuoteId ? interpretation!.revisedPatientGapCents : null,
      agreedResult: revisedQuoteId ? "Provider-confirmed revised fictional written quote; no realised saving is established." : null,
    } });
  }
  const saved = await client.negotiationResponse.create({ data: { negotiationId: negotiation.id, emailMessageId, providerMode: result.providerMode, interpretationStatus: result.status, interpretationJson: interpretation ? JSON.stringify(interpretation) : null, errorSummary: result.message, revisedQuoteId } });
  await client.auditEvent.create({ data: { caseId: negotiation.caseId, negotiationId: negotiation.id, emailMessageId, action: "NEGOTIATION_UPDATED", actor: "SYSTEM", eventKey: `negotiation-response:${emailMessageId}`, detailsJson: JSON.stringify({ from: current.status, to: decision, revisedQuoteId, simulated: message.isSimulation, providerMode: result.providerMode, unsupported: result.status !== "COMPLETE" }) } });
  return saved;
}
