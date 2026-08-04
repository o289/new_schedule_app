import { Navigate, Outlet } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { useSession } from "../hooks/useSession";

export default function RequireAuth() {
  const { isAuthenticated, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <CircularProgress aria-label="処理中" className="w-64" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
