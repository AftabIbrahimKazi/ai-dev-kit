"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type ThemeName } from "./theme-config";

function getActiveTheme(): ThemeName {
  return document.documentElement.dataset.stTheme === "dark" ? "dark" : "light";
}

function setTheme(theme: ThemeName): void {
  document.documentElement.dataset.stTheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)" as const;

function onToggleClick(): void {
  const next: ThemeName = getActiveTheme() === "dark" ? "light" : "dark";
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches || typeof document.startViewTransition !== "function") {
    setTheme(next);
    return;
  }
  document.startViewTransition(() => setTheme(next));
}

export default function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Toggle light and dark theme"
      className="rk-theme-toggle rk-glass rk-link cursor-pointer rounded-[var(--radius-pill)]"
      onClick={onToggleClick}
      data-rk-sound-click-ts="theme"
    >
      <Sun className="rk-theme-icon rk-theme-sun" size={20} strokeWidth={2.25} />
      <Moon className="rk-theme-icon rk-theme-moon" size={20} strokeWidth={2.25} />
    </button>
  );
}
