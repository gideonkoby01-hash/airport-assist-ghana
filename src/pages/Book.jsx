import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ThemeToggle } from "@/lib/theme";
import { CurrencyToggle } from "@/lib/currency";
import { LOGO_URL } from "@/components/Logo";
import BookingForm from "@/components/BookingForm";

// The booking page: one clear path from choosing a service to a confirmed booking, like booking a flight. No dashboard,
// no menus, and no account: the booking is tied to the email address the passenger gives. The priority check-in desk is
// the page's background, faded so the form stays easy to read.
export default function Book() {
  useDocumentTitle("Book airport assistance");
  const [summary, setSummary] = useState({ service: "", flight: "", direction: "arrival", when: "", pax: 1, done: false });


  return (
    <div className="site relative isolate min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10" aria-hidden="true">
        <img src="/images/booking-bg.webp" alt="" width="1600" height="873" fetchPriority="high" className="hero-settle w-full h-full object-cover scale-105 blur-[2px]" style={{ objectPosition: "60% 40%" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/78 via-background/84 to-background/92" />
      </div>

      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="press inline-flex items-center gap-2 rounded-full bg-[#0b1d36] text-white px-3.5 py-2 text-sm font-semibold shadow-md hover:bg-[#0b1d36]/90" aria-label="Back to the home page">
            <Home className="w-4 h-4" aria-hidden="true" /> Home
          </Link>
          <Link to="/" aria-label="Airport Assist Ghana home" className="hidden sm:block rounded-lg bg-white/85 px-2 py-1 shadow-sm">
            <img src={LOGO_URL} alt="Airport Assist Ghana" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-1.5">
            <CurrencyToggle className="shadow-sm" />
            <ThemeToggle className="bg-[#0b1d36] text-white shadow-md hover:bg-[#0b1d36]/90" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-4 pb-10">
        {!summary.done && (
          <div className="mt-6 mb-7 text-center">
            <h1 className="sora text-[clamp(1.7rem,5vw,2.5rem)] font-extrabold uppercase tracking-[0.04em] leading-tight">Book airport assistance</h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">We will meet you at Kotoka. Your confirmation and updates are sent to your email.</p>
          </div>
        )}
        <div className={summary.done ? "mt-7" : ""}>
          <BookingForm channel="online" standalone onSummary={setSummary} />
        </div>
      </main>
    </div>
  );
}
