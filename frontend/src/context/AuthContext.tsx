import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

export type Role = "PATIENT" | "DOCTOR" | "ADMIN";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  doctorProfileId?: string;
  patientProfileId?: string;
}

interface AuthContextShape {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<{ requiresVerification: boolean; email: string }>;
  logout: () => void;
  refreshUser: () => Promise<CurrentUser>;
}

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ham_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem("ham_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("ham_token", res.data.token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data as CurrentUser;
  }

  async function register(input: { name: string; email: string; password: string; phone?: string }) {
    const res = await api.post("/auth/register", input);
    // Registration no longer logs the user in immediately — an OTP must be verified first.
    return res.data as { requiresVerification: boolean; email: string };
  }

  function logout() {
    localStorage.removeItem("ham_token");
    setUser(null);
  }

  async function refreshUser() {
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data as CurrentUser;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
