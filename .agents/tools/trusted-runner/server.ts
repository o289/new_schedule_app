import { chmod, lstat, realpath, stat } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import {
  encodeTrustedRunnerFrame,
  parseTrustedRunnerRequest,
  trustedRunnerMaxFrameBytes,
  trustedRunnerProtocolVersion,
  type TrustedRunnerRequest,
  type TrustedRunnerResponse,
} from "./protocol.js";
import {
  defaultExecutorIO,
  executeCapability,
  type ExecutorIO,
  type RunnerContext,
} from "./capabilities.js";

export type TrustedRunnerServerOptions = {
  socketPath: string;
  context?: RunnerContext;
  loadContext?: (request: TrustedRunnerRequest) => Promise<RunnerContext>;
  executor?: ExecutorIO;
  timeoutMs?: number;
  redactError?: (value: string) => string;
};
const fallbackCapability: TrustedRunnerResponse["capability"] = "prepare_run";
const capabilityNames: readonly string[] = [
  "prepare_run",
  "verify_phase",
  "apply_migration_local",
  "run_e2e",
  "checkpoint",
  "promote_ff_only",
  "publish_approved_sha",
  "quarantine_run",
];
type ErrorInput = {
  runId?: string;
  planHash?: string;
  revision?: number;
  capability?: TrustedRunnerResponse["capability"];
  nonce?: string;
};
type ErrorResponse = Extract<TrustedRunnerResponse, { ok: false }>;
function isCapability(
  value: string,
): value is TrustedRunnerRequest["capability"] {
  return capabilityNames.includes(value);
}
function defaultRedact(value: string): string {
  return value.replace(
    /(token|secret|password|authorization)\s*[:=]\s*[^\s]+/gi,
    "$1=[REDACTED]",
  );
}
export class TrustedRunnerServer {
  private readonly server: Server;
  private readonly usedNonces = new Set<string>();
  private readonly activeSockets = new Set<Socket>();
  private readonly timeoutMs: number;
  public constructor(private readonly options: TrustedRunnerServerOptions) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs <= 0 ||
      this.timeoutMs > 120_000
    )
      throw new Error("invalid runner timeout");
    if (!options.context && !options.loadContext)
      throw new Error("trusted context loader is required");
    this.server = createServer({ allowHalfOpen: true }, (socket) => {
      this.activeSockets.add(socket);
      socket.once("close", () => this.activeSockets.delete(socket));
      void this.handle(socket);
    });
  }
  public async listen(): Promise<void> {
    try {
      await lstat(this.options.socketPath);
      throw new Error("refusing existing socket path");
    } catch (error: unknown) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.options.socketPath, () => resolve());
    });
    await chmod(this.options.socketPath, 0o660);
    const mode = (await stat(this.options.socketPath)).mode & 0o777;
    if (mode !== 0o660) {
      await this.close();
      throw new Error("socket mode mismatch");
    }
  }
  public async close(): Promise<void> {
    if (!this.server.listening) return;
    for (const socket of this.activeSockets) socket.destroy();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }
  private envelope(
    input: ErrorInput,
    error: ErrorResponse["error"],
  ): TrustedRunnerResponse {
    const context = this.options.context;
    return {
      ok: false,
      protocolVersion: trustedRunnerProtocolVersion,
      runId:
        typeof input.runId === "string" &&
        /^[a-z0-9][a-z0-9-]{0,127}$/.test(input.runId)
          ? input.runId
          : (context?.runId ?? "invalid-run"),
      planHash:
        typeof input.planHash === "string" &&
        /^[a-f0-9]{64}$/.test(input.planHash)
          ? input.planHash
          : (context?.planHash ?? "0".repeat(64)),
      revision:
        typeof input.revision === "number" &&
        Number.isSafeInteger(input.revision) &&
        input.revision >= 0
          ? input.revision
          : (context?.revision ?? 0),
      capability:
        input.capability && isCapability(input.capability)
          ? input.capability
          : fallbackCapability,
      nonce:
        typeof input.nonce === "string" && /^[a-f0-9]{32}$/.test(input.nonce)
          ? input.nonce
          : "0".repeat(32),
      error,
    };
  }
  private async handle(socket: Socket): Promise<void> {
    let buffer = Buffer.alloc(0);
    let completed = false;
    let activeController: AbortController | undefined;
    const sendError = (
      input: ErrorInput,
      code: ErrorResponse["error"]["code"],
      message: string,
    ): void => {
      if (completed) return;
      const redact = this.options.redactError ?? defaultRedact;
      socket.end(
        encodeTrustedRunnerFrame(
          this.envelope(input, {
            code,
            message: redact(message).slice(0, 256),
          }),
        ),
      );
      completed = true;
    };
    const timer = setTimeout(() => {
      activeController?.abort();
      if (!completed)
        sendError({}, "TIMEOUT", "trusted runner request timed out");
    }, this.timeoutMs);
    try {
      await new Promise<void>((resolve) => {
        const onData = (chunk: Buffer): void => {
          buffer = Buffer.concat([buffer, chunk]);
          if (buffer.byteLength > trustedRunnerMaxFrameBytes) {
            sendError({}, "INVALID_REQUEST", "oversize frame");
            socket.removeListener("data", onData);
            socket.removeListener("end", onEnd);
            resolve();
          }
        };
        const onEnd = (): void => {
          socket.removeListener("data", onData);
          resolve();
        };
        socket.on("data", onData);
        socket.once("end", onEnd);
        socket.once("error", () => {
          sendError({}, "CONNECTION_ERROR", "socket error");
          resolve();
        });
      });
      if (completed) return;
      const newline = buffer.indexOf(10);
      if (
        newline < 0 ||
        buffer.indexOf(10, newline + 1) >= 0 ||
        buffer.length !== newline + 1
      ) {
        sendError({}, "INVALID_REQUEST", "exactly one frame is required");
        return;
      }
      const line = buffer.subarray(0, newline).toString("utf8");
      let candidate: ErrorInput = {};
      try {
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed === "object" && parsed !== null) {
          const record = parsed as Record<string, unknown>;
          candidate = {};
          if (typeof record.runId === "string") candidate.runId = record.runId;
          if (typeof record.planHash === "string")
            candidate.planHash = record.planHash;
          if (typeof record.revision === "number")
            candidate.revision = record.revision;
          if (
            typeof record.capability === "string" &&
            isCapability(record.capability)
          )
            candidate.capability = record.capability;
          if (typeof record.nonce === "string") candidate.nonce = record.nonce;
        }
      } catch {
        sendError({}, "INVALID_REQUEST", "invalid JSON");
        return;
      }
      let request: TrustedRunnerRequest;
      try {
        request = parseTrustedRunnerRequest(line);
      } catch {
        sendError(candidate, "INVALID_REQUEST", "invalid request");
        return;
      }
      if (this.usedNonces.has(request.nonce)) {
        sendError(request, "NONCE_REUSED", "nonce already used");
        return;
      }
      this.usedNonces.add(request.nonce);
      let context: RunnerContext;
      try {
        context = this.options.loadContext
          ? await this.options.loadContext(request)
          : await this.loadStaticContext();
        await this.validateContext(request, context);
      } catch (error: unknown) {
        sendError(
          request,
          "INVALID_REQUEST",
          error instanceof Error ? error.message : "context rejected",
        );
        return;
      }
      try {
        const controller = new AbortController();
        activeController = controller;
        const result = await executeCapability(request, context, {
          ...(this.options.executor ?? defaultExecutorIO),
          abortSignal: controller.signal,
        });
        if (result.failureCode) {
          sendError(
            request,
            result.failureCode,
            result.failureCode === "TIMEOUT"
              ? "capability timed out"
              : "capability process failed",
          );
          return;
        }
        activeController = undefined;
        const response: TrustedRunnerResponse = {
          ok: true,
          protocolVersion: trustedRunnerProtocolVersion,
          runId: request.runId,
          planHash: request.planHash,
          revision: request.revision,
          capability: request.capability,
          nonce: request.nonce,
          result,
        };
        socket.end(encodeTrustedRunnerFrame(response));
        completed = true;
        return;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "runner error";
        sendError(
          request,
          message === "NOT_IMPLEMENTED" ? "INTERNAL_ERROR" : "INVALID_REQUEST",
          message,
        );
        return;
      }
    } finally {
      clearTimeout(timer);
      activeController = undefined;
      if (!completed && !socket.destroyed) socket.destroy();
    }
  }
  private async loadStaticContext(): Promise<RunnerContext> {
    const context = this.options.context;
    if (!context) throw new Error("trusted context loader is required");
    return context;
  }
  private async validateContext(
    request: TrustedRunnerRequest,
    context: RunnerContext,
  ): Promise<void> {
    if (
      request.runId !== context.runId ||
      request.planHash !== context.planHash ||
      request.revision !== context.revision
    )
      throw new Error("runner context mismatch");
    if (!context.authorizedCapabilities.has(request.capability))
      throw new Error("capability is not authorized");
    if ((await realpath(context.worktreePath)) !== context.worktreePath)
      throw new Error("worktree canonical path mismatch");
  }
}
