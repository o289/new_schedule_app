// src/context/AlertContext.jsx
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { ALERT_MESSAGES } from "../constants/alertMessages";
import type { AlertCode } from "../constants/alertMessages";
import AlertToast from "../components/AlertToast";

// Context 作成
interface AlertState {
  open: boolean;
  code: AlertCode | null;
}

interface AlertContextValue {
  alertState: AlertState;
  showAlert: (code: string) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

// Provider
export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    code: null,
  });

  /**
   * alert を表示する
   * @param {string} code - backend から返ってきた code
   */
  const showAlert = useCallback((code: string) => {
    if (!code) return;

    // 定義されていない code は SERVER_ERROR 扱い
    const resolvedCode: AlertCode =
      code in ALERT_MESSAGES ? (code as AlertCode) : "SERVER_ERROR";

    setAlertState({
      open: true,
      code: resolvedCode,
    });
  }, []);

  /**
   * alert を閉じる
   */
  const hideAlert = useCallback(() => {
    setAlertState({
      open: false,
      code: null,
    });
  }, []);

  return (
    <AlertContext.Provider
      value={{
        alertState,
        showAlert,
        hideAlert,
      }}
    >
      {children}
      <AlertToast />
    </AlertContext.Provider>
  );
};

// hook
export const useAlert = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error("useAlert must be used within AlertProvider");
  }
  return ctx;
};
