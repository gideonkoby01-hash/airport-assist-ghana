import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/db";

/**
 * The roles an admin can give (admin only). `ready` is false until the roles update has been applied to the database, so the
 * screens that use this can show the older Management and Accounts choices meanwhile.
 */
export function useStaffRoles() {
  const [state, setState] = useState({ roles: [], ready: false, loading: true, error: "" });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return api.roles.list()
      .then((roles) => setState({ roles, ready: true, loading: false, error: "" }))
      .catch((e) => setState({ roles: [], ready: false, loading: false, error: e.message || "" }));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
}
