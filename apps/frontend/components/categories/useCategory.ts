import { useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { categoryKeys, scheduleKeys } from "../../lib/queryKeys";
import type {
  CategoryColor,
  CategoryCreate,
  CategoryIcon,
  CategoryResponse,
} from "../../../../packages/schemas/category";

const BASE_URL = "/categories";

type Category = CategoryResponse;

type CategoryForm = CategoryCreate;

export function useCategory() {
  const { showAlert } = useAlert();
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: categoryKeys.lists(),
    queryFn: ({ signal }) =>
      authFetch<Category[]>(BASE_URL, { method: "GET", signal }),
  });

  const createCategory = useMutation({
    mutationFn: (category: CategoryForm) =>
      authFetch<Category>(BASE_URL, {
        method: "POST",
        body: JSON.stringify(category),
      }),
  });

  const updateCategory = useMutation({
    mutationFn: ({
      id,
      category,
    }: {
      id: Category["id"];
      category: CategoryForm;
    }) =>
      authFetch<Category>(`${BASE_URL}/${id}`, {
        method: "PUT",
        body: JSON.stringify(category),
      }),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: Category["id"]) =>
      authFetch<void>(`${BASE_URL}/${id}`, { method: "DELETE" }),
  });

  const categories = categoriesQuery.data ?? [];

  // フォーム（新規・編集共通）
  const [form, setForm] = useState<CategoryForm>({
    name: "",
    color: "gray",
    icon: "tag",
  });

  // 編集対象
  const [editingId, setEditingId] = useState<Category["id"] | null>(null);

  // ========================
  // フォーム変更
  // ========================

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "color") {
      setForm((prev) => ({ ...prev, color: value as CategoryColor }));
      return;
    }

    if (name === "icon") {
      setForm((prev) => ({ ...prev, icon: value as CategoryIcon }));
      return;
    }

    if (name === "name") {
      setForm((prev) => ({ ...prev, name: value }));
    }
  };

  // ========================
  // 作成 / 更新
  // ========================

  const handleSubmit = async () => {
    if (editingId) {
      await updateCategory.mutateAsync({ id: editingId, category: form });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: scheduleKeys.all }),
      ]);

      setForm({ name: "", color: "gray", icon: "tag" });
      setEditingId(null);
      showAlert("UPDATE_SUCCESS");
      return;
    } else {
      await createCategory.mutateAsync(form);
      await queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
    }

    setForm({ name: "", color: "gray", icon: "tag" });
    setEditingId(null);
    showAlert("CREATE_SUCCESS");
  };

  // ========================
  // 編集開始
  // ========================

  const handleEditClick = (category: Category) => {
    setEditingId(category.id);

    setForm({
      name: category.name,
      color: category.color,
      icon: category.icon,
    });
  };

  // ========================
  // 編集キャンセル
  // ========================

  const handleCancelEdit = () => {
    setEditingId(null);

    setForm({
      name: "",
      color: "gray",
      icon: "tag",
    });
  };

  // ========================
  // 削除
  // ========================

  const handleDelete = async (category: Category) => {
    setEditingId(category.id);

    await deleteCategory.mutateAsync(category.id);
    await queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    showAlert("DELETE_SUCCESS");
  };

  return {
    // state
    categories,
    form,
    editingId,
    isFetching: categoriesQuery.isFetching,
    isPending: categoriesQuery.isPending,
    // actions
    handleChange,
    handleSubmit,
    handleEditClick,
    handleCancelEdit,
    handleDelete,
  };
}
