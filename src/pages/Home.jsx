import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

// Routes each signed-in user to their role's dashboard.
export default function Home() {
  const { user } = useAuth();
  const role = user?.role === "user" ? "passenger" : user?.role || "passenger";
  const dest =
    role === "pending" ? "/pending" : role === "admin" ? "/admin" : role === "management" ? "/management" : role === "supervisor" ? "/supervisor" : "/passenger";
  return <Navigate to={dest} replace />;
}