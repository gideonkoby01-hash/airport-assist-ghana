import React from "react";
import { useSearchParams } from "react-router-dom";
import { Settings2, ShieldCheck } from "lucide-react";
import AdminSettings from "@/components/AdminSettings";
import RolesManager from "@/components/RolesManager";

const SECTIONS = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "roles", label: "Roles and tasks", icon: ShieldCheck },
];

// Admin > Settings: the system settings, and the roles and the tasks each role may perform.
export default function SettingsPage({ initial = "general" }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section") || initial;
  const section = SECTIONS.some((s) => s.key === requested) ? requested : "general";
  const go = (key) => {
    const next = new URLSearchParams(params);
    next.set("tab", "settings");
    if (key === "general") next.delete("section");
    else next.set("section", key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Settings sections" className="inline-flex rounded-full border border-border bg-card p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            onClick={() => go(s.key)}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${section === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <s.icon className="w-4 h-4" aria-hidden="true" /> {s.label}
          </button>
        ))}
      </div>
      {section === "roles" ? <RolesManager /> : <AdminSettings />}
    </div>
  );
}
