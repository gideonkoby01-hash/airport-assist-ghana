import React from "react";
import { ThemeToggle } from "@/lib/theme";

// The stage every account screen sits on (sign in, forgot and reset password, choose a password, two-step verification): a deep navy
// airport scene with the check-in photo faded into the background as a watermark, a large turning compass watermark, drifting gold and
// violet light, a plane flying across, and a frosted card that rises into place. On wide screens the business name sits beside the card.
// All motion stops for people who prefer reduced motion (see index.css).
export default function AuthLayout({ title, subtitle = undefined, footer = undefined, children = undefined }) {
  return (
    <main className="site auth-stage relative isolate min-h-screen overflow-hidden flex items-center justify-center px-4 py-10">
      {/* the picture, faded into a watermark */}
      <img src="/images/booking-bg.webp" alt="" width="1600" height="873" decoding="async" fetchPriority="low" className="auth-photo absolute inset-0 -z-30 h-full w-full object-cover" />
      <div className="auth-grid absolute inset-0 -z-20" aria-hidden="true" />
      <div className="auth-orb auth-orb-a absolute -left-24 -top-24 -z-20 h-[26rem] w-[26rem] bg-[#d4af37]/25" aria-hidden="true" />
      <div className="auth-orb auth-orb-b absolute -bottom-32 -right-24 -z-20 h-[30rem] w-[30rem] bg-[#7c3aed]/25" aria-hidden="true" />

      {/* a large compass watermark that turns very slowly */}
      <svg className="auth-rings pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[150vmin] w-[150vmin] -translate-x-1/2 -translate-y-1/2 text-white/[0.07]" viewBox="0 0 400 400" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="200" cy="200" r="190" strokeWidth="1" />
        <circle cx="200" cy="200" r="150" strokeWidth="1" strokeDasharray="2 7" />
        <circle cx="200" cy="200" r="110" strokeWidth="1" />
        <path d="M200 20 L212 188 L380 200 L212 212 L200 380 L188 212 L20 200 L188 188 Z" strokeWidth="1.2" />
        <path d="M72 72 L196 196 M328 72 L204 196 M72 328 L196 204 M328 328 L204 204" strokeWidth="0.8" />
      </svg>

      {/* a plane crossing the top of the screen */}
      <svg className="pointer-events-none absolute left-0 top-0 -z-10 h-64 w-full text-[#d4af37]" viewBox="0 0 1440 260" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path d="M -40 150 C 220 10, 520 230, 820 60 S 1240 20, 1500 120" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="3 9" />
      </svg>
      <svg className="auth-plane pointer-events-none absolute left-0 top-0 -z-10 h-6 w-6 text-[#f6c73a]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" transform="rotate(90 12 12)" />
      </svg>
      <div className="auth-vignette absolute inset-0 -z-10" aria-hidden="true" />

      <ThemeToggle className="absolute right-4 top-4 z-10 text-white/80 hover:bg-white/10 hover:text-white" />

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_minmax(0,26rem)]">
        {/* the welcome, beside the card on wide screens */}
        <div className="auth-head hidden lg:block">
          <h2 className="text-5xl font-extrabold leading-[1.05] tracking-tight">Airport Assist<br />Ghana</h2>
        </div>

        <div className="w-full">
          <div className="auth-head mb-7 text-center lg:text-left">
            <h1 className="block text-3xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-white/70">{subtitle}</p>}
          </div>
          <div className="auth-card rounded-3xl p-7 sm:p-8">
            <div className="auth-stagger space-y-4">{children}</div>
          </div>
          {footer && <p className="mt-6 text-center text-sm text-white/70 [&_a]:text-[#f6c73a] [&_a]:font-medium [&_a:hover]:underline lg:text-left">{footer}</p>}
        </div>
      </div>
    </main>
  );
}
