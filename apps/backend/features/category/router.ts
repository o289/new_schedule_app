import { Hono } from "hono";

import {
  categoryCreateSchema,
  categoryResponseSchema,
  categoryUpdateSchema,
} from "../../../../packages/schemas/category";
import { ValidationError } from "../../core/api-error";
import { requireCurrentUser } from "../../core/current-user";
import { parseJsonBody, parseUuidParam } from "../../core/request";
import { CategoryService } from "./service";

export const categoryRouter = new Hono().basePath("/categories");

categoryRouter.get("/", async (context) => {
  const categories = await new CategoryService().listCategories(
    await requireCurrentUser(context),
  );

  return context.json(
    categories.map((category) => categoryResponseSchema.parse(category)),
  );
});

categoryRouter.post("/", async (context) => {
  const category = await new CategoryService().createCategory(
    await requireCurrentUser(context),
    await parseJsonBody(
      context,
      categoryCreateSchema,
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.json(categoryResponseSchema.parse(category), 201);
});

categoryRouter.put("/:categoryId", async (context) => {
  const category = await new CategoryService().updateCategory(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("categoryId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
    await parseJsonBody(
      context,
      categoryUpdateSchema,
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.json(categoryResponseSchema.parse(category), 200);
});

categoryRouter.delete("/:categoryId", async (context) => {
  await new CategoryService().deleteCategory(
    await requireCurrentUser(context),
    parseUuidParam(
      context.req.param("categoryId"),
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.body(null, 204);
});
