// Shared theme tokens for RiverRunner
export const COLORS = {
  background: "#F5F5F3",
  surface: "#FFFFFF",
  primary: "#0077B6",
  primaryDark: "#03045E",
  textMain: "#0A1128",
  textMuted: "#5C6B73",
  border: "#E0E1DD",
  safe: "#2A9D8F",
  warning: "#F4A261",
  danger: "#D62828",
  info: "#457B9D",
  low: "#9CA3AF",
};

export const STATUS_COLORS: Record<string, string> = {
  safe: COLORS.safe,
  warning: COLORS.warning,
  danger: COLORS.danger,
  low: COLORS.low,
  unknown: COLORS.textMuted,
  info: COLORS.info,
};

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;
