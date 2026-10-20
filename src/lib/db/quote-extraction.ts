import { z } from "zod";
import { createAIProvider } from "../ai/quote-extraction-provider";
import { quoteExtractionSchema, type ExtractionResult } from "../ai/quote-extraction-schema";
import { getDatabaseClient, type DatabaseClient } from "./client";

const reviewSchema = quoteExtractionSchema;
const categoryMap = { SURGEON: "SURGEON", ASSISTANT_SURGEON: "OTHER", ANAESTHETIST: "ANAESTHETIST", HOSPITAL: "HOSPITAL", ACCOMMODATION: "ACCOMMODATION", THEATRE: "THEATRE", DEVICE: "DEVICES", DIAGNOSTIC_TEST: "OTHER", MEDICINE: "MEDICINES", EXCESS: "EXCESS", CO_PAYMENT: "CO_PAYMENT", OTHER: "OTHER" } as const;

export async function processQuoteExtraction(emailMessageId: string, client: DatabaseClient = getDatabaseClient()): Promise<{ status: string; extractionId?: string }> {
  const id = z.string().trim().min(1).max(100).parse(emailMessageId);
  const message = await client.emailMessage.findUnique({ where: { id }, include: { case: { include: { patientProfile: true } }, provider: true } });
  if (!message || message.direction !== "INBOUND" || message.matchStatus !== "MATCHED" || !message.case || !message.provider) return { status: "UNSUPPORTED" };
  const fictional = message.case.isFictional && message.case.patientProfile.isFictional;
  if (!fictional || !message.case.patientProfile.consentGivenAt || message.case.patientProfile.consentWithdrawnAt) return { status: "UNSUPPORTED" };
  const existing = await client.quoteExtraction.findUnique({ where: { emailMessageId: id } });
  if (existing?.status === "COMPLETE" || existing?.status === "UNSUPPORTED") return { status: existing.status, extractionId: existing.id };

  let result: ExtractionResult;
  try {
    const provider = createAIProvider();
    // Transport provenance is independent of data classification. A real Resend
    // reply can contain a checked-in synthetic fixture; the AI adapter retains
    // its fixture-only external-transmission gate in demo mode.
    result = await provider.extractQuote({ subject: message.subject, body: message.body, providerName: message.provider.practiceName, isFictional: fictional });
  } catch (error) {
    const record = await client.quoteExtraction.upsert({
      where: { emailMessageId: id },
      create: { emailMessageId: id, providerMode: (process.env.AI_PROVIDER?.trim().toLowerCase() || "mock") === "openai" ? "OPENAI" : "MOCK_AI", status: "FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 300) : "Extraction failed." },
      update: { status: "FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 300) : "Extraction failed." },
    });
    return { status: "FAILED", extractionId: record.id };
  }

  if (result.status === "UNSUPPORTED" || !result.extraction) {
    const record = await client.quoteExtraction.upsert({
      where: { emailMessageId: id },
      create: { emailMessageId: id, providerMode: "MOCK_AI", status: "UNSUPPORTED", errorSummary: result.message },
      update: { providerMode: "MOCK_AI", status: "UNSUPPORTED", errorSummary: result.message, resultJson: null },
    });
    return { status: "UNSUPPORTED", extractionId: record.id };
  }

  const extraction = quoteExtractionSchema.parse(result.extraction);
  const mismatch = arithmeticMismatch(extraction);
  if (mismatch && !extraction.humanReviewFlags.some((flag) => flag.toLowerCase().includes("total differs"))) extraction.humanReviewFlags.push("Deterministic arithmetic check: stated component fees do not match the declared total.");
  const quote = await client.quote.findFirst({ where: { sourceEmailId: id } });
  const saved = await client.$transaction(async (tx) => {
    let quoteId = quote?.id ?? null;
    if (!quoteId && ["QUOTE", "PARTIAL_QUOTE"].includes(extraction.messageKind)) {
      const latest = await tx.quote.findFirst({ where: { caseId: message.caseId!, providerId: message.providerId! }, orderBy: { revisionNumber: "desc" } });
      const created = await tx.quote.create({ data: { caseId: message.caseId!, providerId: message.providerId!, sourceEmailId: id, revisionOfId: latest?.id ?? null, revisionNumber: (latest?.revisionNumber ?? 0) + 1, procedureName: message.case!.procedureName, issueDate: message.receivedAt ?? message.createdAt, expiryDate: expiryDate(message.receivedAt ?? message.createdAt, extraction.provider.validityDays), completeness: extraction.missingFees.length || mismatch ? "INCOMPLETE" : "COMPLETE", confirmationStatus: "PROVIDER_STATED", isFictional: fictional, notes: "Extracted values require human review. See source email and evidence references." } });
      quoteId = created.id;
    } else if (quoteId) {
      await tx.quote.update({ where: { id: quoteId }, data: { expiryDate: expiryDate(message.receivedAt ?? message.createdAt, extraction.provider.validityDays), completeness: extraction.missingFees.length || mismatch ? "INCOMPLETE" : "COMPLETE", confirmationStatus: "PROVIDER_STATED", notes: "Extracted values require human review. See source email and evidence references." } });
    }
    if (quoteId) {
      await tx.costLineItem.deleteMany({ where: { quoteId } });
      await tx.costLineItem.createMany({ data: [
        ...extraction.fees.filter((item) => item.billedAmountCents !== null).map((item) => ({ quoteId: quoteId!, category: categoryMap[item.category], description: item.description, payer: item.payer, billedAmountCents: item.billedAmountCents, sourceEmailId: id, sourceLocator: item.evidence, isFictional: fictional })),
        ...(extraction.benefits.medicareCents === null ? [] : [{ quoteId, category: "MEDICARE_BENEFIT" as const, description: "Medicare benefit stated in provider email", payer: "MEDICARE" as const, billedAmountCents: null, knownBenefitCents: extraction.benefits.medicareCents, sourceEmailId: id, sourceLocator: null, isFictional: fictional }]),
        ...(extraction.benefits.privateInsurerCents === null ? [] : [{ quoteId, category: "INSURER_BENEFIT" as const, description: "Private insurer benefit stated in provider email", payer: "INSURER" as const, billedAmountCents: null, knownBenefitCents: extraction.benefits.privateInsurerCents, sourceEmailId: id, sourceLocator: null, isFictional: fictional }]),
        ...(extraction.insurance.expectedPatientOutOfPocketCents === null ? [] : [{ quoteId, category: "OTHER" as const, description: "Expected patient out-of-pocket stated in provider email", payer: "PATIENT" as const, billedAmountCents: null, patientResponsibilityCents: extraction.insurance.expectedPatientOutOfPocketCents, sourceEmailId: id, sourceLocator: null, isFictional: fictional }]),
      ] });
    }
    await tx.quoteEvidence.deleteMany({ where: { extraction: { emailMessageId: id } } });
    const extractionRecord = await tx.quoteExtraction.upsert({
      where: { emailMessageId: id },
      create: { emailMessageId: id, quoteId, providerMode: result.providerMode, status: "COMPLETE", resultJson: JSON.stringify(extraction) },
      update: { quoteId, providerMode: result.providerMode, status: "COMPLETE", resultJson: JSON.stringify(extraction), errorSummary: null, reviewedResultJson: null, reviewedAt: null },
    });
    if (extraction.evidence.length) await tx.quoteEvidence.createMany({ data: extraction.evidence.map((item) => ({ extractionId: extractionRecord.id, fieldPath: item.fieldPath, excerpt: item.excerpt })) });
    if (message.quoteRequestId) await tx.quoteRequest.update({ where: { id: message.quoteRequestId }, data: { quoteResponseStatus: extraction.messageKind === "REFUSAL" ? "CONSULTATION_REQUIRED" : extraction.messageKind === "NO_PRICES" ? "MORE_INFORMATION_REQUIRED" : quoteId ? extraction.missingFees.length || mismatch ? "INCOMPLETE_QUOTE" : "COMPLETE_QUOTE" : "AMBIGUOUS" } });
    await tx.auditEvent.create({ data: { caseId: message.caseId!, quoteRequestId: message.quoteRequestId, emailMessageId: id, action: "QUOTE_EXTRACTION_COMPLETED", actor: "SYSTEM", eventKey: `quote-extraction:${id}`, detailsJson: JSON.stringify({ extractionId: extractionRecord.id, providerMode: result.providerMode, mismatch, simulated: message.isSimulation }) } });
    return extractionRecord;
  });
  return { status: "COMPLETE", extractionId: saved.id };
}

export function arithmeticMismatch(extraction: z.infer<typeof quoteExtractionSchema>) {
  if (extraction.arithmeticDeclaredFeeTotalCents === null || extraction.fees.length === 0 || extraction.fees.some((fee) => fee.includedInTotal !== true || fee.billedAmountCents === null)) return false;
  const sum = extraction.fees.reduce((total, fee) => total + (fee.billedAmountCents ?? 0), 0);
  return sum !== extraction.arithmeticDeclaredFeeTotalCents;
}

function expiryDate(issued: Date, days: number | null) { if (days === null) return null; const result = new Date(issued); result.setUTCDate(result.getUTCDate() + days); return result; }

export async function saveQuoteCorrection(emailMessageId: string, input: unknown, client: DatabaseClient = getDatabaseClient()) {
  const id = z.string().trim().min(1).max(100).parse(emailMessageId);
  const corrected = reviewSchema.parse(input);
  const extraction = await client.quoteExtraction.findUniqueOrThrow({ where: { emailMessageId: id }, include: { emailMessage: { include: { case: { include: { patientProfile: true } }, provider: true } }, quote: true } });
  const fictional = Boolean(extraction.emailMessage.case?.isFictional && extraction.emailMessage.case.patientProfile.isFictional);
  if (!fictional || !extraction.emailMessage.case?.patientProfile.consentGivenAt || extraction.emailMessage.case.patientProfile.consentWithdrawnAt) throw new Error("Manual review is limited to consenting synthetic case messages.");
  return client.$transaction(async (tx) => {
    const saved = await tx.quoteExtraction.update({ where: { emailMessageId: id }, data: { reviewedResultJson: JSON.stringify(corrected), reviewedAt: new Date(), errorSummary: null } });
    if (extraction.quoteId) {
      await tx.costLineItem.deleteMany({ where: { quoteId: extraction.quoteId } });
      await tx.costLineItem.createMany({ data: [
        ...corrected.fees.filter((item) => item.billedAmountCents !== null).map((item) => ({ quoteId: extraction.quoteId!, category: categoryMap[item.category], description: item.description, payer: item.payer, billedAmountCents: item.billedAmountCents, sourceEmailId: id, sourceLocator: item.evidence, isFictional: fictional })),
        ...(corrected.benefits.medicareCents === null ? [] : [{ quoteId: extraction.quoteId, category: "MEDICARE_BENEFIT" as const, description: "Medicare benefit stated in reviewed email", payer: "MEDICARE" as const, billedAmountCents: null, knownBenefitCents: corrected.benefits.medicareCents, sourceEmailId: id, sourceLocator: null, isFictional: fictional }]),
        ...(corrected.benefits.privateInsurerCents === null ? [] : [{ quoteId: extraction.quoteId, category: "INSURER_BENEFIT" as const, description: "Insurer benefit stated in reviewed email", payer: "INSURER" as const, billedAmountCents: null, knownBenefitCents: corrected.benefits.privateInsurerCents, sourceEmailId: id, sourceLocator: null, isFictional: fictional }]),
        ...(corrected.insurance.expectedPatientOutOfPocketCents === null ? [] : [{ quoteId: extraction.quoteId, category: "OTHER" as const, description: "Patient amount stated in reviewed email", payer: "PATIENT" as const, billedAmountCents: null, patientResponsibilityCents: corrected.insurance.expectedPatientOutOfPocketCents, sourceEmailId: id, sourceLocator: null, isFictional: fictional }]),
      ] });
      const mismatch = arithmeticMismatch(corrected);
      await tx.quote.update({ where: { id: extraction.quoteId }, data: { completeness: corrected.missingFees.length || mismatch ? "INCOMPLETE" : "COMPLETE", expiryDate: expiryDate(extraction.emailMessage.receivedAt ?? extraction.emailMessage.createdAt, corrected.provider.validityDays), confirmationStatus: "PROVIDER_STATED", financialEvidenceConfirmedAt: null, financialEvidenceNote: null, notes: "Patient-reviewed extraction. Original source email and extraction evidence are retained; provider figures are not independently verified." } });
      await tx.quoteEvidence.deleteMany({ where: { extractionId: saved.id } });
      if (corrected.evidence.length) await tx.quoteEvidence.createMany({ data: corrected.evidence.map((item) => ({ extractionId: saved.id, fieldPath: item.fieldPath, excerpt: item.excerpt })) });
    }
    await tx.auditEvent.create({ data: { caseId: extraction.emailMessage.caseId!, emailMessageId: id, action: "QUOTE_EXTRACTION_CORRECTED", actor: "PATIENT", eventKey: `quote-correction:${id}:${saved.updatedAt.getTime()}`, detailsJson: JSON.stringify({ extractionId: saved.id, humanReviewed: true }) } });
    return saved;
  });
}

export async function retryQuoteExtraction(emailMessageId: string, client: DatabaseClient = getDatabaseClient()) {
  const id = z.string().trim().min(1).max(100).parse(emailMessageId);
  await client.quoteExtraction.deleteMany({ where: { emailMessageId: id, status: { in: ["FAILED", "UNSUPPORTED"] } } });
  return processQuoteExtraction(id, client);
}
