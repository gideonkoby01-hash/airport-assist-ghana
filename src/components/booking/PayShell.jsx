import React from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { LOGO_URL } from "@/components/Logo";

// The plain page the payment screens sit in: the logo, a way home, and one narrow column.
export default function PayShell({ children }) {
  return (
    <div className="site min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" aria-label="Airport Assist Ghana home" className="shrink-0">
            <img src={LOGO_URL} alt="Airport Assist Ghana" width="160" height="56" className="h-11 w-auto rounded-md" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle className="border border-border bg-card text-foreground hover:bg-secondary" />
            <Link to="/" className="press inline-flex items-center gap-2 rounded-full bg-[#0b1d36] text-white px-3.5 py-2 text-sm font-semibold hover:bg-[#0b1d36]/90" aria-label="Back to the home page">
              <Home className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Home</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8 space-y-5">{children}</main>
    </div>
  );
}
