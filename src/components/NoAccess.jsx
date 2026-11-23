import React from "react";
import { LockKeyhole } from "lucide-react";

/** Shown where a person's role does not include the task, for example when they open an old link. */
export default function NoAccess({ what = "this part" }) {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-secondary text-muted-foreground"><LockKeyhole className="w-5 h-5" aria-hidden="true" /></span>
      <h2 className="mt-4 text-lg font-semibold text-foreground">Your role does not include {what}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">If you need it, ask an admin to add it to your role.</p>
    </div>
  );
}
