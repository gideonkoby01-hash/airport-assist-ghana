import React from "react";
import { Link } from "react-router-dom";
import { Home, Ticket, LogIn } from "lucide-react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuth } from "@/lib/AuthContext";
import { ThemeToggle } from "@/lib/theme";
import { CurrencyToggle } from "@/lib/currency";
import { LOGO_URL } from "@/components/Logo";
import BookingForm from "@/components/BookingForm";

// The booking page: one clear path from choosing a service to a confirmed booking, like booking a flight. No dashboard,
// no menus. Anyone can fill it in; signing in comes at the last step.
export default function Book() {
  useDocumentTitle("Book airport assistance");
  const { user, isAuthenticated } = useAuth();
  const role = user?.role === "user" ? "passenger" : user?.role;
  const staff = isAuthenticated && role && !["passenger", "admin"].includes(role);

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
            {isAuthenticated ? (
              <Link to={staff ? "/portal" : "/passenger?tab=bookings"} className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium hover:bg-secondary">
                <Ticket className="w-4 h-4" aria-hidden="true" /> {staff ? "Dashboard" : "My bookings"}
              </Link>
            ) : (
              <Link to="/login?returnTo=%2Fbook" className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium hover:bg-secondary">
                <LogIn className="w-4 h-4" aria-hidden="true" /> Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 pb-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Book airport assistance</h1>
          <p className="text-sm text-muted-foreground mt-1">Four quick steps. No account needed until the last one.</p>
        </div>
        {staff ? (
          <div className="bg-card rounded-2xl border border-border p-6 text-sm" role="status">
            <p className="font-semibold">This page is for passengers</p>
            <p className="text-muted-foreground mt-1">Staff record walk-in bookings from the dashboard.</p>
            <Link to="/portal" className="inline-block mt-3 text-primary font-medium hover:underline">Open the dashboard</Link>
          </div>
        ) : (
          <BookingForm channel="online" standalone />
        )}
      </main>
    </div>
  );
}
