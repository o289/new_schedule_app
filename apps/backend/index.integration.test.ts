import { resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { categories as categoryTable } from "./features/category/model";
import {
  groupBannedMembers,
  groupMembers,
  groups,
} from "./features/group/model";
import { scheduleDates, schedules } from "./features/schedule/model";
import { authSessions } from "./features/auth-session/model";
import {
  emailDeliveryLogs,
  emailNotificationPreferences,
  emailNotificationWeekdayRules,
} from "./features/email-notification/model";
import { users } from "./features/user/model";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const webauthnMocks = vi.hoisted(() => ({
  createRegistrationOptions: vi.fn(
    async ({ challenge }: { challenge: Uint8Array }) => ({
      challenge: Buffer.from(challenge).toString("base64url"),
    }),
  ),
  verifyRegistration: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: {
        publicKey: Uint8Array.from([1, 2, 3]),
        counter: 1,
      },
    },
  })),
  createAuthenticationOptions: vi.fn(
    async ({ challenge }: { challenge: Uint8Array }) => ({
      challenge: Buffer.from(challenge).toString("base64url"),
    }),
  ),
  verifyAuthentication: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 2 },
  })),
}));

// 実機の認証器が必要な署名検証だけを置き換え、API・DB・Repositoryは実物を使う。
vi.mock("./core/webauthn", () => webauthnMocks);

function clientDataJSON(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge })).toString("base64url");
}

function readChallengeFromClientData(encodedClientData: string): string {
  const clientData: unknown = JSON.parse(
    Buffer.from(encodedClientData, "base64url").toString("utf8"),
  );

  if (
    typeof clientData !== "object" ||
    clientData === null ||
    !("challenge" in clientData) ||
    typeof clientData.challenge !== "string"
  ) {
    throw new Error("clientDataJSON does not contain a challenge");
  }

  return clientData.challenge;
}

function registrationCredential(challenge: string) {
  return {
    id: "integration-test-credential",
    rawId: "integration-test-credential",
    type: "public-key",
    response: {
      clientDataJSON: clientDataJSON(challenge),
      attestationObject: "test-attestation",
    },
  };
}

function authenticationCredential(challenge: string) {
  return {
    id: "integration-test-credential",
    rawId: "integration-test-credential",
    type: "public-key",
    response: {
      clientDataJSON: clientDataJSON(challenge),
      authenticatorData: "test-authenticator-data",
      signature: "test-signature",
    },
  };
}

async function post(app: { request: Function }, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!testDatabaseUrl)("認証API統合テスト", () => {
  let app: { request: Function };
  let db: {
    execute: Function;
    insert: Function;
    select: Function;
    delete: Function;
    update: Function;
  };
  let closeDatabase: () => Promise<void>;
  let EmailNotificationRepository: typeof import("./features/email-notification/repository").EmailNotificationRepository;
  let GroupRepository: typeof import("./features/group/repository").GroupRepository;
  let GroupCalendarRepository: typeof import("./features/group/calendar-repository").GroupCalendarRepository;
  let runDailyEmailOnce: typeof import("./workers/daily-email").runDailyEmailOnce;
  let FakeEmailProvider: typeof import("./features/email-notification/provider").FakeEmailProvider;

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    const databaseName = new URL(testDatabaseUrl).pathname;
    if (!databaseName.includes("test")) {
      throw new Error(
        "TEST_DATABASE_URL must point to a database whose name includes 'test'",
      );
    }

    // appを読み込む前に接続先を切り替える。開発DBには接続しない。
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.SECRET_KEY = "integration-test-secret-key";

    const database = await import("./database/client");
    db = database.db;
    closeDatabase = database.closeDatabase;
    ({ EmailNotificationRepository } =
      await import("./features/email-notification/repository"));
    await migrate(db as never, {
      migrationsFolder: resolve(import.meta.dirname, "../../drizzle"),
    });

    ({ GroupRepository } = await import("./features/group/repository"));
    ({ GroupCalendarRepository } =
      await import("./features/group/calendar-repository"));
    ({ runDailyEmailOnce } = await import("./workers/daily-email"));
    ({ FakeEmailProvider } =
      await import("./features/email-notification/provider"));
    app = (await import("./app")).app;
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE groups, users CASCADE`);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeDatabase?.();
  });

  it("複数端末のログイン、更新トークンのローテーション、現在端末・全端末ログアウトを保証する", async () => {
    const email = "integration@example.com";

    const registerOptions = await post(app, "/auth/passkey/register/options", {
      email,
      name: "統合テストユーザー",
      avatar: "sky",
    });
    expect(registerOptions.status).toBe(200);
    const registerOptionsBody = await registerOptions.json();
    const registerChallenge = registerOptionsBody.data.publicKey.challenge;
    const registrationRequest = registrationCredential(registerChallenge);

    // ブラウザがverifyへ送る予定の値をデコードし、optionsの値との一致を確認する。
    expect(
      readChallengeFromClientData(registrationRequest.response.clientDataJSON),
    ).toBe(registerChallenge);

    const registerVerify = await post(
      app,
      "/auth/passkey/register/verify",
      registrationRequest,
    );
    expect(registerVerify.status).toBe(200);
    await expect(registerVerify.json()).resolves.toEqual({ data: null });

    const [registeredUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (!registeredUser) {
      throw new Error("登録済みユーザーが見つかりません");
    }

    const defaultCategories = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.userId, registeredUser.id));
    expect(defaultCategories).toHaveLength(2);
    expect(defaultCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "予定1", color: "gray", icon: "tag" }),
        expect.objectContaining({ name: "予定2", color: "blue", icon: "tag" }),
      ]),
    );

    const firstLoginOptions = await post(app, "/auth/passkey/login/options", {
      email,
    });
    expect(firstLoginOptions.status).toBe(200);
    const firstLoginChallenge = (await firstLoginOptions.json()).data.publicKey
      .challenge;

    const secondLoginOptions = await post(app, "/auth/passkey/login/options", {
      email,
    });
    expect(secondLoginOptions.status).toBe(200);
    const secondLoginChallenge = (await secondLoginOptions.json()).data
      .publicKey.challenge;
    expect(secondLoginChallenge).not.toBe(firstLoginChallenge);

    const firstLoginVerify = await post(
      app,
      "/auth/passkey/login/verify",
      authenticationCredential(firstLoginChallenge),
    );
    expect(firstLoginVerify.status).toBe(200);
    const firstTokens = await firstLoginVerify.json();

    const secondLoginVerify = await post(
      app,
      "/auth/passkey/login/verify",
      authenticationCredential(secondLoginChallenge),
    );
    expect(secondLoginVerify.status).toBe(200);
    const secondTokens = await secondLoginVerify.json();
    expect(firstTokens.data.refresh_token).not.toBe(
      secondTokens.data.refresh_token,
    );
    const storedSessions = await db.select().from(authSessions);
    expect(storedSessions).toHaveLength(2);
    expect(
      storedSessions.map(
        (session: { refreshTokenDigest: string }) => session.refreshTokenDigest,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
      ]),
    );
    expect(JSON.stringify(storedSessions)).not.toContain(
      firstTokens.data.refresh_token,
    );
    expect(JSON.stringify(storedSessions)).not.toContain(
      secondTokens.data.refresh_token,
    );

    const firstMe = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${firstTokens.data.access_token}` },
    });
    expect(firstMe.status).toBe(200);
    await expect(firstMe.json()).resolves.toEqual({
      email,
      name: "統合テストユーザー",
      avatar: "sky",
    });
    const secondMe = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${secondTokens.data.access_token}` },
    });
    expect(secondMe.status).toBe(200);

    // 実DBでカテゴリーを作成・取得する。select対象の列とDBスキーマが
    // ずれた場合（例: icon列のマイグレーション未適用）はここで検出する。
    const categoryCreate = await app.request("/categories", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firstTokens.data.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "統合テスト用カテゴリー",
        color: "blue",
        icon: "tag",
      }),
    });
    expect(categoryCreate.status).toBe(201);
    const category = await categoryCreate.json();
    expect(category).toMatchObject({
      name: "統合テスト用カテゴリー",
      color: "blue",
      icon: "tag",
    });

    const categories = await app.request("/categories", {
      headers: { Authorization: `Bearer ${firstTokens.data.access_token}` },
    });
    expect(categories.status).toBe(200);
    await expect(categories.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: category.id })]),
    );

    const refresh = await post(app, "/auth/refresh", {
      refresh_token: secondTokens.data.refresh_token,
    });
    expect(refresh.status).toBe(200);
    const refreshedTokens = await refresh.json();
    const reusedRefresh = await post(app, "/auth/refresh", {
      refresh_token: secondTokens.data.refresh_token,
    });
    expect(reusedRefresh.status).toBe(401);

    const logout = await post(app, "/auth/logout", {
      refresh_token: firstTokens.data.refresh_token,
    });
    expect(logout.status).toBe(204);
    const loggedOutFirstMe = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${firstTokens.data.access_token}` },
    });
    expect(loggedOutFirstMe.status).toBe(401);

    const stillLoggedInSecondMe = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${refreshedTokens.data.access_token}` },
    });
    expect(stillLoggedInSecondMe.status).toBe(200);

    const logoutAll = await app.request("/auth/logout-all", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${refreshedTokens.data.access_token}`,
      },
    });
    expect(logoutAll.status).toBe(204);
    const loggedOutSecondMe = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${refreshedTokens.data.access_token}` },
    });
    expect(loggedOutSecondMe.status).toBe(401);
  });

  it("GroupのDB制約と削除時のcascadeを保証する", async () => {
    const [owner] = await db
      .insert(users)
      .values({
        email: "group-owner@example.com",
        name: "オーナー",
        avatar: "sky",
      })
      .returning();
    const [member] = await db
      .insert(users)
      .values({
        email: "group-member@example.com",
        name: "メンバー",
        avatar: null,
      })
      .returning();
    const [anotherOwner] = await db
      .insert(users)
      .values({
        email: "another-owner@example.com",
        name: "別のオーナー",
        avatar: null,
      })
      .returning();
    const [group] = await db
      .insert(groups)
      .values({ name: "統合テストグループ", joinCodeDigest: "a".repeat(64) })
      .returning();

    await db.insert(groupMembers).values({
      groupId: group.id,
      userId: owner.id,
      role: "owner",
    });
    await db.insert(groupMembers).values({
      groupId: group.id,
      userId: member.id,
      role: "member",
    });

    await expect(
      db.insert(groupMembers).values({
        groupId: group.id,
        userId: member.id,
        role: "member",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(groupMembers).values({
        groupId: group.id,
        userId: anotherOwner.id,
        role: "owner",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(groups).values({
        name: "重複コードグループ",
        joinCodeDigest: "a".repeat(64),
      }),
    ).rejects.toThrow();

    const [category] = await db
      .insert(categoryTable)
      .values({
        userId: owner.id,
        name: "統合テストカテゴリー",
        color: "blue",
        icon: "tag",
      })
      .returning();
    const [schedule] = await db
      .insert(schedules)
      .values({
        userId: owner.id,
        categoryId: category.id,
        title: "個人予定",
      })
      .returning();
    await db.insert(groupBannedMembers).values({
      groupId: group.id,
      userId: member.id,
      bannedByUserId: owner.id,
    });

    await db.delete(groups).where(eq(groups.id, group.id));

    await expect(db.select().from(groupMembers)).resolves.toEqual([]);
    await expect(db.select().from(groupBannedMembers)).resolves.toEqual([]);
    const remainingSchedules = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, schedule.id));
    expect(remainingSchedules).toHaveLength(1);
  });

  it("最後の1枠への並行joinを5人以内に直列化する", async () => {
    const usersForGroup: { id: string }[] = await db
      .insert(users)
      .values(
        [
          "owner",
          "member-1",
          "member-2",
          "member-3",
          "joiner-1",
          "joiner-2",
        ].map((name) => ({
          email: `${name}@example.com`,
          name,
          avatar: null,
        })),
      )
      .returning();
    const [owner, ...otherUsers] = usersForGroup;
    if (!owner) {
      throw new Error("Failed to create group owner");
    }

    const groupRepository = new GroupRepository(db as never);
    const group = await groupRepository.createWithOwner(
      { name: "並行joinテスト" },
      owner.id,
      "b".repeat(64),
    );
    await db.insert(groupMembers).values(
      otherUsers.slice(0, 3).map((user) => ({
        groupId: group.id,
        userId: user.id,
        role: "member" as const,
      })),
    );

    const joiners = otherUsers.slice(3);
    const results = await Promise.all(
      joiners.map((user) =>
        new GroupRepository(db as never).joinIfAllowed(
          group.joinCodeDigest,
          user.id,
        ),
      ),
    );

    expect(results.map((result) => result.kind).sort()).toEqual([
      "full",
      "joined",
    ]);
    await expect(
      db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id)),
    ).resolves.toHaveLength(5);
  });

  it("作成と追放のtransactionが部分状態を残さない", async () => {
    const [owner, member] = await db
      .insert(users)
      .values([
        { email: "owner@example.com", name: "owner", avatar: null },
        { email: "member@example.com", name: "member", avatar: null },
      ])
      .returning();
    if (!owner || !member) {
      throw new Error("Failed to create test users");
    }

    const repository = new GroupRepository(db as never);
    await expect(
      repository.createWithOwner(
        { name: "rollback" },
        "00000000-0000-0000-0000-000000000000",
        "c".repeat(64),
      ),
    ).rejects.toThrow();
    await expect(
      db
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.joinCodeDigest, "c".repeat(64))),
    ).resolves.toEqual([]);

    const group = await repository.createWithOwner(
      { name: "追放テスト" },
      owner.id,
      "d".repeat(64),
    );
    await db.insert(groupMembers).values({
      groupId: group.id,
      userId: member.id,
      role: "member",
    });

    await expect(
      repository.kickAndBan(group.id, owner.id, member.id),
    ).resolves.toBe(true);
    await expect(
      db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(
          sql`${groupMembers.groupId} = ${group.id} AND ${groupMembers.userId} = ${member.id}`,
        ),
    ).resolves.toEqual([]);
    await expect(
      db
        .select({ userId: groupBannedMembers.userId })
        .from(groupBannedMembers)
        .where(
          sql`${groupBannedMembers.groupId} = ${group.id} AND ${groupBannedMembers.userId} = ${member.id}`,
        ),
    ).resolves.toEqual([{ userId: member.id }]);
  });

  it("完全snapshotには予定0件memberを含め、非公開列を取得しない", async () => {
    const [owner, scheduledMember, idleMember] = await db
      .insert(users)
      .values([
        { email: "calendar-owner@example.com", name: "owner", avatar: "sky" },
        {
          email: "calendar-scheduled@example.com",
          name: "scheduled",
          avatar: null,
        },
        { email: "calendar-idle@example.com", name: "idle", avatar: null },
      ])
      .returning();
    if (!owner || !scheduledMember || !idleMember) {
      throw new Error("Failed to create calendar test users");
    }

    const group = await new GroupRepository(db as never).createWithOwner(
      { name: "snapshot" },
      owner.id,
      "e".repeat(64),
    );
    await db.insert(groupMembers).values([
      { groupId: group.id, userId: scheduledMember.id, role: "member" },
      { groupId: group.id, userId: idleMember.id, role: "member" },
    ]);
    const [category] = await db
      .insert(categoryTable)
      .values({
        userId: scheduledMember.id,
        name: "非公開カテゴリー",
        color: "blue",
        icon: "tag",
      })
      .returning();
    if (!category) {
      throw new Error("Failed to create category");
    }
    const [schedule] = await db
      .insert(schedules)
      .values({
        userId: scheduledMember.id,
        categoryId: category.id,
        title: "非公開タイトル",
        note: "非公開メモ",
      })
      .returning();
    if (!schedule) {
      throw new Error("Failed to create schedule");
    }
    await db.insert(scheduleDates).values({
      scheduleId: schedule.id,
      startDate: "2026-08-21T09:00:00",
      endDate: "2026-08-21T10:00:00",
    });

    const snapshot = await new GroupCalendarRepository(
      db as never,
    ).getCompleteCalendarSnapshot(
      group.id,
      "2026-08-21T09:00:00",
      "2026-08-21T10:00:00",
    );

    expect(snapshot.members.map((member) => member.userId).sort()).toEqual(
      [owner.id, scheduledMember.id, idleMember.id].sort(),
    );
    expect(snapshot.events).toEqual([
      {
        dateId: expect.any(String),
        startDate: "2026-08-21 09:00:00",
        endDate: "2026-08-21 10:00:00",
        userId: scheduledMember.id,
        name: "scheduled",
        avatar: null,
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain(
      "calendar-scheduled@example.com",
    );
    expect(JSON.stringify(snapshot)).not.toContain("非公開タイトル");
    expect(JSON.stringify(snapshot)).not.toContain("非公開メモ");
    expect(JSON.stringify(snapshot)).not.toContain("非公開カテゴリー");
    expect(Object.keys(snapshot.events[0] ?? {}).sort()).toEqual([
      "avatar",
      "dateId",
      "endDate",
      "name",
      "startDate",
      "userId",
    ]);
  });

  it("Group APIの作成から参加、退出、追放、削除までの認可契約を保証する", async () => {
    const [owner, member] = await db
      .insert(users)
      .values([
        {
          email: "group-api-owner@example.com",
          name: "APIオーナー",
          avatar: "sky",
        },
        {
          email: "group-api-member@example.com",
          name: "APIメンバー",
          avatar: null,
        },
      ])
      .returning();
    if (!owner || !member) {
      throw new Error("Failed to create group API users");
    }

    const [ownerSession] = await db
      .insert(authSessions)
      .values({
        userId: owner.id,
        refreshTokenDigest: "f".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    const [memberSession] = await db
      .insert(authSessions)
      .values({
        userId: member.id,
        refreshTokenDigest: "e".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    if (!ownerSession || !memberSession) {
      throw new Error("Failed to create API sessions");
    }

    const { createAccessToken } = await import("./core/security");
    const ownerToken = await createAccessToken({
      sub: owner.id,
      sid: ownerSession.id,
    });
    const memberToken = await createAccessToken({
      sub: member.id,
      sid: memberSession.id,
    });
    const request = (token: string, path: string, options: RequestInit = {}) =>
      app.request(path, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...options.headers,
        },
      });

    const unauthenticated = await app.request("/groups");
    expect(unauthenticated.status).toBe(401);

    const created = await request(ownerToken, "/groups", {
      method: "POST",
      body: JSON.stringify({ name: "APIグループ" }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      group: { id: string };
      joinCode: string;
    };
    const groupId = createdBody.group.id;
    const originalJoinCode = createdBody.joinCode;
    expect(JSON.stringify(createdBody)).not.toContain("joinCodeDigest");

    const listed = await request(ownerToken, "/groups");
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual([
      expect.objectContaining({ id: groupId, currentUserRole: "owner" }),
    ]);

    const detail = await request(ownerToken, `/groups/${groupId}`);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(await detail.json())).not.toContain(owner.email);

    const calendar = await request(
      ownerToken,
      `/groups/${groupId}/calendar?startDate=2026-08-21T00:00:00&endDate=2026-08-22T00:00:00`,
    );
    expect(calendar.status).toBe(200);
    await expect(calendar.json()).resolves.toMatchObject({
      completeness: "complete",
      requestedMemberCount: 1,
      fetchedMemberCount: 1,
      events: [],
    });

    const invalidRange = await request(
      ownerToken,
      `/groups/${groupId}/calendar?startDate=2026-08-22T00:00:00&endDate=2026-08-21T00:00:00`,
    );
    expect(invalidRange.status).toBe(400);
    await expect(invalidRange.json()).resolves.toEqual({
      code: "INVALID_DATE_RANGE",
    });

    const hiddenBeforeJoin = await request(memberToken, `/groups/${groupId}`);
    expect(hiddenBeforeJoin.status).toBe(404);

    const hiddenInvitation = await request(
      memberToken,
      `/groups/${groupId}/invitation`,
      { method: "POST" },
    );
    expect(hiddenInvitation.status).toBe(404);

    const regenerated = await request(
      ownerToken,
      `/groups/${groupId}/invitation`,
      { method: "POST" },
    );
    expect(regenerated.status).toBe(201);
    const regeneratedBody = (await regenerated.json()) as { joinCode: string };
    const joinCode = regeneratedBody.joinCode;
    expect(joinCode).not.toBe(originalJoinCode);
    expect(JSON.stringify(regeneratedBody)).not.toContain("joinCodeDigest");

    const oldInvitation = await request(memberToken, "/groups/join", {
      method: "POST",
      body: JSON.stringify({ joinCode: originalJoinCode }),
    });
    expect(oldInvitation.status).toBe(404);
    await expect(oldInvitation.json()).resolves.toEqual({
      code: "INVALID_JOIN_CODE",
    });

    const joined = await request(memberToken, "/groups/join", {
      method: "POST",
      body: JSON.stringify({ joinCode: ` ${joinCode}\n` }),
    });
    expect(joined.status).toBe(201);
    await expect(joined.json()).resolves.toMatchObject({
      id: groupId,
      currentUserRole: "member",
      memberCount: 2,
    });

    const memberInvitation = await request(
      memberToken,
      `/groups/${groupId}/invitation`,
      { method: "POST" },
    );
    expect(memberInvitation.status).toBe(403);
    await expect(memberInvitation.json()).resolves.toEqual({
      code: "GROUP_OWNER_REQUIRED",
    });

    const memberDelete = await request(memberToken, `/groups/${groupId}`, {
      method: "DELETE",
    });
    expect(memberDelete.status).toBe(403);
    await expect(memberDelete.json()).resolves.toEqual({
      code: "GROUP_OWNER_REQUIRED",
    });
    const ownerLeave = await request(ownerToken, `/groups/${groupId}/leave`, {
      method: "POST",
    });
    expect(ownerLeave.status).toBe(400);
    await expect(ownerLeave.json()).resolves.toEqual({
      code: "OWNER_CANNOT_LEAVE",
    });

    const duplicate = await request(memberToken, "/groups/join", {
      method: "POST",
      body: JSON.stringify({ joinCode }),
    });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toEqual({
      code: "ALREADY_GROUP_MEMBER",
      data: { groupId },
    });

    const left = await request(memberToken, `/groups/${groupId}/leave`, {
      method: "POST",
    });
    expect(left.status).toBe(204);
    const rejoined = await request(memberToken, "/groups/join", {
      method: "POST",
      body: JSON.stringify({ joinCode }),
    });
    expect(rejoined.status).toBe(201);

    const kicked = await request(
      ownerToken,
      `/groups/${groupId}/members/${member.id}`,
      {
        method: "DELETE",
      },
    );
    expect(kicked.status).toBe(204);
    const hidden = await request(memberToken, `/groups/${groupId}`);
    expect(hidden.status).toBe(404);
    const rejoinForbidden = await request(memberToken, "/groups/join", {
      method: "POST",
      body: JSON.stringify({ joinCode }),
    });
    expect(rejoinForbidden.status).toBe(403);

    const deleted = await request(ownerToken, `/groups/${groupId}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(204);
  });

  it("通知設定は未設定なら安全な既定値を返す", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "notification-default@example.com", name: "Default" })
      .returning();
    if (!user) throw new Error("通知設定テストユーザーを作成できません");

    const settings = await new EmailNotificationRepository().getByUser(user.id);

    expect(settings).toEqual({
      globalEnabled: false,
      timezone: "Asia/Tokyo",
      weekdays: Array.from({ length: 7 }, (_, index) => ({
        dayOfWeek: index + 1,
        enabled: false,
        deliveryTime: "09:00",
      })),
    });
  });

  it("通知設定は7曜日を一つのtransactionで置き換える", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "notification-update@example.com", name: "Update" })
      .returning();
    if (!user) throw new Error("通知設定テストユーザーを作成できません");

    const settings = await new EmailNotificationRepository().replace(user.id, {
      globalEnabled: true,
      timezone: "Asia/Tokyo",
      weekdays: Array.from({ length: 7 }, (_, index) => ({
        dayOfWeek: index + 1,
        enabled: index === 0,
        deliveryTime: "07:30",
      })),
    });

    expect(settings.globalEnabled).toBe(true);
    expect(settings.weekdays).toHaveLength(7);
    expect(settings.weekdays[0]).toMatchObject({
      dayOfWeek: 1,
      enabled: true,
      deliveryTime: "07:30",
    });
  });

  it("workerは有効sessionとJST当日予定を確認して一度だけ送信する", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "worker@example.com", name: "Worker" })
      .returning();
    if (!user) throw new Error("worker test user was not created");
    const [category] = await db
      .insert(categoryTable)
      .values({ userId: user.id, name: "仕事" })
      .returning();
    if (!category) throw new Error("worker test category was not created");
    const [schedule] = await db
      .insert(schedules)
      .values({
        userId: user.id,
        categoryId: category.id,
        title: "朝の予定",
        isTentative: false,
      })
      .returning();
    if (!schedule) throw new Error("worker test schedule was not created");
    await db.insert(scheduleDates).values({
      scheduleId: schedule.id,
      startDate: "2026-09-15T23:30:00",
      endDate: "2026-09-16T10:00:00",
    });
    await db.insert(authSessions).values({
      userId: user.id,
      refreshTokenDigest: "worker-test-refresh-token-digest",
      expiresAt: new Date("2026-09-17T00:00:00.000Z"),
    });
    await db.insert(emailNotificationPreferences).values({
      userId: user.id,
      globalEnabled: true,
      timezone: "Asia/Tokyo",
    });
    await db.insert(emailNotificationWeekdayRules).values(
      Array.from({ length: 7 }, (_, index) => ({
        userId: user.id,
        dayOfWeek: index + 1,
        enabled: index === 2,
        deliveryTime: "09:00",
      })),
    );

    const provider = new FakeEmailProvider();
    const summaries = await Promise.all(
      [
        new EmailNotificationRepository(),
        new EmailNotificationRepository(),
      ].map((repository) =>
        runDailyEmailOnce({
          repository,
          provider,
          now: () => new Date("2026-09-16T00:05:00.000Z"),
        }),
      ),
    );
    const first = summaries[0]!;
    const second = summaries[1]!;

    expect(
      [first, second].filter((summary) => summary.sent === 1),
    ).toHaveLength(1);
    expect(first.claimed + second.claimed).toBe(1);
    expect(provider.messages).toHaveLength(1);
    expect(provider.messages[0]?.subject).toBe("2026年9月16日（水）の予定");

    const repository = new EmailNotificationRepository();
    await db.insert(emailDeliveryLogs).values({
      userId: user.id,
      localDate: "2026-09-17",
      status: "pending",
      attemptCount: 1,
    });
    await expect(
      repository.claim(
        user.id,
        "2026-09-17",
        new Date("2026-09-16T00:05:00.000Z"),
        3,
      ),
    ).resolves.toBe(false);

    await db
      .update(authSessions)
      .set({ revokedAt: new Date("2026-09-16T00:06:00.000Z") })
      .where(eq(authSessions.userId, user.id));
    await expect(
      repository.hasActiveSession(
        user.id,
        new Date("2026-09-16T00:07:00.000Z"),
      ),
    ).resolves.toBe(false);

    await db.insert(authSessions).values({
      userId: user.id,
      refreshTokenDigest: "worker-test-expired-refresh-token-digest",
      expiresAt: new Date("2026-09-16T00:07:00.000Z"),
    });
    await expect(
      repository.hasActiveSession(
        user.id,
        new Date("2026-09-16T00:07:00.000Z"),
      ),
    ).resolves.toBe(false);

    await db.insert(emailDeliveryLogs).values([
      {
        userId: user.id,
        localDate: "2026-09-18",
        status: "failed",
        attemptCount: 3,
        lastError: "temporary",
      },
      {
        userId: user.id,
        localDate: "2026-09-19",
        status: "failed",
        attemptCount: 1,
        lastError: "quota",
      },
    ]);
    await db.insert(emailDeliveryLogs).values({
      userId: user.id,
      localDate: "2026-09-20",
      status: "pending",
      attemptCount: 1,
    });
    await repository.markFailed(
      user.id,
      "2026-09-20",
      new Date("2026-09-16T00:08:00.000Z"),
      "permanent",
    );
    const [permanentFailure] = await db
      .select({ attemptCount: emailDeliveryLogs.attemptCount })
      .from(emailDeliveryLogs)
      .where(eq(emailDeliveryLogs.localDate, "2026-09-20"));
    expect(permanentFailure?.attemptCount).toBe(1);

    await expect(
      repository.claim(
        user.id,
        "2026-09-18",
        new Date("2026-09-16T00:07:00.000Z"),
        3,
      ),
    ).resolves.toBe(false);
    await expect(
      repository.claim(
        user.id,
        "2026-09-19",
        new Date("2026-09-16T00:07:00.000Z"),
        3,
      ),
    ).resolves.toBe(false);
  });
});
