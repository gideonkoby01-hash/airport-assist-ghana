import React from "react";

const WIDTH = 17;
const pad = (text) => (String(text || "").toUpperCase() + " ".repeat(WIDTH)).slice(0, WIDTH);

/**
 * A departure board that shows the booking as it is filled in. Only the letters that change flip, so the board
 * answers each choice; on arrival every letter flips once, left to right.
 */
export default function FlapBoard({ rows, className = "" }) {
  return (
    <div className={`rounded-xl bg-[#0b1d36] p-3 sm:p-4 shadow-[0_24px_50px_-24px_rgb(5_15_35/0.9)] ring-1 ring-white/10 ${className}`}>
      <p className="sr-only" aria-live="polite">{rows.filter(Boolean).join(". ")}</p>
      <div aria-hidden="true" className="space-y-1.5">
        {rows.map((row, r) => (
          <div key={r} className="flap-row">
            {[...pad(row)].map((ch, i) => (
              <span key={`${i}-${ch}`} className="flap" style={/** @type {any} */ ({ "--i": i + r * 3 })}>{ch === " " ? " " : ch}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
