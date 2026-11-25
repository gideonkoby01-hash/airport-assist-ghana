import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { SettingsProvider, useSettings } from '@/lib/SettingsContext';
import { publicSiteDecision, readCachedPublicSite } from '@/lib/publicSite';
import { CurrencyProvider } from '@/lib/currency';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import MfaChallenge from '@/components/MfaChallenge';
import MfaEnrolGate from '@/components/MfaEnrolGate';
import AccountDisabled from '@/components/AccountDisabled';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import Book from '@/pages/Book';
import Pay from '@/pages/Pay';
import PayReturn from '@/pages/PayReturn';
import { ThemeProvider } from '@/lib/theme';
import RoleRedirect from '@/components/RoleRedirect';
import ForcePasswordChange from '@/components/ForcePasswordChange';
const SupervisorDashboard = lazy(() => import('@/pages/SupervisorDashboard'));
const ManagementDashboard = lazy(() => import('@/pages/ManagementDashboard'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const BookingDetail = lazy(() => import('@/pages/BookingDetail'));
const AccountsDashboard = lazy(() => import('@/pages/AccountsDashboard'));
const PendingApproval = lazy(() => import('@/pages/PendingApproval'));
const Security = lazy(() => import('@/pages/Security'));
const Profile = lazy(() => import('@/pages/Profile'));
const Privacy = lazy(() => import('@/pages/Privacy'));

// The public pages (home, booking, payment, privacy). When the super admin has closed the public website they send visitors to the staff sign-in.
const PublicGate = ({ children }) => {
  const { settings, loaded } = useSettings();
  const decision = publicSiteDecision({ loaded, value: settings.public_site_enabled, cached: readCachedPublicSite(typeof localStorage === 'undefined' ? undefined : localStorage) });
  if (decision === 'redirect') return <Navigate to="/login" replace />;
  if (decision === 'wait') {
    return <div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div></div>;
  }
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError, navigateToLogin, mfaRequired, mfaEnrolRequired, accountDisabled, mustChangePassword } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Password accepted but the second factor is still outstanding
  if (mfaRequired) return <MfaChallenge />;
  if (accountDisabled) return <AccountDisabled />;
  // An admin-created account must replace its temporary password before anything else, then set up two-step verification.
  if (mustChangePassword) return <ForcePasswordChange />;
  if (mfaEnrolRequired) return <MfaEnrolGate />;

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app. Dashboards and detail pages load on demand, so the public pages stay light.
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Passengers do not have accounts: they book on /book and everything about the booking is emailed to them. */}
      <Route path="/register" element={<Navigate to="/book" replace />} />
      <Route path="/passenger" element={<Navigate to="/book" replace />} />
      <Route path="/privacy" element={<PublicGate><Privacy /></PublicGate>} />
      {/* The booking page is public: signing in comes at its last step */}
      <Route path="/book" element={<PublicGate><Book /></PublicGate>} />
      <Route path="/pay" element={<PublicGate><Pay /></PublicGate>} />
      <Route path="/pay/return" element={<PublicGate><PayReturn /></PublicGate>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Public company homepage — no sign-in required */}
      <Route path="/" element={<PublicGate><Home /></PublicGate>} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        {/* Role-based dashboard redirect for signed-in users */}
        <Route path="/portal" element={<RoleRedirect />} />
        <Route path="/supervisor" element={<SupervisorDashboard />} />
        <Route path="/management" element={<ManagementDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/accounts" element={<AccountsDashboard />} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/security" element={<Security />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider>
    <SettingsProvider>
    <AuthProvider>
    <CurrencyProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </CurrencyProvider>
    </AuthProvider>
    </SettingsProvider>
    </ThemeProvider>
  )
}

export default App