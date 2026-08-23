import { describe, expect, it } from "vitest";

import {
  buildInvitationLink,
  isShareCancellation,
  parseInvitationToken,
} from "./invitationLink";

describe("parseInvitationToken", () => {
  it("URL fragmentから正規化済み招待トークンを取得する", () => {
    expect(parseInvitationToken("#abcdefghijklmnopqrstuvwx")).toBe(
      "ABCDEFGHIJKLMNOPQRSTUVWX",
    );
  });

  it("空・不正形式・不正percent encodingを拒否する", () => {
    expect(parseInvitationToken("")).toBeNull();
    expect(parseInvitationToken("#short")).toBeNull();
    expect(parseInvitationToken("#abcdefghijklmnopqrstu!wx")).toBeNull();
    expect(parseInvitationToken("#%E0%A4%A")).toBeNull();
  });

  it("現在のoriginとfragmentから招待リンクを生成する", () => {
    expect(
      buildInvitationLink(
        "https://schedule.example.com/dashboard",
        "ABCDEFGHIJKLMNOPQRSTUVWX",
      ),
    ).toBe("https://schedule.example.com/join#ABCDEFGHIJKLMNOPQRSTUVWX");
  });

  it("Web Shareのキャンセルだけを識別する", () => {
    expect(isShareCancellation(new DOMException("cancel", "AbortError"))).toBe(
      true,
    );
    expect(isShareCancellation(new Error("failed"))).toBe(false);
  });
});
