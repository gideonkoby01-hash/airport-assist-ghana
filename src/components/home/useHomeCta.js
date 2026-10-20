import { useAuth } from "@/lib/AuthContext";

// Resolves public homepage CTAs to the right route based on auth state.
// Book Now opens the existing passenger booking flow (sign-in gate for guests);
// Sign In opens login, or the role dashboard for already-authenticated users.
export function useHomeCta() {
  const { isAuthenticated } = useAuth();
  const bookDest = isAuthenticated
    ? "/passenger?tab=book"
    : `/login?returnTo=${encodeURIComponent("/passenger?tab=book")}`;
  const signInDest = isAuthenticated ? "/portal" : "/login";
  return { bookDest, signInDest, isAuthenticated };
}