import React from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ThemeToggle } from "@/lib/theme";
import { CurrencyToggle } from "@/lib/currency";
import { LOGO_URL } from "@/components/Logo";
import BookingForm from "@/components/BookingForm";

// The booking page: one clear path from choosing a service to a confirmed booking, like booking a flight. No dashboard,
// no menus, and no account: the booking is tied to the email address the passenger gives.
export default function Book() {
  useDocumentTitle("Book airport assistance");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold hover:border-accent" aria-label="Back to the home page">
            <Home className="w-4 h-4" aria-hidden="true" /> Home
          </Link>
          <Link to="/" aria-label="Airport Assist Ghana home" className="hidden sm:block">
            <img src={LOGO_URL} alt="Airport Assist Ghana" className="h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-1.5">
            <CurrencyToggle />
            <ThemeToggle className="border border-border bg-card" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 pb-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Book airport assistance</h1>
          <p className="text-sm text-muted-foreground mt-1">Your confirmation and updates are sent to your email.</p>
        </div>
        <BookingForm channel="online" standalone />
      </main>
    </div>
  );
}
