import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import { Avatar } from "@mui/material";

import type { AvatarKey } from "#schemas/user";

const avatarColors: Record<AvatarKey, string> = {
  sky: "#38bdf8",
  emerald: "#34d399",
  amber: "#fbbf24",
  rose: "#fb7185",
  violet: "#a78bfa",
  slate: "#94a3b8",
};

type ProfileAvatarProps = {
  name: string;
  avatar: AvatarKey | null;
  size?: number;
};

export function ProfileAvatar({ name, avatar, size = 40 }: ProfileAvatarProps) {
  if (avatar === null) {
    return (
      <Avatar sx={{ width: size, height: size }}>
        <PersonRoundedIcon />
      </Avatar>
    );
  }

  return (
    <Avatar
      sx={{
        width: size,
        height: size,
        backgroundColor: avatarColors[avatar],
        color: "white",
        fontWeight: 700,
      }}
    >
      {name.slice(0, 1)}
    </Avatar>
  );
}
