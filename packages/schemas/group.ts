import { z } from "zod";

import { avatarKeySchema, userNameSchema } from "./user";

export const groupMemberRoleSchema = z.enum(["owner", "member"]);

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "グループ名を入力してください")
  .max(50, "グループ名は50文字以内で入力してください");

export function normalizeJoinCode(value: string): string {
  return value.replace(/\s/gu, "").toUpperCase();
}

export const joinCodeSchema = z.string().min(1);

export const groupCreateSchema = z.object({ name: groupNameSchema }).strict();

export const groupJoinSchema = z
  .object({
    joinCode: z.string().transform(normalizeJoinCode).pipe(joinCodeSchema),
  })
  .strict();

const localDateTimeSchema = z.iso.datetime({ local: true });

export const groupCalendarQuerySchema = z
  .object({
    startDate: localDateTimeSchema,
    endDate: localDateTimeSchema,
  })
  .strict();

export const groupMemberPublicUserSchema = z
  .object({
    userId: z.uuid(),
    name: userNameSchema,
    avatar: avatarKeySchema.nullable(),
  })
  .strict();

export const groupMemberResponseSchema = groupMemberPublicUserSchema
  .extend({
    role: groupMemberRoleSchema,
    joinedAt: z.iso.datetime(),
  })
  .strict();

export const groupResponseSchema = z
  .object({
    id: z.uuid(),
    name: groupNameSchema,
    currentUserRole: groupMemberRoleSchema,
    memberCount: z.number().int().min(1).max(5),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const groupDetailResponseSchema = z
  .object({
    group: groupResponseSchema,
    members: z.array(groupMemberResponseSchema),
  })
  .strict();

export const groupCreatedResponseSchema = z
  .object({
    group: groupResponseSchema,
    joinCode: joinCodeSchema,
  })
  .strict();

export const alreadyGroupMemberErrorSchema = z
  .object({
    code: z.literal("ALREADY_GROUP_MEMBER"),
    data: z.object({ groupId: z.uuid() }).strict(),
  })
  .strict();

export const groupBusyEventSchema = z
  .object({
    dateId: z.uuid(),
    member: groupMemberPublicUserSchema,
    startDate: localDateTimeSchema,
    endDate: localDateTimeSchema,
  })
  .strict();

export const groupCalendarResponseSchema = z
  .object({
    groupId: z.uuid(),
    requestedMemberCount: z.number().int().min(1).max(5),
    fetchedMemberCount: z.number().int().min(1).max(5),
    completeness: z.literal("complete"),
    members: z.array(groupMemberResponseSchema),
    events: z.array(groupBusyEventSchema),
  })
  .strict();

export type GroupCreate = z.infer<typeof groupCreateSchema>;
export type GroupJoin = z.infer<typeof groupJoinSchema>;
export type GroupMemberRole = z.infer<typeof groupMemberRoleSchema>;
export type GroupMemberResponse = z.infer<typeof groupMemberResponseSchema>;
export type GroupResponse = z.infer<typeof groupResponseSchema>;
export type GroupDetailResponse = z.infer<typeof groupDetailResponseSchema>;
export type GroupBusyEvent = z.infer<typeof groupBusyEventSchema>;
export type GroupCalendarResponse = z.infer<typeof groupCalendarResponseSchema>;
