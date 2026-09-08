import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAlert } from "#frontend/context/AlertContext";
import { categoryApi } from "#frontend/lib/api";
import { getApiErrorCode } from "#frontend/lib/apiError";
import { categoryQueries } from "#frontend/lib/queryOptions";
import { categoryKeys, scheduleKeys } from "#frontend/lib/queryKeys";
import type {
  CategoryColor,
  CategoryCreate,
  CategoryIcon,
  CategoryResponse,
} from "#schemas/category";

type Category = CategoryResponse;

type CategoryForm = CategoryCreate;

export function useCategory() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery(categoryQueries.list());

  const createCategory = useMutation({
    mutationFn: categoryApi.create,
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const updateCategory = useMutation({
    mutationFn: ({
      id,
      category,
    }: {
      id: Category["id"];
      category: CategoryForm;
    }) => categoryApi.update(id, category),
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const deleteCategory = useMutation({
    mutationFn: categoryApi.remove,
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const categories = categoriesQuery.data ?? [];

  useEffect(() => {
    if (categoriesQuery.error) {
      showAlert(getApiErrorCode(categoriesQuery.error));
    }
  }, [categoriesQuery.error, showAlert]);

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
      await queryClient.invalidateQueries({
        queryKey: categoryQueries.list().queryKey,
      });
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
