import { z } from "zod";
import { Resend } from "resend";

export type SendErrorKind = "CONFIG_REQUIRED" | "AUTH_ERROR" | "DOMAIN_ERROR" | "RATE_LIMITED" | "FAILED" | "UNCERTAIN" | "RECIPIENT_BLOCKED";

export class EmailServiceError extends Error {
  constructor(public readonly kind: SendErrorKind, message: string) { super(message); }
}

export type OutboundEmail = {
  fromEmail: string; toEmail: string; replyToEmail: string;
  subject: string; body: string; idempotencyKey: string;
  approval?: { quoteRequestId: string; caseId: string; providerId: string; patientProfileId: string; approvedContentHash: string } |
    { negotiationRequestId: string; caseId: string; providerId: string; patientProfileId: string; approvedContentHash: string };
};

export interface EmailService {
  verifySendingDomain(fromEmail: string): Promise<void>;
  send(message: OutboundEmail): Promise<{ providerMessageId: string }>;
}

const email = z.email();

export type EmailConfiguration = {
  apiKey: string; fromEmail: string; inboundAddress: string;
  webhookSecret: string; appBaseUrl: string; allowedRecipients: Set<string>;
  /** Explicit opt-in for Resend's restricted, own-account test sender. */
  testRecipient?: string;
};

export function readEmailConfiguration(env: NodeJS.ProcessEnv = process.env): { configuration: EmailConfiguration | null; missing: string[] } {
  const missing: string[] = [];
  for (const key of ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_INBOUND_ADDRESS", "RESEND_WEBHOOK_SECRET", "APP_BASE_URL"] as const) if (!env[key]?.trim()) missing.push(key);
  const fromEmail = env.RESEND_FROM_EMAIL?.trim() ?? "";
  const inboundAddress = env.RESEND_INBOUND_ADDRESS?.trim() ?? "";
  if (fromEmail && !email.safeParse(fromEmail).success) missing.push("valid RESEND_FROM_EMAIL");
  if (inboundAddress && !email.safeParse(inboundAddress).success) missing.push("valid RESEND_INBOUND_ADDRESS");
  const appUrl = env.APP_BASE_URL?.trim() ?? "";
  if (appUrl && (!z.url().safeParse(appUrl).success || !/^https?:\/\//i.test(appUrl))) missing.push("valid APP_BASE_URL");
  const demo = env.DEMO_MODE !== "false";
  const allowedRecipients = new Set((env.DEMO_ALLOWED_RECIPIENTS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (demo && !allowedRecipients.size) missing.push("DEMO_ALLOWED_RECIPIENTS");
  if ([...allowedRecipients].some((recipient) => !email.safeParse(recipient).success)) missing.push("valid DEMO_ALLOWED_RECIPIENTS");
  const testRecipient = env.RESEND_TEST_RECIPIENT?.trim().toLowerCase() || undefined;
  if (fromEmail.toLowerCase() === "onboarding@resend.dev" || testRecipient) {
    if (!demo || fromEmail.toLowerCase() !== "onboarding@resend.dev" || !testRecipient || !email.safeParse(testRecipient).success || allowedRecipients.size !== 1 || !allowedRecipients.has(testRecipient)) {
      missing.push("Resend test sender requires DEMO_MODE=true and RESEND_TEST_RECIPIENT matching the sole DEMO_ALLOWED_RECIPIENTS address");
    }
  }
  if (missing.length) return { configuration: null, missing };
  return { configuration: {
    apiKey: env.RESEND_API_KEY!.trim(), fromEmail, inboundAddress,
    webhookSecret: env.RESEND_WEBHOOK_SECRET!.trim(), appBaseUrl: appUrl,
    allowedRecipients, testRecipient,
  }, missing: [] };
}

function resendError(error: { name: string; message: string; statusCode: number | null }): EmailServiceError {
  if (error.statusCode === 401 || ["invalid_api_key", "missing_api_key", "restricted_api_key", "invalid_access", "invalid_permission", "suspended_api_key"].includes(error.name) || /api key is invalid/i.test(error.message)) return new EmailServiceError("AUTH_ERROR", "Resend authentication failed. Check the API key and its permissions.");
  if (error.statusCode === 429 || error.name === "rate_limit_exceeded") return new EmailServiceError("RATE_LIMITED", "Resend rate limit reached. No retry was attempted; review this request before trying again.");
  if (/only send testing emails to your own email/i.test(error.message)) return new EmailServiceError("RECIPIENT_BLOCKED", "Resend's shared test sender can send only to the account owner's inbox. Check the controlled test recipient.");
  if (error.name === "invalid_from_address" || /domain.*(verif|not found)|unverified/i.test(error.message)) return new EmailServiceError("DOMAIN_ERROR", "The sending domain or From address is not verified in Resend.");
  return new EmailServiceError("FAILED", `Resend rejected this message (${error.name}). Review its dashboard details before retrying.`);
}

export class ResendEmailService implements EmailService {
  private readonly resend: Resend;
  constructor(apiKey: string, injectedResend?: Resend, private readonly testRecipient?: string) { this.resend = injectedResend ?? new Resend(apiKey); }

  private isRestrictedTestSender(fromEmail: string) {
    if (fromEmail.toLowerCase() !== "onboarding@resend.dev") {
      if (this.testRecipient) throw new EmailServiceError("CONFIG_REQUIRED", "Restricted testing requires the exact onboarding@resend.dev sender.");
      return false;
    }
    if (!this.testRecipient || !email.safeParse(this.testRecipient).success || process.env.DEMO_MODE === "false") throw new EmailServiceError("CONFIG_REQUIRED", "The Resend test sender requires an explicit controlled test recipient in demo mode.");
    return true;
  }

  async verifySendingDomain(fromEmail: string): Promise<void> {
    // Resend owns this documented shared testing domain. This narrow opt-in is
    // not verification of a custom domain; Resend also enforces account ownership.
    if (this.isRestrictedTestSender(fromEmail)) return;
    const domainName = fromEmail.split("@")[1]?.toLowerCase();
    if (!domainName) throw new EmailServiceError("CONFIG_REQUIRED", "A valid sending address is required.");
    let after: string | undefined;
    do {
      const result = await this.resend.domains.list(after ? { limit: 100, after } : { limit: 100 });
      if (result.error) throw resendError(result.error);
      const domain = result.data.data.find((item) => item.name.toLowerCase() === domainName);
      if (domain) {
        if (domain.status === "verified" && domain.capabilities.sending === "enabled") return;
        throw new EmailServiceError("DOMAIN_ERROR", "The configured From domain is not verified and enabled for sending in Resend.");
      }
      after = result.data.has_more ? result.data.data.at(-1)?.id : undefined;
    } while (after);
    throw new EmailServiceError("DOMAIN_ERROR", "The configured From domain was not found as a verified sending domain in Resend.");
  }

  async send(message: OutboundEmail): Promise<{ providerMessageId: string }> {
    if (this.isRestrictedTestSender(message.fromEmail) && message.toEmail.toLowerCase() !== this.testRecipient?.toLowerCase()) throw new EmailServiceError("RECIPIENT_BLOCKED", "Restricted Resend testing can send only to RESEND_TEST_RECIPIENT.");
    try {
      const result = await this.resend.emails.send({
        from: `MediFair AI <${message.fromEmail}>`, to: [message.toEmail],
        replyTo: message.replyToEmail, subject: message.subject, text: message.body,
      }, { idempotencyKey: message.idempotencyKey });
      if (result.error) throw resendError(result.error);
      if (!result.data.id) throw new EmailServiceError("UNCERTAIN", "Resend returned no message ID. Reconcile the send in Resend before taking another action.");
      return { providerMessageId: result.data.id };
    } catch (error) {
      if (error instanceof EmailServiceError) throw error;
      throw new EmailServiceError("UNCERTAIN", "The Resend request outcome is unknown. Check the Resend dashboard before any retry.");
    }
  }
}

export class DemoAllowlistEmailService implements EmailService {
  constructor(private readonly inner: EmailService, private readonly allowedRecipients: ReadonlySet<string>) {}
  verifySendingDomain(fromEmail: string) { return this.inner.verifySendingDomain(fromEmail); }
  send(message: OutboundEmail) {
    if (!this.allowedRecipients.has(message.toEmail.toLowerCase())) throw new EmailServiceError("RECIPIENT_BLOCKED", "The recipient is not in DEMO_ALLOWED_RECIPIENTS.");
    return this.inner.send(message);
  }
}

export function createEmailService(configuration: EmailConfiguration, demo = process.env.DEMO_MODE !== "false"): EmailService {
  const service = new ResendEmailService(configuration.apiKey, undefined, configuration.testRecipient);
  return demo ? new DemoAllowlistEmailService(service, configuration.allowedRecipients) : service;
}
