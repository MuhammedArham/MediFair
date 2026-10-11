import { describe, expect, it } from "vitest";
import { workspaceAccessAllowed } from "./workspace-access";

describe("workspace access", () => {
  const production = { NODE_ENV: "production", APP_ACCESS_USERNAME: "operator", APP_ACCESS_PASSWORD: "synthetic-password-at-least-16" } as NodeJS.ProcessEnv;
  it("fails closed without configured credentials", () => {
    expect(workspaceAccessAllowed(new Headers({ host: "demo.example" }), { NODE_ENV: "production" })).toBe(false);
    expect(workspaceAccessAllowed(new Headers({ authorization: "Basic " + Buffer.from("operator:short").toString("base64") }), { ...production, APP_ACCESS_PASSWORD: "short" })).toBe(false);
  });
  it("requires exact Basic credentials in production", () => {
    const valid = new Headers({ authorization: "Basic " + Buffer.from("operator:synthetic-password-at-least-16").toString("base64") });
    expect(workspaceAccessAllowed(valid, production)).toBe(true);
    expect(workspaceAccessAllowed(new Headers({ authorization: "Basic " + Buffer.from("operator:wrong-password").toString("base64") }), production)).toBe(false);
    expect(workspaceAccessAllowed(new Headers({ authorization: "basic " + Buffer.from("operator:synthetic-password-at-least-16").toString("base64") }), production)).toBe(true);
    expect(workspaceAccessAllowed(new Headers({ authorization: "Basic " + Buffer.from("operator:synthetic-password-at-least-16:with-colon").toString("base64") }), { ...production, APP_ACCESS_PASSWORD: "synthetic-password-at-least-16:with-colon" })).toBe(true);
    expect(workspaceAccessAllowed(new Headers({ authorization: "Basic not-base64!" }), production)).toBe(false);
    const unicode = { ...production, APP_ACCESS_USERNAME: "opérateur", APP_ACCESS_PASSWORD: "pässword-long-enough-123" };
    expect(workspaceAccessAllowed(new Headers({ authorization: "Basic " + Buffer.from("opérateur:pässword-long-enough-123", "utf8").toString("base64") }), unicode)).toBe(true);
  });
  it("keeps development access on loopback", () => {
    expect(workspaceAccessAllowed(new Headers({ host: "127.0.0.1:3000" }), { NODE_ENV: "development", DEMO_MODE: "true" })).toBe(true);
    expect(workspaceAccessAllowed(new Headers({ host: "demo.example" }), { NODE_ENV: "development", DEMO_MODE: "true" })).toBe(false);
  });
});
