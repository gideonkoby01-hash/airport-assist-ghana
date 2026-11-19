import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

// Routes a signed-in user to their role's dashboard. Public by route guard:
// mounted under a ProtectedRoute so guests are sent to login first.
export default function RoleRedirect() {
  const { user } = useAuth();
  const role = user?.role === "user" ? "passenger" : user?.role || "passenger";
  const dest =
    role === "pending"
      ? "/pending"
      : role === "admin"
      ? "/admin"
      : role === "management"
      ? "/management"
      : role === "supervisor"
      ? "/supervisor"
      : role === "accounts"
      ? "/accounts"
      : "/passenger";
  return <Navigate to={dest} replace />;
}