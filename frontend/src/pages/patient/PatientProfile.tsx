import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { Button, Card, Field, inputClass } from "../../components/ui";
import { ChangePasswordCard } from "../../components/ChangePasswordCard";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useAuth } from "../../context/AuthContext";

interface PatientProfileData {
  name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  address: string | null;
  emailRemindersEnabled: boolean;
}

export default function PatientProfile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientProfileData | null>(null);
  const [form, setForm] = useState<Partial<PatientProfileData>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Account deletion — password-based accounts confirm with their current password;
  // Google-auth accounts (no user-known password) get an explicit confirm dialog instead.
  const requiresPassword = user?.authProvider !== "google";
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [showGoogleDeleteConfirm, setShowGoogleDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/patients/me");
      setData(res.data);
      setForm(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await Promise.all([
        api.patch("/auth/me", { phone: form.phone }),
        api.patch("/patients/me", {
          dob: form.dob ? new Date(form.dob).toISOString() : undefined,
          gender: form.gender,
          bloodGroup: form.bloodGroup,
          allergies: form.allergies,
          medicalConditions: form.medicalConditions,
          emergencyContactName: form.emergencyContactName,
          emergencyContactPhone: form.emergencyContactPhone,
          address: form.address,
          emailRemindersEnabled: form.emailRemindersEnabled,
        }),
      ]);
      setSuccess("Profile updated.");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete("/patients/me", requiresPassword ? { data: { password: deletePassword } } : undefined);
      logout();
      navigate("/login");
    } catch (err) {
      setDeleteError(extractErrorMessage(err));
      setDeleting(false);
    }
  }

  if (loading) return <p className="text-sm text-ink/50">Loading profile…</p>;
  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="font-serif text-3xl font-semibold mb-1">My profile</h1>
      <p className="text-ink/60 mb-6">
        Keep this up to date — your doctor sees your medical details before every visit.
      </p>

      <div className="space-y-4">
        <Card className="glass-card">
          <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-ink/50">Account</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name">
              <input className={`${inputClass} opacity-70`} value={data.name} disabled />
            </Field>
            <Field label="Email">
              <input className={`${inputClass} opacity-70`} value={data.email} disabled />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555 123 4567"
              />
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                className={inputClass}
                value={form.dob ? String(form.dob).slice(0, 10) : ""}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
              />
            </Field>
            <Field label="Gender">
              <select className={inputClass} value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Prefer not to say</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card className="glass-card">
          <h2 className="font-semibold mb-1 text-sm uppercase tracking-wide text-ink/50">Medical details</h2>
          <p className="text-xs text-ink/40 mb-4">
            This is shown to your doctor alongside your symptoms before every visit — add anything you'd want them to know upfront.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Blood group">
              <select
                className={inputClass}
                value={form.bloodGroup ?? ""}
                onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
              >
                <option value="">Unknown</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Known allergies">
              <input
                className={inputClass}
                value={form.allergies ?? ""}
                onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                placeholder="e.g. Penicillin, Peanuts"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Existing conditions">
              <textarea
                className={`${inputClass} min-h-[80px]`}
                value={form.medicalConditions ?? ""}
                onChange={(e) => setForm({ ...form, medicalConditions: e.target.value })}
                placeholder="e.g. Type 2 Diabetes, High blood pressure, Asthma..."
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Address">
              <input
                className={inputClass}
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card className="glass-card">
          <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-ink/50">Emergency contact</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Contact name">
              <input
                className={inputClass}
                value={form.emergencyContactName ?? ""}
                onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
              />
            </Field>
            <Field label="Contact phone">
              <input
                className={inputClass}
                value={form.emergencyContactPhone ?? ""}
                onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card className="glass-card">
          <h2 className="font-semibold mb-1 text-sm uppercase tracking-wide text-ink/50">Notifications</h2>
          <label className="flex items-center gap-3 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-teal w-4 h-4"
              checked={form.emailRemindersEnabled ?? true}
              onChange={(e) => setForm({ ...form, emailRemindersEnabled: e.target.checked })}
            />
            <span className="text-sm">Email me appointment and medication reminders</span>
          </label>
        </Card>

        {error && <p className="text-sm text-coral bg-coral-light rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-teal-dark bg-teal-light rounded-lg px-3 py-2">{success}</p>}
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </Button>

        <ChangePasswordCard />

        <Card className="glass-card border border-coral/30">
          <h2 className="font-semibold mb-1 text-sm uppercase tracking-wide text-coral">Danger zone</h2>
          <p className="text-xs text-ink/50 mb-4">
            Permanently delete your account, medical profile, and appointment history. This cannot be undone.
          </p>

          {!showDeleteForm ? (
            <Button variant="danger" onClick={() => setShowDeleteForm(true)}>
              Delete my account
            </Button>
          ) : (
            <div className="space-y-3">
              {requiresPassword && (
                <Field label="Confirm your password">
                  <input
                    type="password"
                    className={inputClass}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </Field>
              )}
              {deleteError && <p className="text-sm text-coral bg-coral-light rounded-lg px-3 py-2">{deleteError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={deleting}
                  onClick={() => {
                    setShowDeleteForm(false);
                    setDeletePassword("");
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={deleting || (requiresPassword && deletePassword.length < 1)}
                  onClick={() => (requiresPassword ? deleteAccount() : setShowGoogleDeleteConfirm(true))}
                >
                  {deleting ? "Deleting…" : "Permanently delete account"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {showGoogleDeleteConfirm && (
        <ConfirmDialog
          title="Delete your account?"
          message="This permanently deletes your profile, medical details, and appointment history. This cannot be undone."
          confirmLabel="Delete account"
          submitting={deleting}
          onConfirm={() => {
            setShowGoogleDeleteConfirm(false);
            deleteAccount();
          }}
          onCancel={() => setShowGoogleDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
