import { describe, expect, it } from "vitest";
import {
  sanitizeString,
  sanitizeValue,
  StreamingRedactor,
} from "./redaction.js";

describe("trusted runner redaction", () => {
  it.each([
    "Bearer abc.def.ghi",
    "Basic YWJjZA==",
    "ghp_abcdefghijklmnopqrstuvwxyz",
    "AKIA1234567890ABCDEF",
    "token=secret-value",
    "password: top-secret",
  ])("masks credential form %s", (value) => {
    expect(sanitizeString(value)).toBe("[REDACTED]");
  });
  it("masks private keys and URL userinfo", () => {
    const output = sanitizeString(
      "https://user:pass@example.com -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----",
    );
    expect(output).not.toContain("pass");
    expect(output).not.toContain("PRIVATE KEY-----abc");
  });
  it.each(["secret", "SECRET", "api-key", "API_KEY"])(
    "masks named value %s",
    (name) => {
      expect(sanitizeString(`${name}=hidden`)).not.toContain("hidden");
    },
  );
  it("masks known values including duplicates and substrings", () => {
    const output = sanitizeString("prefix-long-secret long-secret", [
      "secret",
      "long-secret",
      "long-secret",
    ]);
    expect(output).not.toContain("secret");
  });
  it("masks URL encoded and double encoded known values", () => {
    expect(
      sanitizeString("a%252Fsecret", ["/secret"]).toLowerCase(),
    ).not.toContain("secret");
  });
  it("masks secrets split across chunks", () => {
    const redactor = new StreamingRedactor(["split-secret"]);
    const output =
      redactor.push("split-") + redactor.push("secret") + redactor.finish();
    expect(output).not.toContain("split-secret");
  });
  it.each([
    ["two-way", ["split-", "secret"]],
    ["many-way", ["s", "pl", "it-", "se", "cret"]],
    ["over-512-boundary", ["x".repeat(600), "split-secret"]],
  ] as const)("never emits a secret for %s chunking", (_name, chunks) => {
    const redactor = new StreamingRedactor(["split-secret"]);
    const output =
      chunks.map((chunk) => redactor.push(chunk)).join("") + redactor.finish();
    expect(output).not.toContain("split-secret");
  });
  it("handles a UTF-8 secret split at a byte boundary", () => {
    const bytes = new TextEncoder().encode("秘密");
    const redactor = new StreamingRedactor(["秘密"]);
    const output =
      redactor.push(bytes.slice(0, 2)) +
      redactor.push(bytes.slice(2)) +
      redactor.finish();
    expect(output).not.toContain("秘密");
  });
  it.each([
    "Bearer%20abc.def.ghi",
    "token%3Dsecret-value",
    "password%3Dtop-secret",
    "https%3A%2F%2Fuser%3Apass%40example.com",
  ])("masks percent-encoded credential %s", (value) => {
    expect(sanitizeString(value)).not.toMatch(
      /abc\.def|secret-value|top-secret|pass/,
    );
  });
  it("masks several chunks and stderr-like text", () => {
    const redactor = new StreamingRedactor(["stderr-secret"]);
    const output =
      redactor.push("stderr-") + redactor.push("secret") + redactor.finish();
    expect(output).not.toContain("stderr-secret");
  });
  it("masks double-percent encoded credentials", () => {
    expect(
      sanitizeString("Bearer%2520abc.def.ghi token%253Ddouble-secret"),
    ).not.toMatch(/abc\.def|double-secret/);
  });
  it("sanitizes Buffer-like chunks", () => {
    const output = new StreamingRedactor(["buffer-secret"]).push(
      new TextEncoder().encode("buffer-secret"),
    );
    expect(output + "").not.toContain("buffer-secret");
  });
  it("sanitizes Error objects without exposing message secret", () => {
    const output = sanitizeValue(new Error("password=secret"));
    expect(JSON.stringify(output)).not.toContain("secret");
  });
  it("sanitizes nested objects", () => {
    const output = sanitizeValue({
      stderr: "token=secret",
      child: { password: "secret" },
    });
    expect(JSON.stringify(output)).not.toContain("secret");
  });
  it("redacts sensitive object and array values as a whole", () => {
    const output = sanitizeValue({
      secret: { nested: "raw" },
      token: ["raw", { password: "raw" }],
    });
    expect(JSON.stringify(output)).not.toContain("raw");
  });
  it("handles circular objects", () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(JSON.stringify(sanitizeValue(value))).toContain("CYCLE");
  });
  it("limits depth and collection size", () => {
    let value: unknown = "secret";
    for (let i = 0; i < 12; i += 1) value = { value };
    expect(JSON.stringify(sanitizeValue(value))).toContain("DEPTH");
  });
  it("does not return unsupported raw values", () => {
    expect(sanitizeValue(Symbol("secret"))).toBe("[REDACTED:UNSUPPORTED]");
  });
  it("keeps ordinary text while sanitizing", () => {
    expect(sanitizeString("hello world")).toBe("hello world");
  });
  it("masks JWT-like bearer material case-insensitively", () => {
    expect(sanitizeString("bEaReR eyJhbGciOiJ9.payload.sig")).not.toContain(
      "payload",
    );
  });
});
