import { useState } from "react";
import { api, extractErrorMessage } from "../api/client";
import { Button, Card, Field, inputClass } from "./ui";

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch("/auth/change-password", { currentPassword, newPassword });
      setSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="glass-card">
      <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-ink/50">Change password</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Current password">
          <input
            type="password"
            className={inputClass}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <input type="password" minLength={8} className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-sm text-coral mt-3">{error}</p>}
      {success && <p className="text-sm text-teal-dark mt-3">{success}</p>}
      <Button
        variant="secondary"
        className="mt-4"
        disabled={submitting || currentPassword.length < 1 || newPassword.length < 8}
        onClick={submit}
      >
        {submitting ? "Saving…" : "Update password"}
      </Button>
    </Card>
  );
}
