import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { Button, Card, Field, inputClass } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface DoctorMessage {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  adminReply: string | null;
  createdAt: string;
  repliedAt: string | null;
}

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "technical", label: "Technical problem" },
  { value: "account", label: "Account issue" },
  { value: "patient", label: "Patient-related concern" },
  { value: "scheduling", label: "Scheduling issue" },
  { value: "general", label: "General request" },
  { value: "other", label: "Other" },
];

export default function DoctorMessages() {
  const [messages, setMessages] = useState<DoctorMessage[]>([]);
  const [form, setForm] = useState({ category: "general", subject: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DoctorMessage | null>(null);
  const [clearingResolved, setClearingResolved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
    api.post("/doctor-messages/mine/mark-read").catch(() => {});
  }, []);

  async function load() {
    const res = await api.get("/doctor-messages/mine");
    setMessages(res.data);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/doctor-messages", form);
      setForm({ category: "general", subject: "", message: "" });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeleteOne() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/doctor-messages/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmClearResolved() {
    setBusy(true);
    try {
      await api.delete("/doctor-messages/mine/resolved");
      setClearingResolved(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="font-serif text-3xl font-semibold mb-1">Messages to admin</h1>
      <p className="text-ink/60 mb-6">Technical issues, account questions, scheduling problems — send a note and the admin will respond here.</p>

      <Card className="glass-card mb-6">
        <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-ink/50">New message</h2>
        <div className="space-y-3">
          <Field label="What's this about?">
            <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject">
            <input className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short summary" />
          </Field>
          <Field label="Message">
            <textarea
              className={`${inputClass} min-h-[100px]`}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Describe the issue or request in detail..."
            />
          </Field>
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button disabled={submitting || form.subject.trim().length < 3 || form.message.trim().length < 3} onClick={submit}>
            {submitting ? "Sending…" : "Send to admin"}
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-ink/50">History</h2>
        {messages.some((m) => m.status === "RESOLVED") && (
          <button
            onClick={() => setClearingResolved(true)}
            className="text-xs font-semibold text-coral hover:bg-coral-light rounded-md px-2 py-1 transition-colors"
          >
            Clear resolved
          </button>
        )}
      </div>
      <div className="space-y-3">
        {messages.map((m) => (
          <Card key={m.id} className="card-hover">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{m.subject}</p>
                <span className="badge bg-ink/5 text-ink/60 capitalize">{m.category}</span>
                <span className={`badge ${m.status === "OPEN" ? "bg-amber-light text-amber" : "bg-teal-light text-teal-dark"}`}>{m.status}</span>
              </div>
              <button
                onClick={() => setDeleteTarget(m)}
                className="text-xs font-semibold text-coral hover:bg-coral-light rounded-md px-2 py-1 transition-colors shrink-0"
              >
                Delete
              </button>
            </div>
            <p className="text-xs text-ink/40 mt-0.5">{new Date(m.createdAt).toLocaleString()}</p>
            <p className="text-sm text-ink/80 mt-3">{m.message}</p>
            {m.adminReply && (
              <div className="mt-3 bg-teal-light/40 border border-teal/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-teal-dark uppercase tracking-wide mb-1">Admin reply</p>
                <p className="text-sm text-ink/80">{m.adminReply}</p>
              </div>
            )}
          </Card>
        ))}
        {messages.length === 0 && (
          <Card>
            <p className="text-sm text-ink/50">No messages sent yet.</p>
          </Card>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this message?"
          message={`This permanently removes "${deleteTarget.subject}" from your history. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteOne}
          onCancel={() => setDeleteTarget(null)}
          submitting={busy}
        />
      )}
      {clearingResolved && (
        <ConfirmDialog
          title="Clear resolved messages?"
          message="This permanently removes every resolved message from your history. This cannot be undone."
          confirmLabel="Clear resolved"
          onConfirm={confirmClearResolved}
          onCancel={() => setClearingResolved(false)}
          submitting={busy}
        />
      )}
    </div>
  );
}
