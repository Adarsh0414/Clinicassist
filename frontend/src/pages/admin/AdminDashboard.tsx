import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { Button, Card, CountBadge, Field, inputClass } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface Stats {
  totalPatients: number;
  totalDoctors: number;
  totalAppointments: number;
  upcomingConfirmed: number;
  failedNotifications: number;
}

interface Doctor {
  id: string;
  name: string;
  specialization: string;
  bio?: string | null;
  qualifications?: string | null;
  yearsOfExperience?: number | null;
  consultationFee?: string | null;
  slotDurationMinutes?: number;
}

type Tab = "overview" | "doctors" | "leave" | "notifications" | "messages" | "audit";

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [failedNotifications, setFailedNotifications] = useState(0);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState(0);

  useEffect(() => {
    api
      .get("/doctor-messages/unread-count")
      .then((res) => setUnreadMessages(res.data.count))
      .catch(() => {});
    api
      .get("/admin/stats")
      .then((res) => setFailedNotifications(res.data.failedNotifications))
      .catch(() => {});
    api
      .get("/doctors/leave-requests/pending-count")
      .then((res) => setPendingLeaveRequests(res.data.count))
      .catch(() => {});
  }, [tab]);

  const tabBadge: Partial<Record<Tab, number>> = {
    messages: unreadMessages,
    notifications: failedNotifications,
    leave: pendingLeaveRequests,
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-1">Admin console</h1>
      <p className="text-ink/60 mb-6">Manage the doctor roster, leave days, and monitor notification delivery.</p>

      <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
        {(["overview", "doctors", "leave", "notifications", "messages", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t ? "border-teal text-teal-dark" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t}
            <CountBadge count={tabBadge[t] ?? 0} />
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview />}
      {tab === "doctors" && <Doctors />}
      {tab === "leave" && <Leave />}
      {tab === "notifications" && <Notifications />}
      {tab === "messages" && <AdminMessages />}
      {tab === "audit" && <AuditLogTab />}
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.get("/admin/stats").then((res) => setStats(res.data));
  }, []);
  if (!stats) return <p className="text-sm text-ink/50">Loading…</p>;

  const cards: Array<{ label: string; value: number; tone?: string }> = [
    { label: "Patients", value: stats.totalPatients },
    { label: "Doctors", value: stats.totalDoctors },
    { label: "Total appointments", value: stats.totalAppointments },
    { label: "Upcoming confirmed", value: stats.upcomingConfirmed },
    { label: "Failed notifications", value: stats.failedNotifications, tone: stats.failedNotifications > 0 ? "coral" : undefined },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="card-hover">
          <p className="text-xs font-medium text-ink/50 uppercase tracking-wide">{c.label}</p>
          <p className={`font-serif text-3xl font-semibold mt-1 ${c.tone === "coral" ? "text-coral" : "text-ink"}`}>{c.value}</p>
        </Card>
      ))}
    </div>
  );
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  specialization: "",
  slotDurationMinutes: 30,
  bio: "",
  qualifications: "",
  yearsOfExperience: "",
  consultationFee: "",
};

function Doctors() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.get("/doctors");
    setDoctors(res.data);
  }

  function startEdit(doc: Doctor) {
    setEditingId(doc.id);
    setForm({
      name: doc.name,
      email: "",
      password: "",
      specialization: doc.specialization,
      slotDurationMinutes: doc.slotDurationMinutes ?? 30,
      bio: doc.bio ?? "",
      qualifications: doc.qualifications ?? "",
      yearsOfExperience: doc.yearsOfExperience != null ? String(doc.yearsOfExperience) : "",
      consultationFee: doc.consultationFee ?? "",
    });
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        await api.patch(`/doctors/${editingId}`, {
          specialization: form.specialization,
          slotDurationMinutes: Number(form.slotDurationMinutes),
          bio: form.bio || null,
          qualifications: form.qualifications || null,
          yearsOfExperience: form.yearsOfExperience ? Number(form.yearsOfExperience) : null,
          consultationFee: form.consultationFee || null,
        });
        setSuccess(`Dr. ${form.name}'s profile was updated.`);
        setEditingId(null);
      } else {
        const workingHours = {
          MON: { start: "09:00", end: "17:00" },
          TUE: { start: "09:00", end: "17:00" },
          WED: { start: "09:00", end: "17:00" },
          THU: { start: "09:00", end: "17:00" },
          FRI: { start: "09:00", end: "17:00" },
        };
        await api.post("/doctors", { ...form, workingHours });
        setSuccess(`Dr. ${form.name} was added to the roster.`);
      }
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/doctors/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <h2 className="font-semibold mb-4">{editingId ? "Edit doctor" : "Add a doctor"}</h2>
        <div className="space-y-3">
          <Field label="Full name">
            <input
              className={`${inputClass} ${editingId ? "opacity-70" : ""}`}
              value={form.name}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          {!editingId && (
            <>
              <Field label="Email">
                <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Temporary password">
                <input
                  className={inputClass}
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
            </>
          )}
          <Field label="Specialization">
            <input
              className={inputClass}
              value={form.specialization}
              onChange={(e) => setForm({ ...form, specialization: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qualifications">
              <input
                className={inputClass}
                placeholder="e.g. MBBS, MD"
                value={form.qualifications}
                onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
              />
            </Field>
            <Field label="Years of experience">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.yearsOfExperience}
                onChange={(e) => setForm({ ...form, yearsOfExperience: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Consultation fee">
              <input
                className={inputClass}
                placeholder="e.g. $50"
                value={form.consultationFee}
                onChange={(e) => setForm({ ...form, consultationFee: e.target.value })}
              />
            </Field>
            <Field label="Slot duration (min)">
              <input
                className={inputClass}
                type="number"
                value={form.slotDurationMinutes}
                onChange={(e) => setForm({ ...form, slotDurationMinutes: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Bio (optional)">
            <input className={inputClass} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </Field>
          {error && <p className="text-sm text-coral">{error}</p>}
          {success && <p className="text-sm text-teal-dark">{success}</p>}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={submitting || !form.name || !form.specialization || (!editingId && (!form.email || form.password.length < 8))}
              onClick={submit}
            >
              {submitting ? "Saving…" : editingId ? "Save changes" : "Add doctor"}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={cancelEdit} disabled={submitting}>
                Cancel
              </Button>
            )}
          </div>
          {!editingId && <p className="text-xs text-ink/40">Default hours are Mon–Fri 9am–5pm (UTC); the doctor can refine this themselves.</p>}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-4">Roster</h2>
        <ul className="space-y-2">
          {doctors.map((d) => (
            <li key={d.id} className="border border-line rounded-lg p-3 flex items-start justify-between gap-3 card-hover">
              <div>
                <p className="font-medium text-sm">Dr. {d.name}</p>
                <p className="text-xs text-ink/50">{d.specialization}</p>
                {d.qualifications && <p className="text-xs text-ink/40 mt-0.5">{d.qualifications}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => startEdit(d)}
                  className="text-xs font-semibold text-teal hover:bg-teal-light rounded-md px-2 py-1 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(d)}
                  className="text-xs font-semibold text-coral hover:bg-coral-light rounded-md px-2 py-1 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {doctors.length === 0 && <p className="text-sm text-ink/50">No doctors yet.</p>}
        </ul>
      </Card>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete Dr. ${deleteTarget.name}?`}
          message="This permanently removes the doctor's account, profile, and all of their appointment history. This cannot be undone."
          confirmLabel="Delete doctor"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          submitting={deleting}
        />
      )}
    </div>
  );
}

interface LeaveRequestRow {
  id: string;
  doctorId: string;
  doctorName: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

function Leave() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    api.get("/doctors").then((res) => {
      setDoctors(res.data);
      if (res.data[0]) setDoctorId(res.data[0].id);
    });
    loadRequests();
  }, []);

  async function loadRequests() {
    setRequestsLoading(true);
    try {
      const res = await api.get("/doctors/leave-requests");
      setRequests(res.data);
    } catch {
      // non-critical
    } finally {
      setRequestsLoading(false);
    }
  }

  async function approve(id: string) {
    setDecidingId(id);
    try {
      await api.post(`/doctors/leave-requests/${id}/approve`);
      await loadRequests();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDecidingId(null);
    }
  }

  async function reject(id: string) {
    setDecidingId(id);
    try {
      await api.post(`/doctors/leave-requests/${id}/reject`, { adminNote: rejectNote || undefined });
      setRejectingId(null);
      setRejectNote("");
      await loadRequests();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDecidingId(null);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post(`/doctors/${doctorId}/leave`, { startDate, endDate, reason });
      setResult(res.data.message);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING").slice(0, 10);

  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <Card>
        <h2 className="font-semibold mb-1">Pending time-off requests</h2>
        <p className="text-xs text-ink/40 mb-4">
          Doctors submit these themselves. Nothing is applied to the calendar, and no patient is notified, until you
          approve.
        </p>
        {requestsLoading ? (
          <p className="text-sm text-ink/50">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-ink/50">No pending requests right now.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="border border-line rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Dr. {r.doctorName}</p>
                    <p className="text-xs text-ink/60 font-mono mt-0.5">
                      {new Date(r.startDate).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}
                      {r.endDate !== r.startDate
                        ? ` – ${new Date(r.endDate).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}`
                        : ""}
                    </p>
                    {r.reason && <p className="text-xs text-ink/50 mt-1">"{r.reason}"</p>}
                  </div>
                  <span className="badge bg-amber-light text-amber whitespace-nowrap">Pending</span>
                </div>

                {rejectingId === r.id ? (
                  <div className="mt-3 space-y-2">
                    <input
                      className={inputClass}
                      placeholder="Optional note for the doctor"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button variant="danger" disabled={decidingId === r.id} onClick={() => reject(r.id)}>
                        {decidingId === r.id ? "Declining…" : "Confirm decline"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectNote("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <Button disabled={decidingId === r.id} onClick={() => approve(r.id)}>
                      {decidingId === r.id ? "Approving…" : "Approve"}
                    </Button>
                    <Button variant="secondary" disabled={decidingId === r.id} onClick={() => setRejectingId(r.id)}>
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {decided.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">Recently decided</p>
            <ul className="text-sm space-y-1.5">
              {decided.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="text-ink/70">
                    Dr. {r.doctorName} —{" "}
                    <span className="font-mono">{new Date(r.startDate).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}</span>
                  </span>
                  <span className={`badge ${r.status === "APPROVED" ? "bg-teal-light text-teal-dark" : "bg-coral-light text-coral"}`}>
                    {r.status === "APPROVED" ? "Approved" : "Declined"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold mb-4">Mark a doctor on leave directly</h2>
        <p className="text-xs text-ink/40 -mt-3 mb-4">
          For admin-initiated leave that doesn't need a doctor's request — applies immediately.
        </p>
        <div className="space-y-3">
          <Field label="Doctor">
            <select className={inputClass} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.name} — {d.specialization}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </Field>
            <Field label="To">
              <input type="date" className={inputClass} min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason (optional)">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <p className="text-xs text-amber bg-amber-light rounded-lg px-3 py-2">
            Any patients already booked across that date range will be automatically notified by email and asked to rebook.
          </p>
          {error && <p className="text-sm text-coral">{error}</p>}
          {result && <p className="text-sm text-teal-dark">{result}</p>}
          <Button className="w-full" disabled={!doctorId || submitting} onClick={submit}>
            {submitting ? "Saving…" : "Mark on leave"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Notifications() {
  const [logs, setLogs] = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.get("/admin/notifications");
    setLogs(res.data);
  }

  async function confirmDeleteOne() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/admin/notifications/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmClearAll() {
    setBusy(true);
    try {
      await api.delete("/admin/notifications");
      setClearingAll(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Recent notifications</h2>
        {logs.length > 0 && (
          <button
            onClick={() => setClearingAll(true)}
            className="text-xs font-semibold text-coral hover:bg-coral-light rounded-md px-2 py-1 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/50 uppercase tracking-wide border-b border-line">
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Recipient</th>
              <th className="py-2 pr-4">Subject</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Attempts</th>
              <th className="py-2 pr-4">When</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-line/60">
                <td className="py-2 pr-4 font-mono text-xs">{l.type}</td>
                <td className="py-2 pr-4">{l.recipientEmail}</td>
                <td className="py-2 pr-4">{l.subject}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`badge ${
                      l.status === "SENT" ? "bg-teal-light text-teal-dark" : l.status === "FAILED" ? "bg-coral-light text-coral" : "bg-amber-light text-amber"
                    }`}
                  >
                    {l.status}
                  </span>
                </td>
                <td className="py-2 pr-4">{l.attempts}</td>
                <td className="py-2 pr-4 text-ink/50 text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setDeleteTarget(l)}
                    className="text-xs font-semibold text-coral hover:bg-coral-light rounded-md px-2 py-1 transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="text-sm text-ink/50 py-4">No notifications yet.</p>}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this notification?"
          message="This removes the delivery log entry. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDeleteOne}
          onCancel={() => setDeleteTarget(null)}
          submitting={busy}
        />
      )}
      {clearingAll && (
        <ConfirmDialog
          title="Clear all notifications?"
          message={`This permanently removes all ${logs.length} notification log entries shown here. This cannot be undone.`}
          confirmLabel="Clear all"
          onConfirm={confirmClearAll}
          onCancel={() => setClearingAll(false)}
          submitting={busy}
        />
      )}
    </Card>
  );
}

interface DoctorMessage {
  id: string;
  doctorName: string;
  category: string;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  adminReply: string | null;
  createdAt: string;
}

function AdminMessages() {
  const [messages, setMessages] = useState<DoctorMessage[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("OPEN");
  const [deleteTarget, setDeleteTarget] = useState<DoctorMessage | null>(null);
  const [clearingResolved, setClearingResolved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
  }, [filter]);

  // Mark everything read once on mount — the admin is looking at the inbox now, so the
  // nav badge should clear, regardless of which status filter they land on.
  useEffect(() => {
    api.post("/doctor-messages/mark-all-read").catch(() => {});
  }, []);

  async function load() {
    const res = await api.get("/doctor-messages", { params: filter === "ALL" ? undefined : { status: filter } });
    setMessages(res.data);
  }

  async function reply(id: string) {
    const adminReply = replyDrafts[id];
    if (!adminReply?.trim()) return;
    setReplyingId(id);
    try {
      await api.post(`/doctor-messages/${id}/reply`, { adminReply });
      load();
    } finally {
      setReplyingId(null);
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
      await api.delete("/doctor-messages/resolved");
      setClearingResolved(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2">
          {(["OPEN", "RESOLVED", "ALL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                filter === f ? "bg-teal text-white" : "bg-white border border-line text-ink/60 hover:bg-teal-light"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => setClearingResolved(true)}
          className="text-xs font-semibold text-coral hover:bg-coral-light rounded-md px-2 py-1 transition-colors"
        >
          Clear resolved
        </button>
      </div>
      <div className="space-y-3">
        {messages.map((m) => (
          <Card key={m.id} className="card-hover">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">{m.subject}</p>
                  <span className="badge bg-ink/5 text-ink/60 capitalize">{m.category}</span>
                  <span className={`badge ${m.status === "OPEN" ? "bg-amber-light text-amber" : "bg-teal-light text-teal-dark"}`}>{m.status}</span>
                </div>
                <p className="text-xs text-ink/50 mt-0.5">
                  Dr. {m.doctorName} · {new Date(m.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(m)}
                className="text-xs font-semibold text-coral hover:bg-coral-light rounded-md px-2 py-1 transition-colors shrink-0"
              >
                Delete
              </button>
            </div>
            <p className="text-sm text-ink/80 mt-3">{m.message}</p>
            {m.adminReply ? (
              <div className="mt-3 bg-teal-light/40 border border-teal/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-teal-dark uppercase tracking-wide mb-1">Your reply</p>
                <p className="text-sm text-ink/80">{m.adminReply}</p>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="Write a reply…"
                  value={replyDrafts[m.id] ?? ""}
                  onChange={(e) => setReplyDrafts({ ...replyDrafts, [m.id]: e.target.value })}
                />
                <Button disabled={replyingId === m.id} onClick={() => reply(m.id)}>
                  {replyingId === m.id ? "Sending…" : "Reply"}
                </Button>
              </div>
            )}
          </Card>
        ))}
        {messages.length === 0 && (
          <Card>
            <p className="text-sm text-ink/50">No messages here.</p>
          </Card>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this message?"
          message={`This permanently removes "${deleteTarget.subject}" from Dr. ${deleteTarget.doctorName}. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteOne}
          onCancel={() => setDeleteTarget(null)}
          submitting={busy}
        />
      )}
      {clearingResolved && (
        <ConfirmDialog
          title="Clear resolved messages?"
          message="This permanently removes every resolved message from the inbox. This cannot be undone."
          confirmLabel="Clear resolved"
          onConfirm={confirmClearResolved}
          onCancel={() => setClearingResolved(false)}
          submitting={busy}
        />
      )}
    </div>
  );
}

interface AuditEntry {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  "doctor.created": "Added doctor",
  "doctor.updated": "Updated doctor profile",
  "doctor.deleted": "Deleted doctor",
  "doctor.leave_marked": "Marked doctor on leave",
  "doctor.requested_leave": "Doctor requested time off",
  "doctor.leave_request_approved": "Approved a doctor's time-off request",
  "doctor.leave_request_rejected": "Declined a doctor's time-off request",
  "doctor.updated_own_profile": "Doctor updated own profile",
  "doctor.marked_own_leave": "Doctor marked own leave",
  "appointment.cancelled": "Cancelled appointment",
  "appointment.rescheduled": "Rescheduled appointment",
  "appointment.no_show": "Marked no-show",
  "appointment.visit_completed": "Completed visit",
  "doctor_message.replied": "Replied to doctor message",
};

function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admin/audit-log")
      .then((res) => setEntries(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Audit log</h2>
      <p className="text-xs text-ink/40 mb-4">
        A traceable record of who changed what — doctor edits, deletions, leave, cancellations, reschedules, and completed
        visits. Most recent 200 actions.
      </p>
      {loading ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink/50">No actions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink/50 uppercase tracking-wide border-b border-line">
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Details</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line/60">
                  <td className="py-2 pr-4">
                    {e.actorName} <span className="text-ink/40 text-xs">({e.actorRole.toLowerCase()})</span>
                  </td>
                  <td className="py-2 pr-4">{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink/50">
                    {e.targetType}
                    {e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ""}
                  </td>
                  <td className="py-2 pr-4 text-ink/60 text-xs">{e.details ?? "—"}</td>
                  <td className="py-2 text-ink/50 text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
