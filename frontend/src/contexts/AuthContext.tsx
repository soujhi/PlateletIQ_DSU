import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi } from "../api/endpoints";

interface User {
  sub: string;
  email: string;
  name: string;
  role: string;
  bank_id: string;
  bank_name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginAsDemo: () => Promise<void>;
  loginWithGoogleToken: (idToken: string) => Promise<void>;
  setAuthSession: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USER_PROFILE: User = {
  sub: "demo-user-001",
  email: "demo@plateletiq.dev",
  name: "Demo Officer",
  role: "OFFICER",
  bank_id: "TN-GGH-001",
  bank_name: "Govt. General Hospital Chennai",
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      // 1. Check if token was passed in URL query param from Google OAuth callback
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");

      let currentToken = urlToken || localStorage.getItem("plateletiq_token");

      if (urlToken) {
        localStorage.setItem("plateletiq_token", urlToken);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      if (currentToken) {
        try {
          // Verify session via /auth/me
          const meData = await authApi.getMe();
          if (meData) {
            setUser(meData);
            setToken(currentToken);
          } else {
            // Fallback for demo token
            setUser(DEMO_USER_PROFILE);
            setToken(currentToken);
          }
        } catch (e) {
          console.warn("Auth token validation failed, falling back gracefully:", e);
          if (currentToken.startsWith("demo-") || currentToken === "demo-token-12345") {
            setUser(DEMO_USER_PROFILE);
            setToken(currentToken);
          } else {
            localStorage.removeItem("plateletiq_token");
            setUser(null);
            setToken(null);
          }
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const setAuthSession = (newToken: string, newUser: User) => {
    localStorage.setItem("plateletiq_token", newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const loginAsDemo = async () => {
    try {
      const res = await authApi.googleCallback();
      if (res && res.token) {
        setAuthSession(res.token, res.user);
      } else {
        setAuthSession("demo-token-12345", DEMO_USER_PROFILE);
      }
    } catch (e) {
      setAuthSession("demo-token-12345", DEMO_USER_PROFILE);
    }
  };

  const loginWithGoogleToken = async (idToken: string) => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
    const res = await fetch(`${baseUrl}/auth/google/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: idToken }),
    });
    const json = await res.json();
    if (json?.data?.token) {
      setAuthSession(json.data.token, json.data.user);
    }
  };

  const logout = () => {
    localStorage.removeItem("plateletiq_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        loginAsDemo,
        loginWithGoogleToken,
        setAuthSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
