import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import SupervisorProfileCard from "./SupervisorProfileCard";
import SupervisorProfileForm from "./SupervisorProfileForm";
import { Pencil } from "lucide-react";

/**
 * Profile viewer used in the Admin Console and Management area.
 * Admins may switch into editing; everyone else sees the profile read-only.
 */
export default function SupervisorProfilePanel({ record, isAdmin = false, onUpdated }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SupervisorProfileForm
        record={record}
        isAdmin
        onSaved={(saved) => {
          setEditing(false);
          if (onUpdated) onUpdated(saved);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <SupervisorProfileCard profile={record} heading="Supervisor Profile" />
      {isAdmin && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4 mr-1" /> Edit profile
          </Button>
        </div>
      )}
    </div>
  );
}