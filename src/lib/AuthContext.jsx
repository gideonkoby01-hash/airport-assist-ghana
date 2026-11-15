import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';
import { api } from '@/api/db';

const AuthContext = createContext(undefined);

// The signed-in person as the rest of the app sees them: the Supabase auth identity plus the
// `profiles` row (role, full name). Roles are only ever read from profiles, which clients cannot edit.
async function loadUser(authUser) {
  const profile = await api.entities.User.get(authUser.id);
  return { ...profile, id: authUser.id, email: authUser.email };
}

// True when the account has a verified authenticator app but this session has not passed the code check yet.
async function needsSecondFactor() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

// Whether staff must use two-step verification (the `require_staff_mfa` setting; on unless an admin switched it off).
// If the check fails, assume it is required.
async function staffMfaEnforced() {
  const { data, error } = await supabase.rpc('staff_mfa_enforced');
  return error ? true : data !== false;
}

async function hasVerifiedFactor() {
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp?.length ?? 0) > 0;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  // Admin and management must set up two-step verification before they can use their access.
  const [mfaEnrolRequired, setMfaEnrolRequired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const { data } = await supabase.auth.getSession();
      const authUser = data.session?.user;
      if (!authUser) {
        setUser(null);
        setIsAuthenticated(false);
        setMfaRequired(false);
        setMfaEnrolRequired(false);
        setAccountDisabled(false);
        return;
      }
      if (await needsSecondFactor()) {
        // Signed in with a password but not yet verified: hold the app back until the code is entered.
        setMfaRequired(true);
        setUser(null);
        setIsAuthenticated(false);
        return;
      }
      setMfaRequired(false);
      const loaded = await loadUser(authUser);
      setAccountDisabled(Boolean(loaded.disabled));
      // A staff session that passed the check is already aal2; one with no factor yet must enrol first.
      const isStaff = !loaded.disabled && ['admin', 'management'].includes(loaded.role);
      setMfaEnrolRequired(isStaff && (await staffMfaEnforced()) && !(await hasVerifiedFactor()));
      setUser(loaded);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Token refreshes keep the same user; only re-check when the identity or assurance can change.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'MFA_CHALLENGE_VERIFIED') {
        // Deferred: supabase-js warns against calling its own APIs inside this callback.
        setTimeout(checkUserAuth, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [checkUserAuth]);

  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    setMfaRequired(false);
    if (shouldRedirect) window.location.href = '/login';
  };

  // After the person edits their own details, show the new values straight away.
  const updateProfile = (patch) => setUser((u) => (u ? { ...u, ...patch } : u));

  const navigateToLogin = () => {
    if (window.location.pathname !== '/login') window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        authError,
        authChecked,
        mfaRequired,
        mfaEnrolRequired,
        accountDisabled,
        logout,
        navigateToLogin,
        checkUserAuth,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
