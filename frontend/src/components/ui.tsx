export function HeartPulse({ className = "" }: { className?: string }) {
  return (
    <span
      className={`heart-pulse ${className}`}
      aria-hidden="true"
    >
      ♥
    </span>
  );
}

export function PulseRule({ animated = true, className = "" }: { animated?: boolean; className?: string }) {
  return (
    <svg
      className={`pulse-rule ${animated ? "animated" : ""} ${className}`}
      viewBox="0 0 240 10"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0,5 L90,5 L98,1 L106,9 L114,1 L122,5 L240,5" />
    </svg>
  );
}

const urgencyStyles: Record<string, string> = {
  High: "bg-coral-light text-coral",
  Medium: "bg-amber-light text-amber",
  Low: "bg-teal-light text-teal-dark",
};

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return <span className={`badge ${urgencyStyles[urgency] ?? "bg-line text-ink"}`}>{urgency} urgency</span>;
}

const statusStyles: Record<string, string> = {
  HOLD: "bg-amber-light text-amber",
  CONFIRMED: "bg-teal-light text-teal-dark",
  CANCELLED: "bg-line text-ink/60",
  RESCHEDULE_NEEDED: "bg-coral-light text-coral",
  COMPLETED: "bg-ink/5 text-ink/70",
  NO_SHOW: "bg-coral-light text-coral",
};

const statusLabels: Record<string, string> = {
  HOLD: "Pending",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  RESCHEDULE_NEEDED: "Needs rebooking",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusStyles[status] ?? "bg-line text-ink"}`}>{statusLabels[status] ?? status}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-line rounded-xl shadow-card p-5 ${className}`}>{children}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors btn-press disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-teal text-white hover:bg-teal-dark",
    secondary: "bg-white text-ink border border-line hover:bg-teal-light",
    danger: "bg-white text-coral border border-coral/30 hover:bg-coral-light",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink/80 mb-1">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-teal outline-none";

/** Small red count badge for nav links / tabs — "you have unread things here." */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-white text-[10px] font-bold leading-none ml-1.5">
      {count > 99 ? "99+" : count}
    </span>
  );
}
