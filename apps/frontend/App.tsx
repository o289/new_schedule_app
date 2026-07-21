import { BrowserRouter as Router } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext.jsx"; // ←追加
import { AlertProvider } from "./context/AlertContext.jsx";
import AppRoutes from "./AppRoutes.js";

function App() {
  return (
    <Router>
      <AlertProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </AlertProvider>
    </Router>
  );
}

export default App;
