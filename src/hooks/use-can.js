import { useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { can } from "@/lib/permissions";

/** `const can = useCan(); can("customers.manage")`: may the signed-in person do this task? The database still checks every action. */
export function useCan() {
  const { user } = useAuth();
  return useCallback((key) => can(user, key), [user]);
}
