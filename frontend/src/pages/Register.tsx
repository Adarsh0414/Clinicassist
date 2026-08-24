import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../api/client";
import { Button, Field, inputClass } from "../components/ui";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { redirectForRole } from "./Login";

export default function Register() {
  const { register, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await register(form);
      navigate("/verify-otp", { state: { email: result.email } });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="ambient-blob absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-teal/10 blur-3xl" />
        <div className="ambient-blob absolute -top-24 right-0 w-80 h-80 rounded-full bg-amber/10 blur-3xl" style={{ animationDelay: "-8s" }} />
      </div>
      <div className="w-full max-w-sm animate-fade-in-scale">
        <div className="text-center mb-6">
          <h1 className="font-serif text-2xl font-semibold">Create your account</h1>
          <p className="text-sm text-ink/60 mt-1">Book and track appointments with ClinicAssist</p>
        </div>
        <form onSubmit={onSubmit} className="glass-card rounded-xl shadow-card p-6 space-y-4">
          <Field label="Full name">
            <input
              className={inputClass}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Phone (optional)">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>

          <GoogleSignInButton
            onSuccess={async () => {
              const user = await refreshUser();
              redirectForRole(user.role, navigate);
            }}
            onError={(message) => setError(message)}
          />
        </form>
        <p className="text-center text-sm text-ink/60 mt-4">
          Already registered?{" "}
          <Link to="/login" className="text-teal font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
