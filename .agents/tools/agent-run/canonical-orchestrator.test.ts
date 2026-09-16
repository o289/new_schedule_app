import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalOrchestrator } from "./canonical-orchestrator";
import { CanonicalStateStore } from "./state-store";

const planHash = "a".repeat(64);
const evidence = (phaseId: string, verifiedSha = "b".repeat(40)) => ({
  phaseId,
  evidenceHash: "c".repeat(64),
  verifiedSha,
  gatesPassed: true as const,
});

async function createOrchestrator() {
  const directory = await mkdtemp(join(tmpdir(), "canonical-orchestrator-"));
  const store = new CanonicalStateStore(join(directory, "events.jsonl"));
  return {
    orchestrator: new CanonicalOrchestrator(store, "run-001", {
      planHash,
      phases: [{ id: "phase-1" }, { id: "phase-2" }],
    }),
    store,
  };
}

describe("CanonicalOrchestrator", () => {
  it("runs multiple phases in order and completes only after the last phase", async () => {
    const { orchestrator, store } = await createOrchestrator();
    await orchestrator.prepare();
    await orchestrator.approve();
    await orchestrator.ready();
    await orchestrator.startPhase("phase-1");
    await orchestrator.beginVerify();
    await orchestrator.verificationPassed(evidence("phase-1"));
    expect((await orchestrator.snapshot()).state).toBe("RUNNING");
    expect((await orchestrator.snapshot()).phaseId).toBe("phase-2");
    await orchestrator.startPhase("phase-2");
    await orchestrator.beginVerify();
    await orchestrator.verificationPassed(evidence("phase-2"));
    expect((await orchestrator.snapshot()).state).toBe("COMPLETED");
    expect((await orchestrator.snapshot()).publicationState).toBe("PENDING");
    expect(
      (await store.load()).every((event) => event.planHash === planHash),
    ).toBe(true);
    let published = false;
    await orchestrator.publish(
      "b".repeat(40),
      async () => ({
        canonicalContextVerified: true,
        planHashValid: true,
        approvalHashValid: true,
        startHashValid: true,
      }),
      async () => ({ publicationBoundaryRevalidated: true }),
      async () => {
        published = true;
      },
    );
    expect(published).toBe(true);
  });

  it("rejects an out-of-order phase", async () => {
    const { orchestrator } = await createOrchestrator();
    await orchestrator.prepare();
    await orchestrator.approve();
    await orchestrator.ready();
    await expect(orchestrator.startPhase("phase-2")).rejects.toThrow();
  });

  it("retries verification failures and fails after the retry limit", async () => {
    const { orchestrator } = await createOrchestrator();
    await orchestrator.prepare();
    await orchestrator.approve();
    await orchestrator.ready();
    await orchestrator.startPhase("phase-1");
    await orchestrator.beginVerify();
    for (let retry = 0; retry <= 3; retry += 1) {
      await orchestrator.verificationFailed({
        kind: "verification",
        code: "TEST_FAILURE",
      });
      if (retry < 3) {
        expect((await orchestrator.snapshot()).retryCount).toBe(retry + 1);
        await orchestrator.beginVerify();
      }
    }
    expect((await orchestrator.snapshot()).state).toBe("FAILED");
  });

  it("does not publish without a complete eligibility record", async () => {
    const { orchestrator } = await createOrchestrator();
    await expect(
      orchestrator.publish(
        "b".repeat(40),
        async () => ({
          canonicalContextVerified: true,
          planHashValid: true,
          approvalHashValid: true,
          startHashValid: true,
        }),
        async () => ({ publicationBoundaryRevalidated: true }),
        async () => undefined,
      ),
    ).rejects.toThrow();
  });

  it("rejects a caller-supplied eligibility object", async () => {
    const { orchestrator } = await createOrchestrator();
    await expect(
      orchestrator.publish(
        { state: "COMPLETED", allPhasesPassed: true } as never,
        async () => ({
          canonicalContextVerified: true,
          planHashValid: true,
          approvalHashValid: true,
          startHashValid: true,
        }),
        async () => ({ publicationBoundaryRevalidated: true }),
        async () => undefined,
      ),
    ).rejects.toThrow();
  });
});
