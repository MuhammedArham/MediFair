-- Seeded demo mail was simulated and must never be described as delivered.
UPDATE "EmailMessage"
SET "deliveryStatus" = 'SIMULATED'
WHERE "isSimulation" = 1 AND "deliveryStatus" = 'DELIVERED';
