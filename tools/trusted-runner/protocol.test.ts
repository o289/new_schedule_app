import { describe, expect, it } from "vitest";
import {
  encodeTrustedRunnerFrame,
  parseTrustedRunnerRequest,
  parseTrustedRunnerResponse,
  trustedRunnerMaxFrameBytes,
  trustedRunnerCapabilities,
} from "./protocol.js";

const request = {
  protocolVersion: "1" as const,
  runId: "run-1",
  planHash: "a".repeat(64),
  revision: 2,
  capability: "prepare_run" as const,
  args: { phaseId: "phase-1" },
  nonce: "b".repeat(32),
};

describe("trusted runner protocol", () => {
  it("encodes and parses one newline-delimited request", () => {
    const frame = encodeTrustedRunnerFrame(request);
    expect(frame.toString("utf8").split("\n")).toHaveLength(2);
    expect(parseTrustedRunnerRequest(frame.toString("utf8").trim())).toEqual(
      request,
    );
  });

  it("rejects unknown capability, extra fields, and arbitrary command/env/path", () => {
    expect(() =>
      parseTrustedRunnerRequest(
        JSON.stringify({ ...request, capability: "shell" }),
      ),
    ).toThrow();
    expect(() =>
      parseTrustedRunnerRequest(JSON.stringify({ ...request, extra: true })),
    ).toThrow();
    expect(() =>
      parseTrustedRunnerRequest(JSON.stringify({ ...request, command: "ls" })),
    ).toThrow();
    expect(() =>
      parseTrustedRunnerRequest(JSON.stringify({ ...request, env: {} })),
    ).toThrow();
    expect(() =>
      parseTrustedRunnerRequest(JSON.stringify({ ...request, path: "/tmp" })),
    ).toThrow();
  });

  it("rejects an oversize frame and invalid response", () => {
    expect(() =>
      parseTrustedRunnerRequest(
        "{" + "x".repeat(trustedRunnerMaxFrameBytes) + "}",
      ),
    ).toThrow();
    expect(() =>
      parseTrustedRunnerResponse(JSON.stringify({ ok: true })),
    ).toThrow();
  });

  it("accepts every fixed capability only with typed arguments", () => {
    const cases = [
      ["prepare_run", { phaseId: "phase-1" }],
      ["verify_phase", { phaseId: "phase-1" }],
      [
        "apply_migration_local",
        {
          migrationName: "m1",
          databaseName: "development",
          approvalId: "a1",
          backupRef: "b1",
          rollbackRef: "r1",
        },
      ],
      ["run_e2e", { phaseId: "phase-1" }],
      ["checkpoint", { phaseId: "phase-1" }],
      ["promote_ff_only", { targetSha: "a".repeat(40) }],
      ["publish_approved_sha", { targetSha: "a".repeat(40) }],
      ["quarantine_run", { reasonCode: "SAFETY_VIOLATION" }],
    ] as const;
    for (const [capability, args] of cases) {
      expect(
        parseTrustedRunnerRequest(
          JSON.stringify({ ...request, capability, args }),
        ).capability,
      ).toBe(capability);
      expect(() =>
        parseTrustedRunnerRequest(
          JSON.stringify({
            ...request,
            capability,
            args: { ...args, command: "sh" },
          }),
        ),
      ).toThrow();
    }
  });

  it.each(trustedRunnerCapabilities)(
    "accepts valid %s arguments",
    (capability) => {
      const args = {
        prepare_run: { phaseId: "phase-1" },
        verify_phase: { phaseId: "phase-1" },
        apply_migration_local: {
          migrationName: "m",
          databaseName: "development",
          approvalId: "a",
          backupRef: "b",
          rollbackRef: "r",
        },
        run_e2e: { phaseId: "phase-1" },
        checkpoint: { phaseId: "phase-1" },
        promote_ff_only: { targetSha: "a".repeat(40) },
        publish_approved_sha: { targetSha: "a".repeat(40) },
        quarantine_run: { reasonCode: "SAFETY_VIOLATION" },
      }[capability];
      expect(
        parseTrustedRunnerRequest(
          JSON.stringify({ ...request, capability, args }),
        ).capability,
      ).toBe(capability);
    },
  );

  it.each(trustedRunnerCapabilities)(
    "rejects missing or extra args for %s",
    (capability) => {
      expect(() =>
        parseTrustedRunnerRequest(
          JSON.stringify({ ...request, capability, args: {} }),
        ),
      ).toThrow();
      expect(() =>
        parseTrustedRunnerRequest(
          JSON.stringify({ ...request, capability, args: { command: "sh" } }),
        ),
      ).toThrow();
    },
  );

  it("rejects invalid JSON, embedded newline, and multiple frames", () => {
    expect(() => parseTrustedRunnerRequest("not-json")).toThrow();
    expect(() =>
      parseTrustedRunnerRequest(
        `${JSON.stringify(request)}\n${JSON.stringify(request)}`,
      ),
    ).toThrow();
    expect(() => parseTrustedRunnerRequest(`{"x":"line\nfeed"}`)).toThrow();
  });

  it("accepts exact byte limit and rejects limit plus one", () => {
    const padding = "x".repeat(
      trustedRunnerMaxFrameBytes - Buffer.byteLength(JSON.stringify(request)),
    );
    const exact = JSON.stringify({
      ...request,
      args: { phaseId: "phase-1" },
      padding,
    }).slice(0, trustedRunnerMaxFrameBytes);
    expect(Buffer.byteLength(exact)).toBe(trustedRunnerMaxFrameBytes);
    expect(() => parseTrustedRunnerRequest(exact)).toThrow();
    expect(() => parseTrustedRunnerRequest(`${exact}x`)).toThrow();
  });

  it("enforces strict response success/error and error bounds", () => {
    const base = {
      protocolVersion: "1" as const,
      runId: "run-1",
      planHash: "a".repeat(64),
      revision: 2,
      capability: "prepare_run" as const,
      nonce: "b".repeat(32),
    };
    expect(
      parseTrustedRunnerResponse(
        JSON.stringify({
          ...base,
          ok: false,
          error: { code: "TIMEOUT", message: "timeout" },
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(() =>
      parseTrustedRunnerResponse(
        JSON.stringify({
          ...base,
          ok: false,
          error: { code: "TIMEOUT", message: "" },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseTrustedRunnerResponse(
        JSON.stringify({
          ...base,
          ok: false,
          error: { code: "TIMEOUT", message: "x".repeat(257) },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseTrustedRunnerResponse(
        JSON.stringify({
          ...base,
          ok: false,
          error: { code: "TIMEOUT", message: "x" },
          extra: true,
        }),
      ),
    ).toThrow();
  });
});
