import { describe, expect, it } from "vitest";
import {
  capabilitySteps,
  executeCapability,
  type RunnerContext,
} from "./capabilities.js";
import type { TrustedRunnerRequest } from "./protocol.js";

const context: RunnerContext = {
  runId: "run-1",
  planHash: "a".repeat(64),
  revision: 1,
  worktreePath: "/tmp",
  authorizedCapabilities: new Set(["prepare_run", "promote_ff_only"]),
};
const request: TrustedRunnerRequest = {
  protocolVersion: "1",
  runId: "run-1",
  planHash: "a".repeat(64),
  revision: 1,
  capability: "prepare_run",
  args: { phaseId: "phase-1" },
  nonce: "b".repeat(32),
};
const publicationArgs = {
  targetSha: "a".repeat(40),
  canonicalContext: {
    startRecordSha256: "b".repeat(64),
    approvalSha256: "c".repeat(64),
    handoffSha256: "d".repeat(64),
    headSha: "a".repeat(40),
  },
};

describe("trusted runner capabilities", () => {
  it("defines fixed ordered commands and a restricted environment", () => {
    const verifySteps = capabilitySteps("verify_phase");
    const migrationSteps = capabilitySteps("apply_migration_local");
    const e2eSteps = capabilitySteps("run_e2e");
    if (!verifySteps || !migrationSteps || !e2eSteps)
      throw new Error("missing capability definition");
    expect(verifySteps.map((step) => [step.program, ...step.args])).toEqual([
      [
        "docker",
        "compose",
        "-f",
        "compose.dev.yml",
        "exec",
        "-T",
        "application",
        "pnpm",
        "format:check",
      ],
      [
        "docker",
        "compose",
        "-f",
        "compose.dev.yml",
        "exec",
        "-T",
        "application",
        "pnpm",
        "verify:phase",
      ],
    ]);
    expect(migrationSteps.map((step) => [step.program, ...step.args])).toEqual([
      ["pnpm", "db:generate"],
      ["pnpm", "db:migrate"],
    ]);
    expect(e2eSteps.map((step) => [step.program, ...step.args])).toEqual([
      ["./tools/run-e2e"],
    ]);
    const firstStep = verifySteps.at(0);
    if (!firstStep) throw new Error("missing first step");
    expect(firstStep.env).toMatchObject({
      GIT_TERMINAL_PROMPT: "0",
      HTTP_PROXY: "",
    });
  });
  it("executes every fixed step in order and hashes redacted bounded output", async () => {
    const calls: string[] = [];
    const result = await executeCapability(
      { ...request, capability: "verify_phase", args: { phaseId: "phase-1" } },
      { ...context, authorizedCapabilities: new Set(["verify_phase"]) },
      {
        run: async (step) => {
          calls.push(`${step.program} ${step.args.join(" ")}`);
          return {
            exitCode: 0,
            signal: null,
            timedOut: false,
            stdout: "secret",
            stderr: "error",
          };
        },
        redact: (value) => value.replace("secret", "[redacted]"),
        now: () => 1000,
      },
    );
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ exitCode: 0, truncated: false });
    expect(result.stdoutHash).not.toBe("".padStart(64, "0"));
  });
  it("executes fixed no-op capability without caller command/env/path", async () => {
    await expect(
      executeCapability(request, context, {
        run: async () => ({
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr: "",
        }),
        handlers: { prepare_run: async () => {} },
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      truncated: false,
    });
  });
  it("rejects unauthorized capability and context mismatch", async () => {
    await expect(
      executeCapability(
        { ...request, capability: "checkpoint", args: { phaseId: "phase-1" } },
        context,
      ),
    ).rejects.toThrow("authorized");
    await expect(
      executeCapability({ ...request, runId: "other" }, context),
    ).rejects.toThrow("context mismatch");
  });
  it("rejects promotion and publish execution as not implemented", async () => {
    await expect(
      executeCapability(
        {
          ...request,
          capability: "promote_ff_only",
          args: publicationArgs,
        },
        context,
      ),
    ).rejects.toThrow("NOT_IMPLEMENTED");
  });
  it.each([
    ["verify_phase", 2],
    ["apply_migration_local", 2],
    ["run_e2e", 1],
  ] as const)(
    "has the planned fixed step count for %s",
    (capability, count) => {
      expect(capabilitySteps(capability)).toHaveLength(count);
    },
  );
  it("never includes caller environment and fixes cwd on every step", () => {
    const steps = capabilitySteps("verify_phase");
    if (!steps) throw new Error("missing steps");
    for (const step of steps) {
      expect(step.env).toEqual(
        expect.objectContaining({
          PATH: "/usr/bin:/bin",
          HOME: "/tmp",
          GIT_TERMINAL_PROMPT: "0",
        }),
      );
      expect(Object.keys(step.env)).not.toContain("NODE_OPTIONS");
      expect(step.program).not.toBe("sh");
    }
  });
  it("calls the injected no-op handler exactly once", async () => {
    let calls = 0;
    await executeCapability(request, context, {
      run: async () => {
        throw new Error("runner should not run");
      },
      handlers: {
        prepare_run: async () => {
          calls += 1;
        },
      },
    });
    expect(calls).toBe(1);
  });
  it("rejects a missing no-op handler", async () => {
    await expect(executeCapability(request, context)).rejects.toThrow(
      "handler",
    );
  });
  it.each([
    ["runId", { runId: "other" }],
    ["planHash", { planHash: "b".repeat(64) }],
    ["revision", { revision: 2 }],
  ] as const)("rejects request %s mismatch", async (_name, change) => {
    await expect(
      executeCapability({ ...request, ...change }, context),
    ).rejects.toThrow("context mismatch");
  });
  it("rejects unauthorized capabilities before executing a command", async () => {
    await expect(
      executeCapability(
        {
          ...request,
          capability: "verify_phase",
          args: { phaseId: "phase-1" },
        },
        context,
        {
          run: async () => {
            throw new Error("must not run");
          },
        },
      ),
    ).rejects.toThrow("authorized");
  });
  it("stops a fixed sequence after a nonzero exit", async () => {
    const calls: string[] = [];
    const result = await executeCapability(
      { ...request, capability: "verify_phase", args: { phaseId: "phase-1" } },
      { ...context, authorizedCapabilities: new Set(["verify_phase"]) },
      {
        run: async (step) => {
          calls.push(step.args.at(-1) ?? "");
          return {
            exitCode: 7,
            signal: null,
            timedOut: false,
            stdout: "",
            stderr: "",
          };
        },
      },
    );
    expect(calls).toEqual(["format:check"]);
    expect(result.exitCode).toBe(7);
  });
  it("returns structured timeout and signal failures", async () => {
    const timeout = await executeCapability(
      { ...request, capability: "run_e2e", args: { phaseId: "phase-1" } },
      { ...context, authorizedCapabilities: new Set(["run_e2e"]) },
      {
        run: async () => ({
          exitCode: null,
          signal: null,
          timedOut: true,
          stdout: "",
          stderr: "",
        }),
      },
    );
    const signal = await executeCapability(
      { ...request, capability: "run_e2e", args: { phaseId: "phase-1" } },
      { ...context, authorizedCapabilities: new Set(["run_e2e"]) },
      {
        run: async () => ({
          exitCode: null,
          signal: "SIGTERM",
          timedOut: false,
          stdout: "",
          stderr: "",
        }),
      },
    );
    expect(timeout).toMatchObject({ exitCode: -1, failureCode: "TIMEOUT" });
    expect(signal).toMatchObject({
      exitCode: -1,
      failureCode: "CONNECTION_ERROR",
    });
  });
  it("truncates UTF-8 output without replacement and hashes redacted content", async () => {
    const result = await executeCapability(
      { ...request, capability: "run_e2e", args: { phaseId: "phase-1" } },
      { ...context, authorizedCapabilities: new Set(["run_e2e"]) },
      {
        run: async () => ({
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdout: "秘密".repeat(40000),
          stderr: "secret=x",
        }),
        redact: (value) => value.replace("secret=x", "[REDACTED]"),
      },
    );
    expect(result.truncated).toBe(true);
    expect(result.stdoutHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each(["promote_ff_only", "publish_approved_sha"] as const)(
    "keeps %s explicitly not implemented",
    async (capability) => {
      await expect(
        executeCapability(
          { ...request, capability, args: publicationArgs },
          { ...context, authorizedCapabilities: new Set([capability]) },
        ),
      ).rejects.toThrow("NOT_IMPLEMENTED");
    },
  );
});
