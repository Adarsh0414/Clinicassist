import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { Button, Card, Field, inputClass } from "../../components/ui";
import { ChangePasswordCard } from "../../components/ChangePasswordCard";

export default function AdminProfile() {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => setForm({ name: res.data.name, email: res.data.email, phone: res.data.phone ?? "" }))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch("/auth/me", { name: form.name, phone: form.phone });
      setSuccess("Profile updated.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-ink/50">Loading…</p>;

  return (
    <div className="max-w-md mx-auto animate-fade-in">
      <h1 className="font-serif text-3xl font-semibold mb-6">My profile</h1>
      <div className="space-y-4">
        <Card className="glass-card">
          <div className="space-y-4">
            <Field label="Full name">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className={`${inputClass} opacity-70`} value={form.email} disabled />
            </Field>
            <Field label="Phone">
              <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            {error && <p className="text-sm text-coral">{error}</p>}
            {success && <p className="text-sm text-teal-dark">{success}</p>}
            <Button disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Card>

        <ChangePasswordCard />
      </div>
    </div>
  );
}
