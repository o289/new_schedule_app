import { useAuth } from "../context/AuthContext";
import { Navigate, Outlet } from "react-router-dom";
import { CircularProgress } from "@mui/material";

export default function RequireAuth() {
  const { user, isLoading } = useAuth();

  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <CircularProgress aria-label="処理中" className="w-64" />
      </div>
    );
  }

  if (!user && !isLoading) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
