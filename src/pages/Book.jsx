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

      {/* A solid bar, so the page scrolls cleanly underneath it instead of showing through the buttons. */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-3">
          <Link to="/" aria-label="Airport Assist Ghana home" className="shrink-0">
            <img src={LOGO_URL} alt="Airport Assist Ghana" width="160" height="56" className="h-11 sm:h-14 w-auto rounded-md" />
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <CurrencyToggle />
            <ThemeToggle className="border border-border bg-card text-foreground hover:bg-secondary" />
            <Link to="/" className="press inline-flex items-center gap-2 rounded-full bg-[#0b1d36] text-white px-3 sm:px-3.5 py-2 text-sm font-semibold hover:bg-[#0b1d36]/90" aria-label="Back to the home page">
              <Home className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Home</span>
            </Link>
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
