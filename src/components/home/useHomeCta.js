import { useAuth } from "@/lib/AuthContext";

// Resolves public homepage CTAs to the right route based on auth state.
// Book Now opens the existing passenger booking flow (sign-in gate for guests);
// Sign In opens login, or the role dashboard for already-authenticated users.
export function useHomeCta() {
  const { isAuthenticated } = useAuth();
  /** Where "book" goes for a given booking address; guests sign in first and are then sent on to it. */
  const bookingLink = (address) => (isAuthenticated ? address : `/login?returnTo=${encodeURIComponent(address)}`);
  const bookDest = bookingLink("/passenger?tab=book");
  const signInDest = isAuthenticated ? "/portal" : "/login";
  return { bookDest, bookingLink, signInDest, isAuthenticated };
}
