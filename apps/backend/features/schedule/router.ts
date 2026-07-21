import { Hono } from "hono";

import {
  scheduleCreateSchema,
  scheduleResponseSchema,
  scheduleUpdateSchema,
} from "../../../../packages/schemas/schedule";
import { ValidationError } from "../../core/api-error";
import { requireCurrentUser } from "../../core/current-user";
import { parseJsonBody, parseUuidParam } from "../../core/request";
import type { Schedule } from "./repository";
import { ScheduleService } from "./service";

function serializeSchedule(schedule: Schedule) {
  return scheduleResponseSchema.parse({
    id: schedule.id,
    title: schedule.title,
    ...(schedule.note !== null && { note: schedule.note }),
    categoryId: schedule.categoryId,
    category: schedule.category,
    dates: schedule.dates.map((date) => ({
      id: date.id,
      startDate: date.startDate.replace(" ", "T"),
      endDate: date.endDate.replace(" ", "T"),
    })),
  });
}

export const scheduleRouter = new Hono().basePath("/schedules");

scheduleRouter.post("/", async (context) => {
  const schedule = await new ScheduleService().createSchedule(
    await requireCurrentUser(context),
    await parseJsonBody(
      context,
      scheduleCreateSchema,
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );
  return context.json(serializeSchedule(schedule), 201);
});

scheduleRouter.get("/", async (context) => {
  const schedules = await new ScheduleService().listSchedules(
    await requireCurrentUser(context),
  );
  return context.json(schedules.map(serializeSchedule));
});

scheduleRouter.get("/:scheduleId", async (context) => {
  const schedule = await new ScheduleService().getSchedule(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("scheduleId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );
  return context.json(serializeSchedule(schedule));
});

scheduleRouter.put("/:scheduleId", async (context) => {
  const schedule = await new ScheduleService().updateSchedule(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("scheduleId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
    await parseJsonBody(
      context,
      scheduleUpdateSchema,
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );
  return context.json(serializeSchedule(schedule));
});

scheduleRouter.delete("/:scheduleId", async (context) => {
  await new ScheduleService().deleteSchedule(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("scheduleId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );
  return context.body(null, 204);
});
