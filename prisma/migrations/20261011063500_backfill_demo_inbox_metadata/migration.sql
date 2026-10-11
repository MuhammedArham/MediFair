UPDATE "EmailMessage"
SET "fromAddress" = CASE
      WHEN "direction" = 'OUTBOUND' THEN COALESCE("fromAddress", 'medifair-demo@mock.invalid')
      ELSE COALESCE("fromAddress", (SELECT "email" FROM "Provider" WHERE "Provider"."id" = "EmailMessage"."providerId"))
    END,
    "recipientAddress" = CASE
      WHEN "direction" = 'OUTBOUND' THEN COALESCE("recipientAddress", (SELECT "email" FROM "Provider" WHERE "Provider"."id" = "EmailMessage"."providerId"))
      ELSE COALESCE("recipientAddress", 'replies@mock.invalid')
    END,
    "matchStatus" = CASE WHEN "direction" = 'INBOUND' AND "providerId" IS NOT NULL THEN 'MATCHED' ELSE "matchStatus" END
WHERE "caseId" = 'demo-case' AND "isSimulation" = 1;

UPDATE "QuoteRequest"
SET "quoteResponseStatus" = CASE
      WHEN EXISTS (
        SELECT 1 FROM "Quote"
        WHERE "Quote"."caseId" = "QuoteRequest"."caseId"
          AND "Quote"."providerId" = "QuoteRequest"."providerId"
          AND "Quote"."completeness" = 'INCOMPLETE'
      ) THEN 'INCOMPLETE_QUOTE'
      ELSE 'COMPLETE_QUOTE'
    END
WHERE "caseId" = 'demo-case' AND "isSimulation" = 1 AND "status" = 'REPLIED' AND "quoteResponseStatus" = 'NONE';
