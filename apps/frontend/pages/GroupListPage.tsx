import { useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";

import JoinCodeDialog from "#frontend/components/groups/JoinCodeDialog";
import { useGroupList } from "../components/groups/useGroupManagement";
import { useAlert } from "#frontend/context/AlertContext";
import { getApiErrorCode } from "#frontend/lib/apiError";

export default function GroupListPage() {
  const navigate = useNavigate();
  const { showAlert } = useAlert();
  const { listQuery, createMutation, joinMutation } = useGroupList();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createdJoinCode, setCreatedJoinCode] = useState<string | null>(null);

  const createGroup = async () => {
    try {
      const created = await createMutation.mutateAsync({ name });
      setCreateOpen(false);
      setName("");
      setCreatedJoinCode(created.joinCode);
    } catch (error) {
      showAlert(getApiErrorCode(error));
    }
  };

  const joinGroup = async () => {
    try {
      await joinMutation.mutateAsync({ joinCode });
      setJoinOpen(false);
      setJoinCode("");
    } catch {
      // エラー時の遷移と通知はhookで一元化する。
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f9fc] px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="text-sm font-medium text-[#5f6b7a] hover:text-[#111827]"
            >
              ← 個人カレンダーに戻る
            </button>
            <h1 className="mt-3 text-3xl font-bold text-[#111827]">グループ</h1>
            <p className="mt-2 text-sm text-[#6b7280]">
              参加しているグループを管理できます。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outlined" onClick={() => setJoinOpen(true)}>
              参加する
            </Button>
            <Button variant="contained" onClick={() => setCreateOpen(true)}>
              作成する
            </Button>
          </div>
        </div>

        {listQuery.isPending ? (
          <div className="flex justify-center py-16">
            <CircularProgress aria-label="グループを読み込み中" />
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {listQuery.data?.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/groups/${group.id}`}
                  className="block rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm transition hover:border-[#93c5fd] hover:shadow-md"
                >
                  <p className="text-lg font-bold text-[#111827]">
                    {group.name}
                  </p>
                  <p className="mt-2 text-sm text-[#6b7280]">
                    {group.memberCount}人・
                    {group.currentUserRole === "owner"
                      ? "オーナー"
                      : "メンバー"}
                  </p>
                </Link>
              </li>
            ))}
            {listQuery.data?.length === 0 && (
              <li className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white p-8 text-center text-sm text-[#6b7280] sm:col-span-2">
                参加中のグループはありません。
              </li>
            )}
          </ul>
        )}
      </section>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>グループを作成</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="グループ名"
            value={name}
            onChange={(event) => setName(event.target.value)}
            inputProps={{ maxLength: 50 }}
            sx={{ marginTop: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={createGroup}
            disabled={!name.trim() || createMutation.isPending}
          >
            作成する
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>グループに参加</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="参加コード"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            sx={{ marginTop: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={joinGroup}
            disabled={!joinCode.trim() || joinMutation.isPending}
          >
            参加する
          </Button>
        </DialogActions>
      </Dialog>

      <JoinCodeDialog
        joinCode={createdJoinCode}
        onClose={() => setCreatedJoinCode(null)}
      />
    </main>
  );
}
