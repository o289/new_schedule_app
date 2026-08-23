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

import { useCalendar } from "#frontend/context/CalendarContext";
import { ApiClientError } from "#frontend/lib/apiError";
import JoinCodeDialog from "./JoinCodeDialog";
import { useGroupList } from "./useGroupManagement";

export default function GroupManagementAside() {
  const {
    setAsideMode,
    setSelectedCalendar,
    createdJoinCode,
    setCreatedJoinCode,
  } = useCalendar();
  const { listQuery, createMutation, joinMutation } = useGroupList();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const selectGroup = (groupId: string) => {
    setSelectedCalendar({ kind: "group", groupId });
    setAsideMode("group-detail");
  };

  const createGroup = async () => {
    try {
      const created = await createMutation.mutateAsync({ name });
      setName("");
      setCreateOpen(false);
      setCreatedJoinCode({
        groupId: created.group.id,
        joinCode: created.joinCode,
      });
      setJoinCodeOpen(true);
    } catch {
      // エラー通知はhookで統一する。
    }
  };

  const joinGroup = async () => {
    try {
      const group = await joinMutation.mutateAsync({ joinCode });
      setJoinCode("");
      setJoinOpen(false);
      selectGroup(group.id);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "ALREADY_GROUP_MEMBER" &&
        error.details
      ) {
        setJoinCode("");
        setJoinOpen(false);
        selectGroup(error.details.groupId);
      }
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-[#111827]">グループ</h2>
        <button
          type="button"
          onClick={() => setAsideMode(null)}
          className="text-sm font-medium text-[#6b7280] hover:text-[#111827]"
        >
          閉じる
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outlined" onClick={() => setJoinOpen(true)}>
          参加する
        </Button>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>
          作成する
        </Button>
      </div>

      {listQuery.isPending ? (
        <div className="flex justify-center py-12">
          <CircularProgress aria-label="グループを読み込み中" />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {listQuery.data?.map((group) => (
            <li key={group.id}>
              <div className="w-full rounded-xl border border-[#e5e7eb] bg-white p-4 text-left shadow-sm transition ">
                <p className="font-bold text-[#111827]">{group.name}</p>
                <p className="mt-1 text-sm text-[#6b7280]">
                  {group.memberCount}人・
                  {group.currentUserRole === "owner" ? "オーナー" : "メンバー"}
                </p>
              </div>
            </li>
          ))}
          {listQuery.data?.length === 0 && (
            <li className="rounded-xl border border-dashed border-[#cbd5e1] bg-white p-6 text-center text-sm text-[#6b7280]">
              参加中のグループはありません。
            </li>
          )}
        </ul>
      )}

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
        joinCode={joinCodeOpen ? (createdJoinCode?.joinCode ?? null) : null}
        onClose={() => {
          setJoinCodeOpen(false);
          if (createdJoinCode) selectGroup(createdJoinCode.groupId);
        }}
      />
    </>
  );
}
