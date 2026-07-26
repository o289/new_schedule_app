// src/pages/categories/useCategory.ts

import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import useLoading from "../../hooks/useLoading";
import type {
  CategoryColor,
  CategoryCreate,
  CategoryResponse,
} from "../../../../packages/schemas/category";

const BASE_URL = "/categories";

type Category = CategoryResponse;

type CategoryForm = CategoryCreate;

export function useCategory() {
  const { showAlert } = useAlert();
  const { authFetch } = useAuth();
  const { isFetching, startFetching, stopFetching } = useLoading();

  // 一覧
  const [categories, setCategories] = useState<Category[]>([]);

  // フォーム（新規・編集共通）
  const [form, setForm] = useState<CategoryForm>({
    name: "",
    color: "gray",
  });

  // 編集対象
  const [editingId, setEditingId] = useState<Category["id"] | null>(null);

  // ========================
  // 一覧取得
  // ========================

  const fetchCategories = async () => {
    startFetching();

    try {
      const res = await authFetch<Category[]>(BASE_URL, { method: "GET" });

      setCategories(res);
    } finally {
      stopFetching();
    }
  };

  // ========================
  // フォーム変更
  // ========================

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name as keyof CategoryForm]: value as CategoryColor,
    }));
  };

  // ========================
  // 作成 / 更新
  // ========================

  const handleSubmit = async () => {
    if (editingId) {
      // 更新

      await authFetch(`${BASE_URL}/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });

      showAlert("UPDATE_SUCCESS");
    } else {
      // 作成

      await authFetch(BASE_URL, {
        method: "POST",
        body: JSON.stringify(form),
      });

      showAlert("CREATE_SUCCESS");
    }

    // フォームリセット
    setForm({ name: "", color: "gray" });
    setEditingId(null);

    fetchCategories();
  };

  // ========================
  // 編集開始
  // ========================

  const handleEditClick = (category: Category) => {
    setEditingId(category.id);

    setForm({
      name: category.name,
      color: category.color,
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
    });
  };

  // ========================
  // 削除
  // ========================

  const handleDelete = async (category: Category) => {
    setEditingId(category.id);

    await authFetch(`${BASE_URL}/${category.id}`, { method: "DELETE" });

    // 即時UI反映
    // setCategories((prev) => prev.filter((c) => String(c.id) !== String(id)));
    fetchCategories();
    showAlert("DELETE_SUCCESS");
  };

  // ========================
  // 初期ロード
  // ========================

  useEffect(() => {
    fetchCategories();
  }, []);

  return {
    // state
    categories,
    form,
    editingId,
    isFetching,
    // actions
    fetchCategories,
    handleChange,
    handleSubmit,
    handleEditClick,
    handleCancelEdit,
    handleDelete,
  };
}
