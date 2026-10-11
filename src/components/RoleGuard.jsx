import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

// Wraps a dashboard page and ensures the signed-in user has one of the allowed
// roles. RLS is the real enforcement; this guard keeps the UX honest.
export default function RoleGuard({ allowedRoles, children }) {
  const { user } = useAuth();
  const role = user?.role === "user" ? "passenger" : user?.role || "passenger";
  if (role === "pending") return <Navigate to="/pending" replace />;
  if (!allowedRoles.includes(role)) {
    const home =
      role === "admin" ? "/admin" : role === "management" ? "/management" : role === "supervisor" ? "/supervisor" : "/passenger";
    return <Navigate to={home} replace />;
  }
  return children;
}