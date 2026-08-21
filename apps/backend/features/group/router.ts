import { Hono } from "hono";

import {
  groupCalendarQuerySchema,
  groupCalendarResponseSchema,
  groupCreateSchema,
  groupCreatedResponseSchema,
  groupDetailResponseSchema,
  groupJoinSchema,
  groupResponseSchema,
} from "#schemas/group";
import { ValidationError } from "#backend/core/api-error";
import { requireCurrentUser } from "#backend/core/current-user";
import { parseJsonBody, parseUuidParam } from "#backend/core/request";
import { GroupService } from "./service";

export const groupRouter = new Hono().basePath("/groups");

groupRouter.get("/", async (context) => {
  const groups = await new GroupService().listGroups(
    await requireCurrentUser(context),
  );

  return context.json(groups.map((group) => groupResponseSchema.parse(group)));
});

groupRouter.post("/", async (context) => {
  const created = await new GroupService().createGroup(
    await requireCurrentUser(context),
    await parseJsonBody(
      context,
      groupCreateSchema,
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.json(groupCreatedResponseSchema.parse(created), 201);
});

groupRouter.post("/join", async (context) => {
  const group = await new GroupService().joinGroup(
    await requireCurrentUser(context),
    await parseJsonBody(
      context,
      groupJoinSchema,
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.json(groupResponseSchema.parse(group), 201);
});

groupRouter.get("/:groupId/calendar", async (context) => {
  const range = groupCalendarQuerySchema.safeParse({
    startDate: context.req.query("startDate"),
    endDate: context.req.query("endDate"),
  });
  if (!range.success) {
    throw new ValidationError("VALIDATION_ERROR");
  }

  const calendar = await new GroupService().listCalendar(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("groupId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
    range.data,
  );

  return context.json(groupCalendarResponseSchema.parse(calendar));
});

groupRouter.get("/:groupId", async (context) => {
  const group = await new GroupService().getGroup(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("groupId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.json(groupDetailResponseSchema.parse(group));
});

groupRouter.delete("/:groupId", async (context) => {
  await new GroupService().deleteGroup(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("groupId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.body(null, 204);
});

groupRouter.delete("/:groupId/members/:userId", async (context) => {
  await new GroupService().kickMember(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("groupId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
    parseUuidParam(
      context.req.param("userId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.body(null, 204);
});

groupRouter.post("/:groupId/leave", async (context) => {
  await new GroupService().leaveGroup(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("groupId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.body(null, 204);
});
