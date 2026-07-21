// src/components/alert/AlertToast.jsx
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { ALERT_MESSAGES } from "../constants/alertMessages";
import { useAlert } from "../context/AlertContext";

const AlertToast = (): React.JSX.Element | null => {
  const { alertState, hideAlert } = useAlert();

  // 表示していないなら何も描画しない
  if (!alertState.open || !alertState.code) return null;

  const alert = ALERT_MESSAGES[alertState.code];

  // safety net
  if (!alert) return null;

  const { type, message } = alert;

  return (
    <Snackbar
      open={alertState.open}
      autoHideDuration={5000}
      onClose={hideAlert}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
    >
      <Alert
        onClose={hideAlert}
        severity={type}
        variant="outlined"
        sx={{ width: "100%" }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};

export default AlertToast;
