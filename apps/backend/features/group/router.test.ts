import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AlreadyGroupMemberError,
  NotFoundError,
} from "#backend/core/api-error";

const mocks = vi.hoisted(() => ({
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  getGroup: vi.fn(),
  deleteGroup: vi.fn(),
  joinGroup: vi.fn(),
  kickMember: vi.fn(),
  leaveGroup: vi.fn(),
  listCalendar: vi.fn(),
  requireCurrentUser: vi.fn(),
  verifyAccessToken: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("./service", () => ({
  GroupService: class {
    listGroups = mocks.listGroups;
    createGroup = mocks.createGroup;
    getGroup = mocks.getGroup;
    deleteGroup = mocks.deleteGroup;
    joinGroup = mocks.joinGroup;
    kickMember = mocks.kickMember;
    leaveGroup = mocks.leaveGroup;
    listCalendar = mocks.listCalendar;
  },
}));

vi.mock("../auth/service", () => ({ AuthService: class {} }));
vi.mock("../user/repository", () => ({
  UserRepository: class {
    getById = mocks.getById;
  },
}));
vi.mock("../../core/security", () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));
vi.mock("../../core/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

import { app } from "#backend/app";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "group@example.com",
  name: "ユーザー",
  avatar: null,
  refreshToken: null,
};
const groupId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const group = {
  id: groupId,
  name: "グループ",
  currentUserRole: "owner" as const,
  memberCount: 1,
  createdAt: "2026-08-21T00:00:00.000Z",
};

function request(path: string, options: RequestInit = {}) {
  return app.request(path, {
    ...options,
    headers: {
      Authorization: "Bearer access-token",
      "content-type": "application/json",
      ...options.headers,
    },
  });
}

describe("group router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(user);
  });

  it("GET /groups は参加グループ一覧を返す", async () => {
    mocks.listGroups.mockResolvedValue([group]);

    const response = await request("/groups");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([group]);
    expect(mocks.listGroups).toHaveBeenCalledWith(user);
  });

  it("POST /groups は作成結果と一回限りのjoin codeを返す", async () => {
    mocks.createGroup.mockResolvedValue({ group, joinCode: "JOIN-CODE" });

    const response = await request("/groups", {
      method: "POST",
      body: JSON.stringify({ name: "グループ" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      group,
      joinCode: "JOIN-CODE",
    });
    expect(mocks.createGroup).toHaveBeenCalledWith(user, { name: "グループ" });
  });

  it("GET /groups/:groupId はグループと公開memberだけを返す", async () => {
    mocks.getGroup.mockResolvedValue({
      group,
      members: [
        {
          userId: user.id,
          name: user.name,
          avatar: null,
          role: "owner",
          joinedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
    });

    const response = await request(`/groups/${groupId}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("email");
    expect(JSON.stringify(body)).not.toContain("group@example.com");
  });

  it("DELETE /groups/:groupId は204を返す", async () => {
    const response = await request(`/groups/${groupId}`, { method: "DELETE" });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
    expect(mocks.deleteGroup).toHaveBeenCalledWith(user, groupId);
  });

  it("POST /groups/join は空白を除去したjoin codeで参加する", async () => {
    mocks.joinGroup.mockResolvedValue({ ...group, currentUserRole: "member" });

    const response = await request("/groups/join", {
      method: "POST",
      body: JSON.stringify({ joinCode: " join\n code " }),
    });

    expect(response.status).toBe(201);
    expect(mocks.joinGroup).toHaveBeenCalledWith(user, {
      joinCode: "JOINCODE",
    });
  });

  it("DELETE /groups/:groupId/members/:userId は204を返す", async () => {
    const response = await request(`/groups/${groupId}/members/${memberId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect(mocks.kickMember).toHaveBeenCalledWith(user, groupId, memberId);
  });

  it("POST /groups/:groupId/leave は204を返す", async () => {
    const response = await request(`/groups/${groupId}/leave`, {
      method: "POST",
    });

    expect(response.status).toBe(204);
    expect(mocks.leaveGroup).toHaveBeenCalledWith(user, groupId);
  });

  it("GET /groups/:groupId/calendar はcomplete snapshotだけを返す", async () => {
    mocks.listCalendar.mockResolvedValue({
      groupId,
      requestedMemberCount: 1,
      fetchedMemberCount: 1,
      completeness: "complete",
      members: [
        {
          userId: user.id,
          name: user.name,
          avatar: null,
          role: "owner",
          joinedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      events: [],
    });

    const response = await request(
      `/groups/${groupId}/calendar?startDate=2026-08-21T00:00:00&endDate=2026-08-22T00:00:00`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { completeness: string };
    expect(body.completeness).toBe("complete");
    expect(JSON.stringify(body)).not.toContain("email");
    expect(mocks.listCalendar).toHaveBeenCalledWith(user, groupId, {
      startDate: "2026-08-21T00:00:00",
      endDate: "2026-08-22T00:00:00",
    });
  });

  it("ALREADY_GROUP_MEMBER は検証済みgroupIdを含む409を返す", async () => {
    mocks.joinGroup.mockRejectedValue(new AlreadyGroupMemberError(groupId));

    const response = await request("/groups/join", {
      method: "POST",
      body: JSON.stringify({ joinCode: "JOINCODE" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "ALREADY_GROUP_MEMBER",
      data: { groupId },
    });
  });

  it("不正な入力と非参加者を422・404にする", async () => {
    const invalid = await request("/groups/not-a-uuid");
    expect(invalid.status).toBe(422);

    mocks.getGroup.mockRejectedValue(new NotFoundError("NOT_FOUND_GROUP"));
    const missing = await request(`/groups/${groupId}`);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ code: "NOT_FOUND_GROUP" });
  });
});
