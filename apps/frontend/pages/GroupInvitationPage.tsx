import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, CircularProgress } from "@mui/material";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import { useNavigate } from "react-router-dom";

import EntrancePage from "./EntrancePage";
import { parseInvitationToken } from "../components/groups/invitationLink";
import { useAlert } from "../context/AlertContext";
import { useSession } from "../hooks/useSession";
import { groupApi } from "../lib/api";
import { ApiClientError, getApiErrorCode } from "../lib/apiError";
import { groupKeys } from "../lib/queryKeys";

export default function GroupInvitationPage() {
  const [, setAuthenticationVersion] = useState(0);
  const token = parseInvitationToken(window.location.hash);
  const { isAuthenticated, isLoading } = useSession();
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const joinMutation = useMutation({
    mutationFn: (joinCode: string) => groupApi.join({ joinCode }),
    retry: false,
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
      navigate("/dashboard", {
        replace: true,
        state: { selectedGroupId: group.id },
      });
    },
    onError: (error) => {
      if (
        error instanceof ApiClientError &&
        error.code === "ALREADY_GROUP_MEMBER" &&
        error.details
      ) {
        navigate("/dashboard", {
          replace: true,
          state: { selectedGroupId: error.details.groupId },
        });
        return;
      }
      showAlert(getApiErrorCode(error));
    },
  });

  if (!token) {
    return (
      <InvitationLayout>
        <h1 className="text-2xl font-bold text-[#111827]">無効な招待リンク</h1>
        <p className="mt-3 text-sm leading-6 text-[#4b5563]">
          招待リンクが正しいか、グループのオーナーに確認してください。
        </p>
        <Button
          className="!mt-6"
          fullWidth
          variant="contained"
          onClick={() =>
            navigate(isAuthenticated ? "/dashboard" : "/", { replace: true })
          }
        >
          戻る
        </Button>
      </InvitationLayout>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CircularProgress aria-label="認証状態を確認中" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <EntrancePage
        onAuthenticated={() =>
          setAuthenticationVersion((current) => current + 1)
        }
      />
    );
  }

  return (
    <InvitationLayout>
      <GroupsRoundedIcon sx={{ color: "#4a90e2", fontSize: 72 }} />
      <h1 className="mt-5 text-2xl font-bold text-[#111827]">
        グループへの招待
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#4b5563]">
        招待されたグループに参加しますか？
      </p>
      <div className="mt-7 flex flex-col gap-3">
        <Button
          fullWidth
          variant="contained"
          disabled={joinMutation.isPending}
          onClick={() => joinMutation.mutate(token)}
        >
          参加する
        </Button>
        <Button
          fullWidth
          variant="outlined"
          disabled={joinMutation.isPending}
          onClick={() => navigate("/dashboard", { replace: true })}
        >
          キャンセル
        </Button>
      </div>
    </InvitationLayout>
  );
}

function InvitationLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[#e5e7eb] bg-white p-7 text-center shadow-sm">
        {children}
      </section>
    </main>
  );
}
