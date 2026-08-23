import type { GroupMemberResponse } from "#schemas/group";
import { ProfileAvatar } from "#frontend/components/common/ProfileAvatar";

type GroupMemberListProps = {
  members: GroupMemberResponse[];
  isOwner: boolean;
  currentUserId?: string;
  onKick: (userId: string) => void;
  isKicking: boolean;
};

export default function GroupMemberList({
  members,
  isOwner,
  currentUserId,
  onKick,
  isKicking,
}: GroupMemberListProps) {
  return (
    <ul className="divide-y divide-[#eef1f5] rounded-2xl border border-[#e5e7eb] bg-white">
      {members.map((member) => {
        const canKick =
          isOwner &&
          member.role === "member" &&
          member.userId !== currentUserId;
        return (
          <li
            key={member.userId}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar
                name={member.name}
                avatar={member.avatar}
                size={40}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#111827]">
                  {member.name}
                </p>
                <p className="text-xs text-[#6b7280]">
                  {member.role === "owner" ? "オーナー" : "メンバー"}
                </p>
              </div>
            </div>
            {canKick && (
              <button
                type="button"
                onClick={() => onKick(member.userId)}
                disabled={isKicking}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#c2410c] hover:bg-[#fff7ed] disabled:opacity-50"
              >
                追放
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
