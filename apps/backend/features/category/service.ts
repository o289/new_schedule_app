import type {
  CategoryCreate,
  CategoryUpdate,
} from "../../../../packages/schemas/category";
import { BadRequestError, NotFoundError } from "../../core/api-error";
import type { User } from "../user/repository";
import { CategoryRepository, type Category } from "./repository";

function isForeignKeyViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && error.code === "23503") {
    return true;
  }

  return (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    error.cause.code === "23503"
  );
}

export class CategoryService {
  private readonly repository: CategoryRepository;

  constructor(repository = new CategoryRepository()) {
    this.repository = repository;
  }

  async listCategories(user: User): Promise<Category[]> {
    return this.repository.getByUser(user.id);
  }

  async createCategory(user: User, input: CategoryCreate): Promise<Category> {
    return this.repository.create(input, user.id);
  }

  async updateCategory(
    user: User,
    categoryId: string,
    input: CategoryUpdate,
  ): Promise<Category> {
    const category = await this.repository.get(categoryId);
    if (!category || category.userId !== user.id) {
      throw new NotFoundError("NOT_FOUND_CATEGORY");
    }

    const updated = await this.repository.update(categoryId, input);
    if (!updated) {
      throw new NotFoundError("NOT_FOUND_CATEGORY");
    }

    return updated;
  }

  async deleteCategory(user: User, categoryId: string): Promise<void> {
    const category = await this.repository.get(categoryId);
    if (!category || category.userId !== user.id) {
      throw new NotFoundError("NOT_FOUND_CATEGORY");
    }

    try {
      const deleted = await this.repository.delete(categoryId, user.id);
      if (!deleted) {
        throw new NotFoundError("NOT_FOUND_CATEGORY");
      }
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestError("CATEGORY_HAS_SCHEDULES");
      }

      throw error;
    }
  }
}
