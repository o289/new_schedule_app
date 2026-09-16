import { createConnection, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import {
  encodeTrustedRunnerFrame,
  parseTrustedRunnerResponse,
  type TrustedRunnerRequest,
  type TrustedRunnerResponse,
} from "./protocol.js";

export type TrustedRunnerClientOptions = {
  socketPath: string;
  timeoutMs?: number;
};
export const trustedRunnerMaxTimeoutMs = 120_000;

export class TrustedRunnerClient {
  private readonly usedNonces = new Set<string>();
  private readonly timeoutMs: number;

  public constructor(private readonly options: TrustedRunnerClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs <= 0 ||
      this.timeoutMs > trustedRunnerMaxTimeoutMs
    ) {
      throw new Error(
        "trusted runner timeout must be a finite positive integer within the limit",
      );
    }
  }

  public request(
    request: TrustedRunnerRequest,
  ): Promise<TrustedRunnerResponse> {
    if (this.usedNonces.has(request.nonce)) {
      return Promise.reject(new Error("nonce has already been used"));
    }
    this.usedNonces.add(request.nonce);

    return new Promise((resolve, reject) => {
      let settled = false;
      let buffer = Buffer.alloc(0);
      let socket: Socket | undefined;
      let timer: NodeJS.Timeout | undefined;
      const finish = (
        error?: Error,
        response?: TrustedRunnerResponse,
      ): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        socket?.destroy();
        if (error) reject(error);
        else if (response) resolve(response);
        else reject(new Error("trusted runner closed without response"));
      };
      timer = setTimeout(
        () => finish(new Error("trusted runner request timed out")),
        this.timeoutMs,
      );
      try {
        socket = createConnection(this.options.socketPath);
        socket.setNoDelay(true);
        socket.on("connect", () => {
          try {
            socket?.end(encodeTrustedRunnerFrame(request));
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new Error("failed to encode request"),
            );
          }
        });
        socket.on("data", (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);
          if (buffer.byteLength > 64 * 1024) {
            finish(new Error("trusted runner response exceeds maximum size"));
            return;
          }
          const newline = buffer.indexOf(10);
          if (newline < 0) return;
          const line = buffer.subarray(0, newline).toString("utf8");
          const remainder = buffer.subarray(newline + 1).toString("utf8");
          if (remainder.trim() !== "") {
            finish(
              new Error("trusted runner returned multiple response frames"),
            );
            return;
          }
          try {
            const response = parseTrustedRunnerResponse(line);
            if (
              response.nonce !== request.nonce ||
              response.runId !== request.runId ||
              response.planHash !== request.planHash ||
              response.revision !== request.revision ||
              response.capability !== request.capability
            ) {
              finish(new Error("trusted runner response context mismatch"));
              return;
            }
            finish(undefined, response);
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new Error("invalid trusted runner response"),
            );
          }
        });
        socket.on("error", (error) =>
          finish(
            new Error(`trusted runner connection error: ${error.message}`),
          ),
        );
        socket.on("close", () =>
          finish(new Error("trusted runner closed without response")),
        );
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("trusted runner connection error"),
        );
      }
    });
  }

  public static createNonce(): string {
    return randomBytes(16).toString("hex");
  }
}
