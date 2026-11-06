import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { UserRound } from "lucide-react";

/**
 * Renders a supervisor's profile photograph.
 * The photo is stored privately, so the private file_uri is resolved to a
 * short-lived signed URL. Falls back to initials, then to an icon.
 */
export default function SupervisorPhoto({ fileUri, name = "", className = "w-24 h-24" }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    if (!fileUri) return undefined;
    base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri })
      .then((res) => {
        if (active) setUrl(res?.signed_url || null);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [fileUri]);

  const initials = (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={`${className} rounded-2xl overflow-hidden ring-2 ring-accent/40 bg-secondary flex items-center justify-center shrink-0`}
    >
      {fileUri && url && !failed ? (
        <img
          src={url}
          alt={name || "Supervisor"}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : initials ? (
        <span className="text-xl font-bold text-primary">{initials}</span>
      ) : (
        <UserRound className="w-8 h-8 text-muted-foreground" />
      )}
    </div>
  );
}