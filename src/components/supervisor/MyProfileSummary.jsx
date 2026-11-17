import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, UserRound } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import SupervisorProfileCard from "./SupervisorProfileCard";

// A supervisor's own profile, as passengers see it, at the top of their desk. Shows a prompt to complete it when it is empty.
export default function MyProfileSummary({ user }) {
  const [entry, setEntry] = useState(undefined); // undefined while loading, null when there is none yet

  useEffect(() => {
    let live = true;
    api.entities.SupervisorDirectory.filter({ user_id: user.id })
      .then((page) => {
        const list = Array.isArray(page) ? page : page?.items || [];
        if (live) setEntry(list[0] || null);
      })
      .catch(() => live && setEntry(null));
    return () => {
      live = false;
    };
  }, [user.id]);

  if (entry === undefined) return null;

  const edit = (
    <Button variant="outline" size="sm" asChild>
      <Link to="/supervisor?tab=profile"><Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" /> Edit my profile</Link>
    </Button>
  );

  if (!entry) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-secondary grid place-items-center shrink-0"><UserRound className="w-6 h-6 text-muted-foreground" aria-hidden="true" /></div>
          <div>
            <p className="text-sm font-medium text-foreground">Your profile is not filled in yet.</p>
            <p className="text-xs text-muted-foreground mt-0.5">Passengers see your photo, name and contact details once you are assigned to their booking.</p>
          </div>
        </div>
        <Button asChild><Link to="/supervisor?tab=profile">Complete my profile</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SupervisorProfileCard profile={{ ...entry, full_name: entry.full_name || user.full_name }} heading="My profile" />
      <div className="flex justify-end">{edit}</div>
    </div>
  );
}
