import { useEffect } from "react";
import { useSettings } from "@/lib/SettingsContext";
import { pageTitle } from "@/lib/pageTitle";

/** Sets the browser tab title for the current page, for example useDocumentTitle("Sign in"). */
export function useDocumentTitle(title) {
  const { settings } = useSettings();
  useEffect(() => {
    document.title = pageTitle(title, settings.company_name);
  }, [title, settings.company_name]);
}
