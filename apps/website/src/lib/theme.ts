import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "pi-web-theme";
const LIGHT_BG = "#f6f6f8";
const DARK_BG = "#0b0e14";

const mq = window.matchMedia("(prefers-color-scheme: light)");

function resolve(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (mq.matches ? "light" : "dark") : mode;
}

export function getThemeMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function applyTheme(mode: ThemeMode): void {
  const resolved = resolve(mode);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? LIGHT_BG : DARK_BG);
}

/** Theme mode state, persisted; follows the OS when mode is "system". */
export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);

  useEffect(() => {
    applyTheme(mode);
    if (mode !== "system") return;
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setTheme = (m: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    setMode(m);
  };

  return [mode, setTheme];
}
