import { useCallback, useEffect, useState } from "react";
import { applyUpdate, installMode, pendingUpdate, platformOf, readDismissed, readStandalone, saveDismissed } from "@/lib/pwa";

/**
 * What the installed-app banners need: whether the phone is online, whether a newer version is waiting, and whether to offer
 * installing the app (with the browser's own install prompt where there is one, or the steps for an iPhone).
 */
export function useAppStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [updateReady, setUpdateReady] = useState(() => Boolean(pendingUpdate()));
  const [standalone] = useState(readStandalone);
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const ready = () => setUpdateReady(true);
    const beforeInstall = (e) => {
      e.preventDefault(); // keep the browser's own mini bar away; our banner offers it instead
      setPrompt(e);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("aag-update-ready", ready);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("aag-update-ready", ready);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  const mode = installed ? "installed" : installMode({ standalone, platform: platformOf(navigator.userAgent, navigator.maxTouchPoints), hasPrompt: Boolean(prompt) });

  const install = useCallback(async () => {
    if (!prompt) return;
    prompt.prompt();
    try {
      await prompt.userChoice;
    } finally {
      setPrompt(null);
    }
  }, [prompt]);

  const dismiss = useCallback(() => {
    saveDismissed();
    setDismissed(true);
  }, []);

  return { online, updateReady, update: applyUpdate, standalone, installMode: dismissed ? "none" : mode, install, dismiss };
}
