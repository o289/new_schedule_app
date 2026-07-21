import { useAuth } from "../context/AuthContext";
import { Navigate, Outlet } from "react-router-dom";
import { LinearProgress } from "@mui/material";

export default function RequireAuth() {
  const { user, isLoading } = useAuth();

  if (isLoading && !user) {
    return <LinearProgress aria-label="処理中" />;
  }

  if (!user && !isLoading) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
