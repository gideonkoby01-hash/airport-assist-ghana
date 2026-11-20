import { useAuth } from "@/lib/AuthContext";

// Resolves public homepage CTAs to the right route based on auth state.
// Book Now opens the existing passenger booking flow (sign-in gate for guests);
// Sign In opens login, or the role dashboard for already-authenticated users.
export function useHomeCta() {
  const { isAuthenticated } = useAuth();
  /** Where "book" goes: straight to the booking page. Signing in comes at the last step, not before. */
  const bookingLink = (address) => address;
  const bookDest = bookingLink("/book");
  const signInDest = isAuthenticated ? "/portal" : "/login";
  return { bookDest, bookingLink, signInDest, isAuthenticated };
}
