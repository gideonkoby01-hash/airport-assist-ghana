import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, X, ChevronRight, ShieldCheck, UserRound } from "lucide-react";
import UserMenu from "@/components/UserMenu";
import Logo from "@/components/Logo";
import { roleLabel } from "@/lib/packages";
import { cn } from "@/lib/utils";

// Grouped so a long list (admin has a dozen areas) reads as a few sections. `tab: null` is the dashboard's first screen.
const NAV = {
  passenger: [
    { items: [
      { label: "Overview", to: "/passenger", tab: null },
      { label: "Book a Service", to: "/passenger", tab: "book" },
      { label: "My Bookings", to: "/passenger", tab: "bookings" },
      { label: "Notifications", to: "/passenger", tab: "notifications" },
    ] },
  ],
  supervisor: [
    { heading: "Today", items: [
      { label: "Assigned Bookings", to: "/supervisor", tab: null },
      { label: "Notifications", to: "/supervisor", tab: "notifications" },
    ] },
    { heading: "At the desk", items: [
      { label: "Quick Sale", to: "/supervisor", tab: "quick" },
      { label: "Walk-in Booking", to: "/supervisor", tab: "walkin" },
      { label: "Shift Report", to: "/supervisor", tab: "report" },
    ] },
    { heading: "You", items: [
      { label: "Photo & contact for passengers", to: "/supervisor", tab: "profile" },
    ] },
  ],
  management: [
    { heading: "Operations", items: [
      { label: "Summary", to: "/management", tab: null },
      { label: "All Bookings", to: "/management", tab: "bookings" },
      { label: "Notifications", to: "/management", tab: "notifications" },
    ] },
    { heading: "Team and quality", items: [
      { label: "Supervisors", to: "/management", tab: "supervisors" },
      { label: "Ratings & Reviews", to: "/management", tab: "ratings" },
    ] },
    { heading: "Reports", items: [
      { label: "Shift Reports", to: "/management", tab: "reports" },
    ] },
  ],
  admin: [
    { heading: "Overview", items: [
      { label: "Summary", to: "/admin", tab: null },
      { label: "Notifications", to: "/admin", tab: "notifications" },
    ] },
    { heading: "People", items: [
      { label: "Staff Accounts", to: "/admin", tab: "staff" },
      { label: "Staff Requests", to: "/admin", tab: "requests" },
      { label: "Supervisors", to: "/admin", tab: "supervisors" },
      { label: "Porters", to: "/admin", tab: "porters" },
    ] },
    { heading: "What we sell", items: [
      { label: "Service Packages", to: "/admin", tab: "packages" },
      { label: "Lounges", to: "/admin", tab: "lounges" },
      { label: "Discounts", to: "/admin", tab: "discounts" },
    ] },
    { heading: "Reports", items: [
      { label: "Shift Reports", to: "/admin", tab: "reports" },
      { label: "Ratings & Reviews", to: "/admin", tab: "ratings" },
    ] },
    { heading: "System", items: [
      { label: "Email", to: "/admin", tab: "email" },
      { label: "Settings", to: "/admin", tab: "settings" },
    ] },
  ],
};

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role === "user" ? "passenger" : user?.role || "passenger";
  const groups = NAV[role] || NAV.passenger;
  const currentTab = new URLSearchParams(location.search).get("tab");

  const handleLogout = async () => {
    // Wait for sign-out to finish so the session is really gone before leaving the page.
    await logout(false);
    navigate("/login", { replace: true });
    window.location.href = "/login";
  };

  const isActive = (item) => {
    if (item.tab === null) return location.pathname === item.to && !currentTab;
    return location.pathname === item.to && currentTab === item.tab;
  };

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3">
        <Logo />
      </div>
      <nav className="flex-1 px-3 overflow-y-auto" aria-label="Main">
        {groups.map((group, gi) => (
          <div key={group.heading || gi} className={gi ? "mt-4" : ""}>
            {group.heading && (
              <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">{group.heading}</p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const target = item.tab ? `${item.to}?tab=${item.tab}` : item.to;
                return (
                  <Link
                    key={item.label}
                    to={target}
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActive(item) ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive(item)
                        ? "bg-accent text-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    {item.label}
                    {isActive(item) && <ChevronRight className="w-4 h-4" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="px-2 mb-2">
          <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.email}</p>
          <p className="text-xs text-sidebar-foreground/70">{roleLabel(role)}</p>
        </div>
        <Link
          to="/profile"
          onClick={() => setMobileOpen(false)}
          aria-current={location.pathname === "/profile" ? "page" : undefined}
          className={cn(
            "flex items-center rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent",
            location.pathname === "/profile" && "bg-sidebar-accent text-white"
          )}
        >
          <UserRound className="w-4 h-4 mr-2" aria-hidden="true" />
          My profile
        </Link>
        <Link
          to="/security"
          onClick={() => setMobileOpen(false)}
          aria-current={location.pathname === "/security" ? "page" : undefined}
          className={cn(
            "flex items-center rounded-lg px-3 py-2 mb-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent",
            location.pathname === "/security" && "bg-sidebar-accent text-white"
          )}
        >
          <ShieldCheck className="w-4 h-4 mr-2" aria-hidden="true" />
          Account security
        </Link>
        <Button
          variant="outline"
          className="w-full bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/40">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-sidebar flex-col z-30">
        {SidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-sidebar px-4 py-3 flex items-center justify-between">
        <div className="w-40">
          <Logo showBar={false} />
        </div>
        <div className="flex items-center gap-1">
          <UserMenu dark />
          <button onClick={() => setMobileOpen(true)} className="text-white p-2" aria-label="Open menu">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-white p-1"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      <main className="lg:ml-64 min-h-screen">
        <div className="hidden lg:flex sticky top-0 z-20 justify-end items-center px-10 py-3 bg-secondary/80 backdrop-blur border-b border-border">
          <UserMenu />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">{children}</div>
      </main>
    </div>
  );
}