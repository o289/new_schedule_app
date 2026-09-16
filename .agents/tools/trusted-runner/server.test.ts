import { mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodeTrustedRunnerFrame,
  parseTrustedRunnerResponse as parseResponseFrame,
  type TrustedRunnerRequest,
} from "./protocol.js";
import { TrustedRunnerServer } from "./server.js";

const context = {
  runId: "run-1",
  planHash: "a".repeat(64),
  revision: 1,
  worktreePath: realpathSync(tmpdir()),
  authorizedCapabilities: new Set<TrustedRunnerRequest["capability"]>([
    "prepare_run",
  ]),
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
async function roundTrip(path: string, payload: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    let output = "";
    socket.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    socket.on("end", () => resolve(output));
    socket.on("error", reject);
    socket.on("connect", () => socket.end(payload));
  });
}
function parseTrustedRunnerResponse(output: string) {
  return parseResponseFrame(output.trimEnd());
}
async function splitRoundTrip(
  path: string,
  first: Buffer,
  second: Buffer,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    let output = "";
    socket.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    socket.on("end", () => resolve(output));
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.write(first);
      setTimeout(() => socket.end(second), 1);
    });
  });
}
async function temporaryServer(
  options: Omit<
    ConstructorParameters<typeof TrustedRunnerServer>[0],
    "socketPath"
  >,
): Promise<{
  server: TrustedRunnerServer;
  directory: string;
  socketPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "trusted-runner-"));
  const socketPath = join(directory, "runner.sock");
  const server = new TrustedRunnerServer({ ...options, socketPath });
  await server.listen();
  return { server, directory, socketPath };
}

describe("TrustedRunnerServer", () => {
  it("serves one authenticated request over a mode 0660 unix socket", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trusted-runner-"));
    const socketPath = join(directory, "runner.sock");
    const server = new TrustedRunnerServer({
      socketPath,
      context,
      executor: {
        run: async () => ({
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr: "",
        }),
        handlers: { prepare_run: async () => {} },
      },
    });
    try {
      await server.listen();
      expect((await stat(socketPath)).mode & 0o777).toBe(0o660);
      const response = parseTrustedRunnerResponse(
        await roundTrip(socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(response.ok).toBe(true);
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("loads and revalidates context for each request and reserves nonce after failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trusted-runner-"));
    const socketPath = join(directory, "runner.sock");
    let loads = 0;
    const server = new TrustedRunnerServer({
      socketPath,
      loadContext: async (incoming) => {
        loads += 1;
        if (incoming.revision !== 1) throw new Error("revision mismatch");
        return context;
      },
      executor: {
        run: async () => ({
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr: "",
        }),
        handlers: { prepare_run: async () => {} },
      },
    });
    try {
      await server.listen();
      const first = parseTrustedRunnerResponse(
        await roundTrip(socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(first.ok).toBe(true);
      const second = parseTrustedRunnerResponse(
        await roundTrip(socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("NONCE_REUSED");
      expect(loads).toBe(1);
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects an existing regular file or symlink socket path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trusted-runner-"));
    const socketPath = join(directory, "runner.sock");
    const server = new TrustedRunnerServer({ socketPath, context });
    await writeFile(socketPath, "occupied");
    try {
      await expect(server.listen()).rejects.toThrow("existing");
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects an existing symlink socket path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trusted-runner-"));
    const socketPath = join(directory, "runner.sock");
    await symlink(join(directory, "missing-target"), socketPath);
    const server = new TrustedRunnerServer({ socketPath, context });
    try {
      await expect(server.listen()).rejects.toThrow("existing");
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("requires an injected trusted context and rejects invalid timeout", () => {
    expect(
      () =>
        new TrustedRunnerServer({
          socketPath: "/tmp/trusted-runner-test.sock",
          timeoutMs: 0,
        }),
    ).toThrow("timeout");
  });
  it.each([
    ["invalid JSON", Buffer.from("{bad}\n"), "INVALID_REQUEST"],
    [
      "oversize",
      Buffer.concat([Buffer.alloc(65536, 120), Buffer.from("\n")]),
      "INVALID_REQUEST",
    ],
    [
      "same chunk multiple",
      Buffer.concat([
        encodeTrustedRunnerFrame(request),
        encodeTrustedRunnerFrame({ ...request, nonce: "c".repeat(32) }),
      ]),
      "INVALID_REQUEST",
    ],
  ] as const)(
    "returns a structured error for %s",
    async (_name, payload, code) => {
      const fixture = await temporaryServer({
        context,
        executor: {
          run: async () => ({
            exitCode: 0,
            signal: null,
            timedOut: false,
            stdout: "",
            stderr: "",
          }),
          handlers: { prepare_run: async () => {} },
        },
      });
      try {
        const response = parseTrustedRunnerResponse(
          await roundTrip(fixture.socketPath, payload),
        );
        expect(response.ok).toBe(false);
        if (!response.ok) expect(response.error.code).toBe(code);
      } finally {
        await fixture.server.close();
        await rm(fixture.directory, { recursive: true, force: true });
      }
    },
  );
  it("rejects split multiple frames before dispatch and does not reserve nonce", async () => {
    const fixture = await temporaryServer({
      context,
      executor: {
        run: async () => ({
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr: "",
        }),
        handlers: { prepare_run: async () => {} },
      },
    });
    try {
      const multiple = parseTrustedRunnerResponse(
        await splitRoundTrip(
          fixture.socketPath,
          encodeTrustedRunnerFrame(request),
          encodeTrustedRunnerFrame({ ...request, nonce: "c".repeat(32) }),
        ),
      );
      expect(multiple.ok).toBe(false);
      const retry = parseTrustedRunnerResponse(
        await roundTrip(fixture.socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(retry.ok).toBe(true);
    } finally {
      await fixture.server.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
  it("reserves a valid nonce after loadContext failure", async () => {
    const fixture = await temporaryServer({
      context,
      loadContext: async () => {
        throw new Error("context unavailable");
      },
    });
    try {
      const first = parseTrustedRunnerResponse(
        await roundTrip(fixture.socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(first.ok).toBe(false);
      const second = parseTrustedRunnerResponse(
        await roundTrip(fixture.socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("NONCE_REUSED");
    } finally {
      await fixture.server.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
  it.each([
    ["runId", { runId: "wrong" }],
    ["planHash", { planHash: "b".repeat(64) }],
    ["revision", { revision: 2 }],
  ] as const)("rejects loadContext %s mismatch", async (_name, change) => {
    const fixture = await temporaryServer({
      context,
      loadContext: async () => ({ ...context, ...change }),
    });
    try {
      const response = parseTrustedRunnerResponse(
        await roundTrip(fixture.socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(response.ok).toBe(false);
    } finally {
      await fixture.server.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
  it("rejects unauthorized context and explicit NOT_IMPLEMENTED capabilities", async () => {
    const fixture = await temporaryServer({
      context,
      loadContext: async () => ({
        ...context,
        authorizedCapabilities: new Set(),
      }),
    });
    try {
      const unauthorized = parseTrustedRunnerResponse(
        await roundTrip(fixture.socketPath, encodeTrustedRunnerFrame(request)),
      );
      expect(unauthorized.ok).toBe(false);
    } finally {
      await fixture.server.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
    const promote = await temporaryServer({
      context: {
        ...context,
        authorizedCapabilities: new Set(["promote_ff_only"]),
      },
      executor: {
        run: async () => {
          throw new Error("not run");
        },
      },
    });
    try {
      const response = parseTrustedRunnerResponse(
        await roundTrip(
          promote.socketPath,
          encodeTrustedRunnerFrame({
            ...request,
            capability: "promote_ff_only",
            args: publicationArgs,
            nonce: "d".repeat(32),
          }),
        ),
      );
      expect(response.ok).toBe(false);
      if (!response.ok) expect(response.error.code).toBe("INTERNAL_ERROR");
    } finally {
      await promote.server.close();
      await rm(promote.directory, { recursive: true, force: true });
    }
  });
  it("returns timeout for a slow executor and closes active sockets", async () => {
    const timeoutRequest: TrustedRunnerRequest = {
      ...request,
      capability: "verify_phase",
      args: { phaseId: "phase-1" },
      nonce: "e".repeat(32),
    };
    let aborted = false;
    let calls = 0;
    const fixture = await temporaryServer({
      timeoutMs: 10,
      context: {
        ...context,
        authorizedCapabilities: new Set(["verify_phase"]),
      },
      executor: {
        run: async (_step, _cwd, signal) =>
          new Promise((resolve) => {
            calls += 1;
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
              },
              { once: true },
            );
            setTimeout(
              () =>
                resolve({
                  exitCode: 0,
                  signal: null,
                  timedOut: false,
                  stdout: "",
                  stderr: "",
                }),
              100,
            );
          }),
      },
    });
    const response = parseTrustedRunnerResponse(
      await roundTrip(
        fixture.socketPath,
        encodeTrustedRunnerFrame(timeoutRequest),
      ),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("TIMEOUT");
    expect(aborted).toBe(true);
    expect(calls).toBe(1);
    await fixture.server.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });
  it("uses exactly one response per connection", async () => {
    const fixture = await temporaryServer({
      context,
      executor: {
        run: async () => ({
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr: "",
        }),
        handlers: { prepare_run: async () => {} },
      },
    });
    try {
      const response = await roundTrip(
        fixture.socketPath,
        encodeTrustedRunnerFrame(request),
      );
      expect(response.trim().split("\n")).toHaveLength(1);
    } finally {
      await fixture.server.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});
