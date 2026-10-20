import { createHmac } from "node:crypto";
import { Resend } from "resend";
import { describe, expect, it } from "vitest";
import { verifyResendWebhook } from "./resend-webhook";

// The real SDK verifies signatures locally. These are synthetic keys and events;
// constructing Resend does not make a network request.
const key = Buffer.alloc(32, 7);
const secret = `whsec_${key.toString("base64")}`;
const sdk = new Resend("synthetic-test-key-no-network");
function signed(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const id = "msg_synthetic-signature-test";
  const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
  return { id, timestamp, signature };
}

describe("Resend SDK cryptographic webhook verification", () => {
  const body = '{"type":"email.delivered","data":{"email_id":"synthetic-message"}}';
  it("accepts authentic raw payloads and trims only copied configuration whitespace", () => {
    for (const configured of [secret, ` ${secret}\r\n`]) {
      expect(verifyResendWebhook(body, signed(body), configured, sdk)).toEqual(JSON.parse(body));
    }
  });
  it("rejects a different signing secret, missing signature and a tampered payload", () => {
    const headers = signed(body);
    expect(() => verifyResendWebhook(body, headers, `whsec_${Buffer.alloc(32, 8).toString("base64")}`, sdk)).toThrow();
    expect(() => verifyResendWebhook(body, { ...headers, signature: "" }, secret, sdk)).toThrow();
    expect(() => verifyResendWebhook(body + " ", headers, secret, sdk)).toThrow();
  });
  it("rejects expired and future signatures", () => {
    for (const offset of [-601, 601]) {
      expect(() => verifyResendWebhook(body, signed(body, String(Math.floor(Date.now() / 1000) + offset)), secret, sdk)).toThrow();
    }
  });
});
