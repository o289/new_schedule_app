import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { TrustedRunnerRequest } from "./protocol.js";

const maxOutputBytes = 64 * 1024;
type Capability = TrustedRunnerRequest["capability"];
export type RunnerContext = {
  runId: string;
  planHash: string;
  revision: number;
  worktreePath: string;
  authorizedCapabilities: ReadonlySet<Capability>;
};
export type CapabilityResult = {
  exitCode: number;
  durationMs: number;
  truncated: boolean;
  stdoutHash: string;
  stderrHash: string;
  failureCode?: "TIMEOUT" | "CONNECTION_ERROR";
};
export type ExecutorIO = {
  run: (
    step: CommandStep,
    cwd: string,
    signal: AbortSignal,
  ) => Promise<ExecutionResult>;
  redact?: (value: string) => string;
  now?: () => number;
  abortSignal?: AbortSignal;
  handlers?: Partial<
    Record<"prepare_run" | "checkpoint" | "quarantine_run", () => Promise<void>>
  >;
};
export type CommandStep = {
  program: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxOutputBytes: number;
};
export type ExecutionResult = {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};
function isNoOpCapability(
  capability: Capability,
): capability is "prepare_run" | "checkpoint" | "quarantine_run" {
  return (
    capability === "prepare_run" ||
    capability === "checkpoint" ||
    capability === "quarantine_run"
  );
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function defaultRedact(value: string): string {
  return value.replace(
    /(token|secret|password|authorization)\s*[:=]\s*[^\s]+/gi,
    "$1=[REDACTED]",
  );
}
function bounded(
  value: string,
  limit: number,
): { value: string; truncated: boolean } {
  const bytes = Buffer.from(value, "utf8");
  return bytes.byteLength <= limit
    ? { value, truncated: false }
    : { value: bytes.subarray(0, limit).toString("utf8"), truncated: true };
}
function decodeUtf8Safe(bytes: Buffer): string {
  for (let length = bytes.byteLength; length >= 0; length -= 1) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, length),
      );
    } catch {
      /* incomplete trailing code point */
    }
  }
  return "";
}
export function capabilitySteps(
  capability: Capability,
): readonly CommandStep[] | undefined {
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: "/tmp",
    CI: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_ASKPASS: "/bin/false",
    SSH_ASKPASS: "/bin/false",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "*",
  };
  const step = (program: string, args: readonly string[]): CommandStep => ({
    program,
    args,
    env,
    timeoutMs: 120_000,
    maxOutputBytes,
  });
  switch (capability) {
    case "verify_phase":
      return [
        step("docker", [
          "compose",
          "-f",
          "compose.dev.yml",
          "exec",
          "-T",
          "application",
          "pnpm",
          "format:check",
        ]),
        step("docker", [
          "compose",
          "-f",
          "compose.dev.yml",
          "exec",
          "-T",
          "application",
          "pnpm",
          "verify:phase",
        ]),
      ];
    case "apply_migration_local":
      return [step("pnpm", ["db:generate"]), step("pnpm", ["db:migrate"])];
    case "run_e2e":
      return [step("./tools/run-e2e", [])];
    case "prepare_run":
    case "checkpoint":
    case "quarantine_run":
      return [];
    case "promote_ff_only":
    case "publish_approved_sha":
      return undefined;
  }
}
export const defaultExecutorIO: ExecutorIO = { run: defaultRun };
function defaultRun(
  step: CommandStep,
  cwd: string,
  signal: AbortSignal,
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(step.program, [...step.args], {
      cwd,
      env: { ...step.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBytes = Buffer.alloc(0);
    let stderrBytes = Buffer.alloc(0);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, step.timeoutMs);
    const abort = () => {
      child.kill("SIGTERM");
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBytes = Buffer.concat([
        stdoutBytes,
        Buffer.from(chunk, "utf8"),
      ]).subarray(0, step.maxOutputBytes);
    });
    child.stderr.on("data", (chunk: string) => {
      stderrBytes = Buffer.concat([
        stderrBytes,
        Buffer.from(chunk, "utf8"),
      ]).subarray(0, step.maxOutputBytes);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        signal: null,
        timedOut,
        stdout: decodeUtf8Safe(stdoutBytes),
        stderr: decodeUtf8Safe(stderrBytes),
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        timedOut,
        stdout: decodeUtf8Safe(stdoutBytes),
        stderr: decodeUtf8Safe(stderrBytes),
      });
    });
  });
}
export async function executeCapability(
  request: TrustedRunnerRequest,
  context: RunnerContext,
  io: ExecutorIO = defaultExecutorIO,
): Promise<CapabilityResult> {
  if (
    request.runId !== context.runId ||
    request.planHash !== context.planHash ||
    request.revision !== context.revision
  )
    throw new Error("runner context mismatch");
  if (!context.authorizedCapabilities.has(request.capability))
    throw new Error("capability is not authorized");
  if (
    request.capability === "promote_ff_only" ||
    request.capability === "publish_approved_sha"
  )
    throw new Error("NOT_IMPLEMENTED");
  const steps = capabilitySteps(request.capability);
  if (steps === undefined) throw new Error("NOT_IMPLEMENTED");
  if (steps.length === 0) {
    if (!isNoOpCapability(request.capability))
      throw new Error("internal handler is not configured");
    const handler = io.handlers?.[request.capability];
    if (!handler) throw new Error("internal handler is not configured");
    await handler();
  }
  const started = io.now?.() ?? Date.now();
  let stdout = "";
  let stderr = "";
  let truncated = false;
  let failureCode: CapabilityResult["failureCode"];
  const controller = new AbortController();
  if (io.abortSignal) {
    if (io.abortSignal.aborted) controller.abort();
    else
      io.abortSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }
  for (const step of steps) {
    const execution = await io.run(
      step,
      context.worktreePath,
      controller.signal,
    );
    if (controller.signal.aborted) {
      failureCode = "TIMEOUT";
      break;
    }
    const redact = io.redact ?? defaultRedact;
    const out = bounded(redact(execution.stdout), step.maxOutputBytes);
    const err = bounded(redact(execution.stderr), step.maxOutputBytes);
    stdout += out.value;
    stderr += err.value;
    truncated ||= out.truncated || err.truncated;
    if (execution.timedOut) {
      failureCode = "TIMEOUT";
      break;
    }
    if (execution.exitCode === null || execution.signal !== null) {
      failureCode = "CONNECTION_ERROR";
      break;
    }
    if (execution.exitCode !== 0)
      return {
        exitCode: execution.exitCode,
        durationMs: (io.now?.() ?? Date.now()) - started,
        truncated,
        stdoutHash: hash(stdout),
        stderrHash: hash(stderr),
      };
  }
  return {
    exitCode: failureCode ? -1 : 0,
    durationMs: (io.now?.() ?? Date.now()) - started,
    truncated,
    stdoutHash: hash(stdout),
    stderrHash: hash(stderr),
    ...(failureCode ? { failureCode } : {}),
  };
}
