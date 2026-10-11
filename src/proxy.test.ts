import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const password = "synthetic-test-password-123";
const auth = "Basic " + Buffer.from(`operator:${password}`).toString("base64");

afterEach(() => vi.unstubAllEnvs());

describe("production workspace proxy", () => {
  it("returns the app's Basic challenge when credentials are absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ACCESS_USERNAME", "operator");
    vi.stubEnv("APP_ACCESS_PASSWORD", password);
    const response = proxy(new NextRequest("https://demo.example/"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Basic realm="MediFair AI demo", charset="UTF-8"');
  });

  it("passes a matching browser Basic header to the workspace", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ACCESS_USERNAME", "operator");
    vi.stubEnv("APP_ACCESS_PASSWORD", password);
    const response = proxy(new NextRequest("https://demo.example/", { headers: { authorization: auth } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("rejects an unconfigured deployment even with otherwise valid credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ACCESS_USERNAME", "");
    vi.stubEnv("APP_ACCESS_PASSWORD", "");
    const response = proxy(new NextRequest("https://demo.example/", { headers: { authorization: auth } }));
    expect(response.status).toBe(401);
  });
});
