import { TIME_OPTIONS } from "./timeOptions";
import { getConstraints } from "./timeConstraints";

import { FormControl, Select, MenuItem, InputAdornment } from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

interface TimePickerProps {
  label: string;
  value: string;
  mode: "start" | "end";
  constraintValue: string;
  onChange: (value: string) => void;
}

const styles = {
  row: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "4px",
    marginBottom: "12px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#666",
  },
};

export default function TimePicker({
  label,
  value,
  mode,
  constraintValue,
  onChange,
}: TimePickerProps) {
  const { min, max } = getConstraints(constraintValue, mode);

  const options = TIME_OPTIONS.filter((time) => {
    if (min && time < min) return false;
    if (max && time > max) return false;
    return true;
  });

  return (
    <div className="flex-1">
      <div style={styles.label}>{label}</div>

      <FormControl fullWidth>
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          startAdornment={
            <InputAdornment position="start">
              <AccessTimeIcon fontSize="small" />
            </InputAdornment>
          }
          sx={{
            height: 52,
            borderRadius: "12px",
            backgroundColor: "#fff",
            "& .MuiSelect-select": {
              display: "flex",
              alignItems: "center",
              fontSize: "16px",
            },
          }}
        >
          {options.map((time) => (
            <MenuItem key={time} value={time}>
              {time}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </div>
  );
}
