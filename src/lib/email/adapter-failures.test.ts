import { describe, expect, it, vi } from "vitest";
import type { Resend } from "resend";
import { ResendEmailService } from "./email-service";
const message = { fromEmail: "demo@controlled.test", toEmail: "recipient@controlled.test", replyToEmail: "reply@controlled.test", subject: "Synthetic test", body: "Fictional data only", idempotencyKey: "mock-test-claim" };
describe("production email SDK failure handling without network", () => {
  it.each([
    ["invalid_api_key", 401, "AUTH_ERROR"], ["rate_limit_exceeded", 429, "RATE_LIMITED"], ["invalid_from_address", 403, "DOMAIN_ERROR"], ["validation_error", 422, "FAILED"],
  ])("maps %s to a safe persisted failure kind", async (name, statusCode, kind) => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { name, statusCode, message: "Provider diagnostics containing private information" } });
    const service = new ResendEmailService("test-only", { emails: { send } } as unknown as Resend);
    await expect(service.send(message)).rejects.toMatchObject({ kind });
    expect(send).toHaveBeenCalledWith({ from: "MediFair AI <demo@controlled.test>", to: [message.toEmail], replyTo: message.replyToEmail, subject: message.subject, text: message.body }, { idempotencyKey: message.idempotencyKey });
  });
  it("treats timeouts and missing IDs as uncertain instead of delivered", async () => {
    for (const send of [vi.fn().mockRejectedValue(new Error("timeout")), vi.fn().mockResolvedValue({ data: {}, error: null })]) {
      await expect(new ResendEmailService("test-only", { emails: { send } } as unknown as Resend).send(message)).rejects.toMatchObject({ kind: "UNCERTAIN" });
      expect(send).toHaveBeenCalledOnce();
    }
  });
  it("fails closed on unverified sending domains", async () => {
    const list = vi.fn().mockResolvedValue({ data: { data: [{ name: "controlled.test", status: "pending", capabilities: { sending: "enabled" } }], has_more: false }, error: null });
    await expect(new ResendEmailService("test-only", { domains: { list } } as unknown as Resend).verifySendingDomain(message.fromEmail)).rejects.toMatchObject({ kind: "DOMAIN_ERROR" });
  });
});
