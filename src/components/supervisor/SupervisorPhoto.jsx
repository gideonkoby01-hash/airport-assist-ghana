import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import useSignedFileUrl from "./useSignedFileUrl";
import { Maximize2, UserRound } from "lucide-react";

/**
 * Renders a supervisor's profile photograph.
 * The photo is stored privately, so the file_uri is resolved to a short-lived
 * signed URL. Falls back to initials, then to an icon.
 * When `expandable` is set and a photo exists, clicking opens the full image.
 */
export default function SupervisorPhoto({ fileUri, name = "", className = "w-24 h-24", expandable = false }) {
  const [open, setOpen] = useState(false);
  const { url, hasPhoto } = useSignedFileUrl(fileUri);

  const initials = (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  const base = `${className} rounded-2xl overflow-hidden ring-2 ring-accent/40 bg-secondary flex items-center justify-center shrink-0`;

  const content = hasPhoto ? (
    <img src={url} alt={name || "Supervisor"} className="w-full h-full object-cover" />
  ) : initials ? (
    <span className="text-xl font-bold text-primary">{initials}</span>
  ) : (
    <UserRound className="w-8 h-8 text-muted-foreground" />
  );

  if (!expandable || !hasPhoto) {
    return <div className={base}>{content}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View full photo of ${name || "the supervisor"}`}
        title="Click to view the full photograph"
        className={`${base} group relative cursor-zoom-in focus:outline-none focus-visible:ring-4`}
      >
        {content}
        <span className="absolute inset-0 flex items-end justify-end p-1.5 bg-black/0 group-hover:bg-black/25 transition-colors">
          <span className="rounded-md bg-black/60 p-1">
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          </span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-3 sm:p-4">
          <DialogTitle className="sr-only">{name || "Supervisor"} profile photograph</DialogTitle>
          <img
            src={url}
            alt={name || "Supervisor"}
            className="w-full max-h-[75vh] object-contain rounded-lg bg-black"
          />
          {name && <p className="text-center text-sm font-medium text-foreground">{name}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}