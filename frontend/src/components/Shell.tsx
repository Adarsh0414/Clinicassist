import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { HeartPulse, CountBadge, PulseRule } from "./ui";

/** Polls the right unread-count endpoint for the current role every 20s, so nav badges
 *  ("you have a new message", "an appointment needs attention") stay live without a
 *  full page reload. Returns 0 silently on any error — a badge is a nice-to-have, never
 *  something that should surface as a visible error to the user. */
function useBadgeCount(path: string | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await api.get(path!);
        if (!cancelled) setCount(res.data.count ?? 0);
      } catch {
        // badges are best-effort
      }
    }
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [path]);
  return count;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doctorMessagesUnread = useBadgeCount(user?.role === "DOCTOR" ? "/doctor-messages/mine/unread-count" : null);
  const adminMessagesUnread = useBadgeCount(user?.role === "ADMIN" ? "/doctor-messages/unread-count" : null);
  const patientAttention = useBadgeCount(user?.role === "PATIENT" ? "/appointments/attention-count" : null);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center text-sm font-medium px-3 py-2 rounded-md transition-colors ${
      isActive ? "bg-teal-light text-teal-dark" : "text-ink/70 hover:text-ink hover:bg-ink/5"
    }`;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="ambient-blob absolute -top-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-teal/10 blur-3xl" />
        <div className="ambient-blob absolute top-1/4 -right-32 w-96 h-96 rounded-full bg-amber/10 blur-3xl" style={{ animationDelay: "-6s" }} />
        <div className="ambient-blob absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-teal/5 blur-3xl" style={{ animationDelay: "-12s" }} />
      </div>
      <header className="border-b border-line glass-nav sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeartPulse />
            <div className="leading-tight">
              <span className="font-serif text-lg font-semibold tracking-tight block">ClinicAssist</span>
              <span className="text-[11px] text-ink/45 font-medium tracking-wide hidden sm:block">
                Smart Healthcare Appointment &amp; Follow-up Management
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {user?.role === "PATIENT" && (
              <>
                <NavLink to="/patient/book" className={linkClass}>
                  Book a visit
                </NavLink>
                <NavLink to="/patient/appointments" className={linkClass}>
                  My appointments
                  <CountBadge count={patientAttention} />
                </NavLink>
                <NavLink to="/patient/profile" className={linkClass}>
                  My profile
                </NavLink>
              </>
            )}
            {user?.role === "DOCTOR" && (
              <>
                <NavLink to="/doctor" className={linkClass}>
                  My agenda
                </NavLink>
                <NavLink to="/doctor/profile" className={linkClass}>
                  My profile
                </NavLink>
                <NavLink to="/doctor/messages" className={linkClass}>
                  Messages
                  <CountBadge count={doctorMessagesUnread} />
                </NavLink>
              </>
            )}
            {user?.role === "ADMIN" && (
              <>
                <NavLink to="/admin" className={linkClass}>
                  Admin console
                  <CountBadge count={adminMessagesUnread} />
                </NavLink>
                <NavLink to="/admin/profile" className={linkClass}>
                  My profile
                </NavLink>
              </>
            )}
            {user && (
              <button
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="ml-2 text-sm font-medium px-3 py-2 rounded-md text-ink/60 hover:text-coral hover:bg-coral-light transition-colors"
              >
                Sign out
              </button>
            )}
          </nav>
        </div>
        <div className="text-teal/40 max-w-6xl mx-auto px-6">
          <PulseRule />
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <div className="animate-fade-in">{children}</div>
      </main>
      <footer className="text-center text-xs text-ink/40 py-6">ClinicAssist — Smart Healthcare Appointment &amp; Follow-up Management</footer>
    </div>
  );
}
