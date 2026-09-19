import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearStoredToken, getStoredToken, setStoredToken, setUnauthorizedHandler } from "../api/client";
import { authApi, setActiveBankId } from "../api/endpoints";
import type { AuthConfig, Facility, SessionUser } from "../api/types";

/**
 * Sign-in has two stages, and the UI routes on which one you are at.
 *
 *   "anonymous" — no valid token; show the sign-in screen.
 *   "identity"  — Google knows who you are, but no facility is chosen yet;
 *                 show the facility picker.
 *   "facility"  — bound to a facility; show the app.
 *
 * The facility is never assumed. Two laptops running this build are two
 * different hospitals purely because each chose a different facility, and
 * every bank-scoped API call follows from that choice.
 */
export type SessionStage = "anonymous" | "identity" | "facility";

interface AuthContextValue {
  user: SessionUser | null;
  facility: Facility | null;
  stage: SessionStage;
  isLoading: boolean;
  authConfig: AuthConfig | null;
  authError: string | null;
  signInWithGoogleCredential: (credential: string) => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  signInForDevelopment: (email: string, name?: string) => Promise<void>;
  selectFacility: (facilityId: string, role?: string) => Promise<void>;
  changeFacility: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const applySession = useCallback((token: string, sessionUser: SessionUser) => {
    setStoredToken(token);
    setActiveBankId(sessionUser.bank_id);
    setUser(sessionUser);
  }, []);

  const signOut = useCallback(() => {
    clearStoredToken();
    setActiveBankId(null);
    setUser(null);
    setFacility(null);
  }, []);

  // A 401 from any call means our token is gone or expired; drop to sign-in
  // rather than leaving the app showing stale data it can no longer refresh.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setActiveBankId(null);
      setUser(null);
      setFacility(null);
      setAuthError("Your session expired. Sign in again.");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // The Google redirect flow hands the token back as a query parameter.
      const params = new URLSearchParams(window.location.search);
      const redirectToken = params.get("token");
      const redirectError = params.get("auth_error");

      if (redirectToken || redirectError) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      if (redirectError && !cancelled) {
        setAuthError(`Google sign-in failed (${redirectError}).`);
      }
      if (redirectToken) {
        setStoredToken(redirectToken);
      }

      try {
        const config = await authApi.getConfig();
        if (!cancelled) setAuthConfig(config);
      } catch {
        // The sign-in screen renders its own "cannot reach the API" state.
      }

      if (getStoredToken()) {
        try {
          const me = await authApi.getMe();
          if (!cancelled) {
            setActiveBankId(me.bank_id);
            setUser(me);
          }
        } catch {
          clearStoredToken();
          if (!cancelled) {
            setActiveBankId(null);
            setUser(null);
          }
        }
      }

      if (!cancelled) setIsLoading(false);
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGoogleCredential = useCallback(
    async (credential: string) => {
      setAuthError(null);
      const result = await authApi.verifyGoogleCredential(credential);
      applySession(result.token, result.user);
    },
    [applySession],
  );

  const signInWithGoogleRedirect = useCallback(async () => {
    setAuthError(null);
    const { redirect_url } = await authApi.startGoogleRedirect();
    window.location.href = redirect_url;
  }, []);

  const signInForDevelopment = useCallback(
    async (email: string, name?: string) => {
      setAuthError(null);
      const result = await authApi.devSignIn(email, name);
      applySession(result.token, result.user);
    },
    [applySession],
  );

  const selectFacility = useCallback(
    async (facilityId: string, role = "OFFICER") => {
      setAuthError(null);
      const result = await authApi.selectFacility(facilityId, role);
      applySession(result.token, result.user);
      setFacility(result.facility);
    },
    [applySession],
  );

  /** Step back to the picker without losing the Google identity. */
  const changeFacility = useCallback(() => {
    setFacility(null);
    setActiveBankId(null);
    setUser((current) => (current ? { ...current, bank_id: null, bank_name: null, role: null } : current));
  }, []);

  const stage: SessionStage = !user ? "anonymous" : user.bank_id ? "facility" : "identity";

  const value = useMemo(
    () => ({
      user,
      facility,
      stage,
      isLoading,
      authConfig,
      authError,
      signInWithGoogleCredential,
      signInWithGoogleRedirect,
      signInForDevelopment,
      selectFacility,
      changeFacility,
      signOut,
    }),
    [
      user, facility, stage, isLoading, authConfig, authError,
      signInWithGoogleCredential, signInWithGoogleRedirect, signInForDevelopment,
      selectFacility, changeFacility, signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
  return context;
}
