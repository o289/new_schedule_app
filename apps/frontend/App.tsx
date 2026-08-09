import { BrowserRouter as Router } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "./lib/queryClient";
import { AlertProvider } from "./context/AlertContext.jsx";
import AppRoutes from "./AppRoutes.js";

function App() {
  return (
    <Router>
      <AlertProvider>
        <QueryClientProvider client={queryClient}>
          <AppRoutes />
        </QueryClientProvider>
      </AlertProvider>
    </Router>
  );
}

export default App;
