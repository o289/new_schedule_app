import { unlink } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TrustedRunnerClient } from "./client.js";
import {
  encodeTrustedRunnerFrame,
  type TrustedRunnerRequest,
  type TrustedRunnerResponse,
} from "./protocol.js";

const socketPath = join(
  tmpdir(),
  `trusted-runner-${process.pid}-${Date.now()}.sock`,
);
const request = (nonce = "b".repeat(32)): TrustedRunnerRequest => ({
  protocolVersion: "1",
  runId: "run-1",
  planHash: "a".repeat(64),
  revision: 2,
  capability: "prepare_run",
  args: { phaseId: "phase-1" },
  nonce,
});
const response = (nonce: string): TrustedRunnerResponse => ({
  ok: true,
  protocolVersion: "1",
  runId: "run-1",
  planHash: "a".repeat(64),
  revision: 2,
  capability: "prepare_run",
  nonce,
  result: {
    exitCode: 0,
    durationMs: 1,
    truncated: false,
    stdoutHash: "c".repeat(64),
    stderrHash: "d".repeat(64),
  },
});

let servers: Server[] = [];
const activeSockets = new Set<import("node:net").Socket>();
const socketPaths = new Set<string>();
afterEach(async () => {
  const socketClosures = [...activeSockets].map((socket) =>
    socket.destroyed
      ? Promise.resolve()
      : once(socket, "close").catch(() => undefined),
  );
  for (const socket of activeSockets) socket.destroy();
  activeSockets.clear();
  await Promise.allSettled(socketClosures);
  await Promise.all(
    servers.map(async (server) => {
      if (!server.listening) return;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
  await Promise.all(
    [socketPath, ...socketPaths].map(async (path) => {
      await unlink(path).catch(() => undefined);
    }),
  );
  servers = [];
});

async function listen(
  handler: (line: string, socket: import("node:net").Socket) => void,
): Promise<boolean> {
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      const newline = data.indexOf("\n");
      if (newline >= 0) handler(data.slice(0, newline), socket);
    });
  });
  registerServer(server, socketPath);
  server.on("connection", (socket) => {
    activeSockets.add(socket);
    socket.on("close", () => activeSockets.delete(socket));
  });
  server.listen(socketPath);
  try {
    await once(server, "listening");
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      return false;
    }
    throw error;
  }
}

function registerServer(server: Server, path: string): void {
  servers.push(server);
  socketPaths.add(path);
  server.on("connection", (socket) => {
    activeSockets.add(socket);
    socket.on("close", () => activeSockets.delete(socket));
  });
}

const unixSocketAvailable = await (async (): Promise<boolean> => {
  const probePath = `${socketPath}-probe`;
  const server = createServer();
  try {
    server.listen(probePath);
    await once(server, "listening");
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM")
      return false;
    throw error;
  } finally {
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(probePath).catch(() => undefined);
  }
})();

describe.skipIf(!unixSocketAvailable)("TrustedRunnerClient", () => {
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["over limit", 120_001],
  ] as const)("rejects %s timeout option", (_name, timeoutMs) => {
    expect(() => new TrustedRunnerClient({ socketPath, timeoutMs })).toThrow(
      "timeout",
    );
  });

  it("sends exactly one request per connection and parses newline response", async () => {
    let connections = 0;
    await listen((line, socket) => {
      connections += 1;
      const incoming = JSON.parse(line) as { nonce: string };
      socket.end(encodeTrustedRunnerFrame(response(incoming.nonce)));
    });
    const result = await new TrustedRunnerClient({ socketPath }).request(
      request(),
    );
    expect(result.ok).toBe(true);
    expect(connections).toBe(1);
  });

  it("rejects nonce reuse and response context mismatch", async () => {
    await listen((line, socket) => {
      const incoming = JSON.parse(line) as { nonce: string };
      socket.end(
        encodeTrustedRunnerFrame({
          ...response(incoming.nonce),
          revision: 99,
        }),
      );
    });
    const client = new TrustedRunnerClient({ socketPath, timeoutMs: 100 });
    await expect(client.request(request())).rejects.toThrow("context mismatch");
    await expect(client.request(request())).rejects.toThrow(
      "already been used",
    );
  });

  it("rejects nonce reuse after a successful request", async () => {
    const currentPath = `${socketPath}-success-reuse`;
    const server = createServer((socket) => {
      let body = "";
      socket.on("data", (chunk) => {
        body += chunk.toString();
        if (body.includes("\n")) {
          const incoming = JSON.parse(body) as { nonce: string };
          socket.end(encodeTrustedRunnerFrame(response(incoming.nonce)));
        }
      });
    });
    registerServer(server, currentPath);
    server.listen(currentPath);
    await once(server, "listening");
    const client = new TrustedRunnerClient({
      socketPath: currentPath,
      timeoutMs: 100,
    });
    const first = request("7".repeat(32));
    await client.request(first);
    await expect(client.request(first)).rejects.toThrow("already been used");
  });

  it("rejects partial response with a timeout", async () => {
    await listen((_line, socket) => {
      socket.write('{"ok":true');
      socket.on("end", () => undefined);
    });
    await expect(
      new TrustedRunnerClient({ socketPath, timeoutMs: 20 }).request(
        request("e".repeat(32)),
      ),
    ).rejects.toThrow("timed out");
  });

  it("rejects multiple response frames", async () => {
    const currentPath = `${socketPath}-multiple`;
    const server = createServer((socket) =>
      socket.end(
        `${JSON.stringify(response("f".repeat(32)))}\n${JSON.stringify(response("f".repeat(32)))}\n`,
      ),
    );
    registerServer(server, currentPath);
    server.listen(currentPath);
    await once(server, "listening");
    await expect(
      new TrustedRunnerClient({
        socketPath: currentPath,
        timeoutMs: 100,
      }).request(request("f".repeat(32))),
    ).rejects.toThrow("multiple");
  });

  it("rejects invalid JSON response", async () => {
    const currentPath = `${socketPath}-invalid`;
    const server = createServer((socket) => socket.end("not-json\n"));
    registerServer(server, currentPath);
    server.listen(currentPath);
    await once(server, "listening");
    await expect(
      new TrustedRunnerClient({
        socketPath: currentPath,
        timeoutMs: 100,
      }).request(request("6".repeat(32))),
    ).rejects.toThrow();
  });

  it("rejects a connection error", async () => {
    await expect(
      new TrustedRunnerClient({
        socketPath: `${socketPath}-missing`,
        timeoutMs: 100,
      }).request(request("1".repeat(32))),
    ).rejects.toThrow("connection error");
  });

  it("rejects close without a response", async () => {
    const currentPath = `${socketPath}-eof`;
    const server = createServer((socket) => socket.end());
    registerServer(server, currentPath);
    server.listen(currentPath);
    await once(server, "listening");
    await expect(
      new TrustedRunnerClient({
        socketPath: currentPath,
        timeoutMs: 100,
      }).request(request("2".repeat(32))),
    ).rejects.toThrow();
  });
});
