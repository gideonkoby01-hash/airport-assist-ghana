import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import SupervisorPhoto from "./SupervisorPhoto";
import SupervisorContactRow, { telHref, waHref } from "./SupervisorContactRow";
import SupervisorLanguages from "./SupervisorLanguages";
import { Eye, Mail, MessageCircle, Phone } from "lucide-react";

/**
 * "View Profile" — opens the supervisor's full profile details
 * (photograph, contact details, languages and introduction).
 */
export default function SupervisorProfileDialog({ profile }) {
  const p = profile || {};

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Eye className="w-4 h-4 mr-1.5" />
          View Profile
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">Supervisor Profile</DialogTitle>
          <DialogDescription className="sr-only">
            Full profile details for the supervisor assigned to this booking.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-5">
          <SupervisorPhoto
            fileUri={p.photo_uri}
            name={p.full_name}
            className="w-24 h-24 sm:w-28 sm:h-28"
            expandable
          />

          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-foreground break-words">
              {p.full_name || "Airport Assist Supervisor"}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent mt-0.5">
              {p.title || "Airport Assist Supervisor"}
            </p>

            <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <SupervisorContactRow icon={Phone} label="Call" value={p.phone} href={telHref(p.phone)} />
              <SupervisorContactRow
                icon={MessageCircle}
                label="WhatsApp"
                value={p.whatsapp_number}
                href={waHref(p.whatsapp_number)}
                external
              />
              <SupervisorContactRow
                icon={Mail}
                label="Email"
                value={p.email}
                href={p.email ? `mailto:${p.email}` : null}
              />
              <SupervisorLanguages languages={p.languages} />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">About</p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
            {p.bio || "No introduction has been added yet."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}