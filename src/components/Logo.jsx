import React from "react";
import { cn } from "@/lib/utils";

export const LOGO_URL =
  "https://media.base44.com/images/public/6acb9a25b7704929e1c4bf0b/c0f9204fa_AirportAssistAkwaabaServicesLogo.png";

// Brand mark: the official Airport Assist - Akwaaba Services logo.
export default function Logo({ className = undefined, showBar = true }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-center rounded-md overflow-hidden">
        <img
          src={LOGO_URL}
          alt="Airport Assist Ghana - Akwaaba Services"
          className="w-full h-auto object-contain"
          style={{ maxHeight: 64 }}
        />
      </div>
      {showBar && <div className="tricolor-bar h-1 w-full rounded-full mt-1" />}
    </div>
  );
}