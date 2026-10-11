import React from "react";
import { cn } from "@/lib/utils";

export const LOGO_URL =
  "https://media.base44.com/images/public/user_6abe6a390c98b374dea43dee/3754fb980_AirportAssistandAkwaabaServicesLogos.png";

// Brand mark: the official logo sits on a black plate (the asset has a black
// background) with the Ghanaian tri-colour bar beneath it.
export default function Logo({ className, showBar = true }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="bg-black flex items-center justify-center rounded-md overflow-hidden">
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