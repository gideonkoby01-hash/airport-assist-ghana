import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "aag-theme";
const ThemeContext = createContext({ theme: "light", toggle: () => {} });

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // storage unavailable: follow the device
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

// Day and night mode. A saved choice wins; otherwise the device setting decides. public/theme-init.js applies
// the same rule before the first paint.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(read);
  useEffect(() => apply(theme), [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // choice lasts for this visit only
      }
      return next;
    });
  }, []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// A sun or moon button. `label` adds the words next to the icon (used in menus).
export function ThemeToggle({ className = "", label = false }) {
  const { theme, toggle } = useTheme();
  const toNight = theme !== "dark";
  const text = toNight ? "Night mode" : "Day mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${text.toLowerCase()}`}
      title={text}
      className={`inline-flex items-center gap-2 rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {toNight ? <Moon className="w-[18px] h-[18px]" aria-hidden="true" /> : <Sun className="w-[18px] h-[18px]" aria-hidden="true" />}
      {label && <span className="text-sm font-medium">{text}</span>}
    </button>
  );
}
