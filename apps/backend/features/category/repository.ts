import { and, eq } from "drizzle-orm";

import type {
  CategoryCreate,
  CategoryUpdate,
} from "../../../../packages/schemas/category";
import { BaseRepository } from "../../database/repository";
import { categories } from "./model";

export type Category = typeof categories.$inferSelect;

export class CategoryRepository extends BaseRepository {
  async create(input: CategoryCreate, userId: string): Promise<Category> {
    const [category] = await this.database
      .insert(categories)
      .values({ ...input, userId })
      .returning();

    if (!category) {
      throw new Error("Failed to create category");
    }

    return category;
  }

  async get(categoryId: string): Promise<Category | null> {
    const [category] = await this.database
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    return category ?? null;
  }

  async getByUser(userId: string): Promise<Category[]> {
    return this.database
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));
  }

  async update(
    categoryId: string,
    input: CategoryUpdate,
  ): Promise<Category | null> {
    const [category] = await this.database
      .update(categories)
      .set(input)
      .where(eq(categories.id, categoryId))
      .returning();

    return category ?? null;
  }

  async delete(categoryId: string, userId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(categories)
      .where(
        and(eq(categories.id, categoryId), eq(categories.userId, userId)),
      )
      .returning({ id: categories.id });

    return deleted.length > 0;
  }
}
