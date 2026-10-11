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
  });
  it("keeps development access on loopback", () => {
    expect(workspaceAccessAllowed(new Headers({ host: "127.0.0.1:3000" }), { NODE_ENV: "development", DEMO_MODE: "true" })).toBe(true);
    expect(workspaceAccessAllowed(new Headers({ host: "demo.example" }), { NODE_ENV: "development", DEMO_MODE: "true" })).toBe(false);
  });
});
