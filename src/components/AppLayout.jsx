import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import {
  Armchair, Banknote, BarChart3, Bell, Contact, CalendarPlus, ClipboardList, FileText, LayoutDashboard, LogOut,
  Luggage, Mail, Menu, MoreHorizontal, Package, Percent, Settings, Star, Ticket, UserCheck,
  UserCircle, Users, X, Zap,
} from "lucide-react";
import Logo from "@/components/Logo";
import UserMenu from "@/components/UserMenu";
import { roleLabel } from "@/lib/packages";
import { initials } from "@/lib/profile";
import { cn } from "@/lib/utils";

// Grouped so a long list (admin has a dozen areas) reads as a few sections. `tab: null` is the dashboard's first screen.
// `primary` items sit in the phone's bottom bar; everything else is under "More".
const NAV = {
  passenger: [
    { items: [
      { label: "Overview", to: "/passenger", tab: null, icon: LayoutDashboard, primary: true },
      { label: "Book a service", to: "/passenger", tab: "book", icon: CalendarPlus, primary: true },
      { label: "My bookings", to: "/passenger", tab: "bookings", icon: Ticket, primary: true },
      { label: "Notifications", to: "/passenger", tab: "notifications", icon: Bell, primary: true },
    ] },
  ],
  supervisor: [
    { heading: "Today", items: [
      { label: "Assigned bookings", to: "/supervisor", tab: null, icon: ClipboardList, primary: true },
      { label: "Notifications", to: "/supervisor", tab: "notifications", icon: Bell, primary: true },
    ] },
    { heading: "At the desk", items: [
      { label: "Sales", to: "/supervisor", tab: "quick", icon: Zap, primary: true },
      { label: "Shift report", to: "/supervisor", tab: "report", icon: FileText },
    ] },
    { heading: "You", items: [
      { label: "Public profile", to: "/supervisor", tab: "profile", icon: UserCircle },
    ] },
  ],
  management: [
    { heading: "Operations", items: [
      { label: "Summary", to: "/management", tab: null, icon: LayoutDashboard, primary: true },
      { label: "All bookings", to: "/management", tab: "bookings", icon: ClipboardList, primary: true },
      { label: "Customers", to: "/management", tab: "customers", icon: Contact },
      { label: "Notifications", to: "/management", tab: "notifications", icon: Bell, primary: true },
    ] },
    { heading: "Team and quality", items: [
      { label: "Supervisors", to: "/management", tab: "supervisors", icon: UserCheck },
      { label: "Porter pay", to: "/management", tab: "porter-pay", icon: Banknote },
      { label: "Ratings & reviews", to: "/management", tab: "ratings", icon: Star },
    ] },
    { heading: "Reports", items: [
      { label: "Shift reports", to: "/management", tab: "reports", icon: FileText, primary: true },
    ] },
  ],
  admin: [
    { heading: "Overview", items: [
      { label: "Summary", to: "/admin", tab: null, icon: LayoutDashboard, primary: true },
      { label: "Notifications", to: "/admin", tab: "notifications", icon: Bell, primary: true },
    ] },
    { heading: "People", items: [
      { label: "Customers", to: "/admin", tab: "customers", icon: Contact },
      { label: "Staff accounts", to: "/admin", tab: "staff", icon: Users, primary: true },
      { label: "Supervisors", to: "/admin", tab: "supervisors", icon: UserCheck },
      { label: "Porters", to: "/admin", tab: "porters", icon: Luggage },
      { label: "Porter pay", to: "/admin", tab: "porter-pay", icon: Banknote },
    ] },
    { heading: "What we sell", items: [
      { label: "Service packages", to: "/admin", tab: "packages", icon: Package },
      { label: "Lounges", to: "/admin", tab: "lounges", icon: Armchair },
      { label: "Discounts", to: "/admin", tab: "discounts", icon: Percent },
    ] },
    { heading: "Reports", items: [
      { label: "Shift reports", to: "/admin", tab: "reports", icon: BarChart3 },
      { label: "Ratings & reviews", to: "/admin", tab: "ratings", icon: Star },
    ] },
    { heading: "System", items: [
      { label: "Email", to: "/admin", tab: "email", icon: Mail },
      { label: "Settings", to: "/admin", tab: "settings", icon: Settings, primary: true },
    ] },
  ],
};

const CONSOLE_NAME = { passenger: "My account", supervisor: "Supervisor desk", management: "Management", admin: "Admin console" };

// Pages outside the role navigation still get a proper title in the top bar.
const OTHER_TITLES = { "/profile": "My profile", "/security": "Account security" };

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const role = user?.role === "user" ? "passenger" : user?.role || "passenger";
  const groups = NAV[role] || NAV.passenger;
  const flat = groups.flatMap((g) => g.items);
  const currentTab = new URLSearchParams(location.search).get("tab");
  const home = flat[0]?.to || "/";

  const isActive = (item) =>
    item.tab === null ? location.pathname === item.to && !currentTab : location.pathname === item.to && currentTab === item.tab;
  const active = flat.find(isActive);
  const pageTitle = active?.label || OTHER_TITLES[location.pathname] || (location.pathname.startsWith("/bookings/") ? "Booking" : CONSOLE_NAME[role]);
  const bellTarget = `${home}?tab=notifications`;

  // The bell's count: when the screen changes and once a minute.
  useEffect(() => {
    if (!user?.id) return undefined;
    let live = true;
    const load = () => api.entities.Notification.count({ user_id: user.id, read: false }).then((n) => live && setUnread(n)).catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user?.id, location.pathname, location.search]);

  const signOut = async () => {
    // Wait for sign-out to finish so the session is really gone before leaving the page.
    await logout(false);
    window.location.href = "/login";
  };

  const close = () => setDrawerOpen(false);

  const NavLink = ({ item }) => {
    const on = isActive(item);
    const Icon = item.icon;
    const showCount = item.label === "Notifications" && unread > 0;
    return (
      <Link
        to={item.tab ? `${item.to}?tab=${item.tab}` : item.to}
        onClick={close}
        aria-current={on ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.9rem] font-medium transition-colors",
          on ? "bg-white/10 text-white" : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
        )}
      >
        {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" aria-hidden="true" />}
        <Icon className={cn("w-[18px] h-[18px] shrink-0", on ? "text-accent" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} aria-hidden="true" />
        <span className="flex-1 truncate">{item.label}</span>
        {showCount && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[11px] font-bold flex items-center justify-center">{unread > 99 ? "99+" : unread}</span>
        )}
      </Link>
    );
  };

  const Sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4">
        <Logo />
      </div>
      <nav className="flex-1 px-3 overflow-y-auto pb-4" aria-label="Main">
        {groups.map((group, gi) => (
          <div key={group.heading || gi} className={gi ? "mt-5" : ""}>
            {group.heading && <p className="px-3 mb-1.5 text-xs font-medium text-sidebar-foreground/50">{group.heading}</p>}
            <div className="space-y-0.5">
              {group.items.map((item) => <NavLink key={item.label} item={item} />)}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="w-9 h-9 shrink-0 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold" aria-hidden="true">
            {initials(user?.full_name, user?.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.email}</p>
            <p className="text-xs text-sidebar-foreground/60">{roleLabel(role)}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="p-2 rounded-lg text-sidebar-foreground/70 hover:text-white hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  const bottomItems = flat.filter((i) => i.primary).slice(0, 4);
  const hasMore = flat.length > bottomItems.length;

  return (
    <div className="app-shell min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-sidebar flex-col z-30">{Sidebar}</aside>

      {/* Phone drawer: every area, plus account links */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-sidebar shadow-xl">
            <button onClick={close} className="absolute top-3 right-3 text-white p-1" aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
            {Sidebar}
          </aside>
        </div>
      )}

      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Top bar: where you are, notifications, account */}
        <header className="sticky top-0 z-20 bg-[hsl(var(--canvas))]/85 backdrop-blur border-b border-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center gap-3">
            <button onClick={() => setDrawerOpen(true)} className="lg:hidden -ml-2 p-2 text-foreground" aria-label="Open menu">
              <Menu className="w-6 h-6" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground leading-none hidden sm:block">{CONSOLE_NAME[role]}</p>
              <h1 className="text-lg font-semibold tracking-tight text-foreground truncate sm:mt-1">{pageTitle}</h1>
            </div>
            <Link
              to={bellTarget}
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative p-2.5 rounded-full text-foreground hover:bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-[hsl(var(--canvas))]" aria-hidden="true" />}
            </Link>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8 pb-28 lg:pb-10">{children}</div>
        </main>
      </div>

      {/* Phone bottom bar: the four things used most, then everything else */}
      <nav aria-label="Quick links" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {bottomItems.map((item) => {
            const on = isActive(item);
            const Icon = item.icon;
            return (
              <li key={item.label} className="flex-1">
                <Link
                  to={item.tab ? `${item.to}?tab=${item.tab}` : item.to}
                  aria-current={on ? "page" : undefined}
                  className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", on ? "text-foreground" : "text-muted-foreground")}
                >
                  <span className={cn("relative px-4 py-1 rounded-full", on && "bg-accent/20")}>
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    {item.label === "Notifications" && unread > 0 && <span className="absolute top-0 right-2 w-2 h-2 rounded-full bg-accent" aria-hidden="true" />}
                  </span>
                  <span className="truncate max-w-full px-1">{item.label.replace("Assigned bookings", "Assigned").replace("Book a service", "Book").replace("Staff accounts", "Staff").replace("All bookings", "Bookings")}</span>
                </Link>
              </li>
            );
          })}
          {hasMore && (
            <li className="flex-1">
              <button type="button" onClick={() => setDrawerOpen(true)} className="w-full flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
                <span className="px-4 py-1"><MoreHorizontal className="w-5 h-5" aria-hidden="true" /></span>
                More
              </button>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
