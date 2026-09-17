import { describe, expect, it } from "vitest";
import { parseWorkBoard } from "./work-schema";

const workBoard = {
  goal: "AI開発フローを簡素化する",
  currentPhase: "Phase 2",
  nextAction: "品質ゲートを実行する",
  lastVerification: "自己確認のみ",
  blocker: "",
  updatedAt: "2026-09-17T00:00:00+09:00",
};

describe("workSchema", () => {
  it("最小限の引き継ぎメモを受け付ける", () => {
    expect(parseWorkBoard(workBoard)).toEqual(workBoard);
  });

  it("Git metadataや状態管理の項目を受け付けない", () => {
    expect(() =>
      parseWorkBoard({ ...workBoard, branch: "feature/v3.2.3" }),
    ).toThrow();
    expect(() => parseWorkBoard({ ...workBoard, state: "PHASE_2" })).toThrow();
  });
});
