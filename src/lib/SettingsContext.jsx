import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api/db";
import { PUBLIC_DEFAULTS } from "@/lib/publicSettings";

// The settings the public website uses (business name and contact details, whether online booking is open, porter commission).
// Until they load, or if they cannot be loaded, the built-in defaults are shown so the page never looks broken.
const SettingsContext = createContext({ settings: PUBLIC_DEFAULTS, loaded: false, refresh: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(PUBLIC_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const saved = await api.settings.getPublic();
      setSettings({ ...PUBLIC_DEFAULTS, ...saved });
    } catch {
      setSettings(PUBLIC_DEFAULTS);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ settings, loaded, refresh }), [settings, loaded, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

/** Splits "39 Ring Road East, Nyaniba [GL-030-6750]" into the street and the digital address. */
export function addressLines(address) {
  const m = /^(.*?)\s*\[(.*)\]\s*$/.exec(address || "");
  return m ? [m[1], m[2]] : [address || ""];
}

/** "+233 537 755 063 / +233 246 222 777" into separate numbers. */
export function phoneNumbers(text) {
  return String(text || "").split("/").map((p) => p.trim()).filter(Boolean);
}
