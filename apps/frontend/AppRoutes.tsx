import { Routes, Route } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import { CalendarProvider } from "./context/CalendarContext";
import EntrancePage from "./pages/EntrancePage";
import Dashboard from "./pages/Dashboard";

export default function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<EntrancePage />} />

        <Route element={<RequireAuth />}>
          <Route
            path="/dashboard"
            element={
              <CalendarProvider>
                <Dashboard />
              </CalendarProvider>
            }
          />
        </Route>
      </Routes>
    </>
  );
}
