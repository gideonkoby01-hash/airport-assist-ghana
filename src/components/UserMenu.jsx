import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { roleLabel } from "@/lib/packages";
import { initials } from "@/lib/profile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useTheme } from "@/lib/theme";

// The person's name and role, always in the top corner: My profile, Account security and Sign out.
export default function UserMenu({ dark = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const role = user?.role === "user" ? "passenger" : user?.role || "passenger";

  const signOut = async () => {
    // Wait for sign-out to finish so the session is really gone before leaving the page.
    await logout(false);
    navigate("/login", { replace: true });
    window.location.href = "/login";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          dark ? "text-white hover:bg-white/10" : "text-foreground hover:bg-secondary"
        }`}
      >
        <span className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold" aria-hidden="true">
          {initials(user?.full_name, user?.email)}
        </span>
        <span className="hidden sm:block max-w-[10rem] truncate">{user?.full_name || user?.email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium truncate">{user?.full_name || "Your account"}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{roleLabel(role)}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile"><UserRound className="w-4 h-4 mr-2" aria-hidden="true" /> My profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/security"><ShieldCheck className="w-4 h-4 mr-2" aria-hidden="true" /> Account security</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
          {theme === "dark" ? <Sun className="w-4 h-4 mr-2" aria-hidden="true" /> : <Moon className="w-4 h-4 mr-2" aria-hidden="true" />}
          {theme === "dark" ? "Day mode" : "Night mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="w-4 h-4 mr-2" aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
