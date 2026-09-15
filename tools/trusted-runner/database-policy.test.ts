import { describe, expect, it } from "vitest";
import {
  e2eCommand,
  migrationCommands,
  parseDatabaseUrl,
  validateDatabaseRequest,
  validateE2ERequest,
} from "./database-policy.js";

const base = {
  migrationName: "m1",
  databaseUrl: "postgresql://dev@localhost:5432/development",
  role: "developer",
  databaseName: "development",
  planHash: "a".repeat(64),
  approvalId: "a1",
  backupRef: "b",
  rollbackRef: "r",
};
describe("database and E2E policy", () => {
  it("accepts local development database", () => {
    expect(validateDatabaseRequest(base).databaseName).toBe("development");
  });
  it.each([
    "postgresql://dev@production.example/app",
    "postgresql://dev@staging.example/app",
    "postgresql://dev@db.example.com/app",
    "postgresql://dev@localhost/app?sslmode=require",
  ])("rejects forbidden database endpoint %s", (databaseUrl) => {
    expect(() => validateDatabaseRequest({ ...base, databaseUrl })).toThrow();
  });
  it.each([
    "postgresql://prod@localhost/app",
    "postgresql://staging@localhost/app",
  ])("rejects privileged role %s", (databaseUrl) => {
    expect(() => validateDatabaseRequest({ ...base, databaseUrl })).toThrow(
      "role",
    );
  });
  it("accepts IPv6 loopback and rejects suffix confusion", () => {
    expect(parseDatabaseUrl("postgresql://dev@[::1]/app").hostname).toBe(
      "[::1]",
    );
    expect(() =>
      validateDatabaseRequest({
        ...base,
        databaseUrl: "postgresql://dev@localhost.evil/app",
      }),
    ).toThrow();
  });
  it("rejects empty or malformed URLs", () => {
    expect(() => parseDatabaseUrl("postgresql://")).toThrow();
    expect(() => parseDatabaseUrl("not-a-url")).toThrow();
  });
  it("rejects query, hash, and userinfo policy bypasses", () => {
    expect(() =>
      validateDatabaseRequest({
        ...base,
        databaseUrl:
          "postgresql://dev@localhost/app?options=-c%20sslmode=disable",
      }),
    ).toThrow();
  });
  it.each([
    "postgresql://dev%40evil@localhost/development",
    "postgresql://dev@localhost.evil/development",
    "postgresql://dev@postgresql.evil/development",
  ])("rejects encoded or suffix host confusion %s", (databaseUrl) => {
    expect(() => validateDatabaseRequest({ ...base, databaseUrl })).toThrow();
  });
  it.each([
    {},
    { ...base, extra: true },
    { ...base, databaseName: "production" },
  ])("strictly rejects schema mismatch", (value) => {
    expect(() => validateDatabaseRequest(value)).toThrow();
  });
  it("requires approved backup and rollback metadata for destructive SQL", () => {
    expect(() =>
      validateDatabaseRequest({ ...base, destructiveSql: "DROP TABLE x" }),
    ).toThrow();
    expect(
      validateDatabaseRequest(
        { ...base, destructiveSql: "DROP TABLE x" },
        {
          approvalId: "a1",
          planHash: base.planHash,
          changeUnit: "APPROVED",
          backupRef: "b",
          rollbackRef: "r",
        },
      ),
    ).toBeTruthy();
  });
  it("does not accept caller boolean without metadata", () => {
    expect(() =>
      validateDatabaseRequest(
        { ...base, destructiveSql: "DELETE FROM x" },
        {
          approvalId: "a1",
          planHash: "b".repeat(64),
          changeUnit: "APPROVED",
          backupRef: "b",
          rollbackRef: "r",
        },
      ),
    ).toThrow();
  });
  it("does not require approval for harmless SQL text", () => {
    expect(
      validateDatabaseRequest({ ...base, destructiveSql: "SELECT 1" }),
    ).toBeTruthy();
  });
  it.each([
    ["approvalId", { approvalId: "wrong" }],
    ["planHash", { planHash: "b".repeat(64) }],
    ["backupRef", { backupRef: "wrong" }],
    ["rollbackRef", { rollbackRef: "wrong" }],
  ] as const)("rejects canonical approval %s mismatch", (_name, change) => {
    expect(() =>
      validateDatabaseRequest(
        { ...base, destructiveSql: "DROP TABLE x" },
        {
          approvalId: "a1",
          planHash: base.planHash,
          changeUnit: "APPROVED",
          backupRef: "b",
          rollbackRef: "r",
          ...change,
        },
      ),
    ).toThrow();
  });
  it("exposes only canonical migration commands", () => {
    expect(migrationCommands()).toEqual([
      ["pnpm", "db:generate"],
      ["pnpm", "db:migrate"],
    ]);
  });
  it("exposes only canonical E2E command", () => {
    expect(e2eCommand()).toEqual(["./tools/run-e2e"]);
  });
  it.each([
    "https://production.example",
    "https://staging.example",
    "https://localhost.evil",
  ])("rejects non-local E2E URL %s", (url) => {
    expect(() => validateE2ERequest({ url })).toThrow();
  });
  it("accepts local E2E URL", () => {
    expect(validateE2ERequest({ url: "http://127.0.0.1:3000" }).url).toContain(
      "127.0.0.1",
    );
  });
  it("accepts IPv6 loopback E2E URL and rejects encoded userinfo", () => {
    expect(validateE2ERequest({ url: "http://[::1]:3000" })).toBeTruthy();
    expect(() =>
      validateE2ERequest({ url: "http://user:pass@localhost" }),
    ).toThrow();
  });
  it("rejects E2E proxy and arbitrary fields", () => {
    expect(() =>
      validateE2ERequest({ url: "http://localhost", proxy: "http://proxy" }),
    ).toThrow();
  });
  it("rejects production database case variants", () => {
    expect(() =>
      validateDatabaseRequest({
        ...base,
        databaseUrl: "postgresql://dev@LOCALHOST.evil/app",
      }),
    ).toThrow();
  });
});
