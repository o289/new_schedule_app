import type {
  CategoryCreate,
  CategoryUpdate,
} from "../../../../packages/schemas/category";
import { sortCategories } from "../../../../packages/utils/category-sort";
import { BadRequestError, NotFoundError } from "../../core/api-error";
import { hasDatabaseErrorCode } from "../../core/database-error";
import type { User } from "../user/repository";
import { CategoryRepository, type Category } from "./repository";

export class CategoryService {
  private readonly repository: CategoryRepository;

  constructor(repository = new CategoryRepository()) {
    this.repository = repository;
  }

  async listCategories(user: User): Promise<Category[]> {
    const categories = await this.repository.getByUser(user.id);

    return sortCategories(categories);
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
      if (hasDatabaseErrorCode(error, "23503")) {
        throw new BadRequestError("CATEGORY_HAS_SCHEDULES");
      }

      throw error;
    }
  }
}
