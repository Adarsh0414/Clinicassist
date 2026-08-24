import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { Button, Card, Field, inputClass } from "../../components/ui";
import { ChangePasswordCard } from "../../components/ChangePasswordCard";

const WEEKDAYS = [
  { key: "MON", label: "Monday" },
  { key: "TUE", label: "Tuesday" },
  { key: "WED", label: "Wednesday" },
  { key: "THU", label: "Thursday" },
  { key: "FRI", label: "Friday" },
  { key: "SAT", label: "Saturday" },
  { key: "SUN", label: "Sunday" },
];

interface WorkingHours {
  [day: string]: { start: string; end: string } | undefined;
}

interface DoctorProfileData {
  name: string;
  email: string;
  phone: string | null;
  specialization: string;
  slotDurationMinutes: number;
  workingHours: WorkingHours;
  bio: string | null;
  qualifications: string | null;
  yearsOfExperience: number | null;
  consultationFee: string | null;
}

export default function DoctorProfile() {
  const [data, setData] = useState<DoctorProfileData | null>(null);
  const [form, setForm] = useState<Partial<DoctorProfileData>>({});
  const [hours, setHours] = useState<WorkingHours>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [leaveStartDate, setLeaveStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [leaveEndDate, setLeaveEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveResult, setLeaveResult] = useState<string | null>(null);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaves, setLeaves] = useState<Array<{ id: string; date: string; reason: string | null }>>([]);
  const [leaveRequests, setLeaveRequests] = useState<
    Array<{ id: string; startDate: string; endDate: string; reason: string | null; status: string; adminNote: string | null; createdAt: string }>
  >([]);

  useEffect(() => {
    load();
    loadLeaves();
    loadLeaveRequests();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/doctors/me");
      setData(res.data);
      setForm(res.data);
      setHours(res.data.workingHours ?? {});
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadLeaves() {
    try {
      const res = await api.get("/doctors/me/leave");
      setLeaves(res.data);
    } catch {
      // non-critical
    }
  }

  async function loadLeaveRequests() {
    try {
      const res = await api.get("/doctors/me/leave-requests");
      setLeaveRequests(res.data);
    } catch {
      // non-critical
    }
  }

  function toggleDay(day: string, enabled: boolean) {
    setHours((prev) => {
      const next = { ...prev };
      if (enabled) next[day] = next[day] ?? { start: "09:00", end: "17:00" };
      else delete next[day];
      return next;
    });
  }

  function updateDayTime(day: string, field: "start" | "end", value: string) {
    setHours((prev) => ({ ...prev, [day]: { ...(prev[day] ?? { start: "09:00", end: "17:00" }), [field]: value } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await Promise.all([
        api.patch("/auth/me", { phone: form.phone }),
        api.patch("/doctors/me", {
          specialization: form.specialization,
          slotDurationMinutes: form.slotDurationMinutes,
          workingHours: hours,
          bio: form.bio,
          qualifications: form.qualifications,
          yearsOfExperience: form.yearsOfExperience,
          consultationFee: form.consultationFee,
        }),
      ]);
      setSuccess("Profile and availability updated.");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitLeave() {
    setLeaveSubmitting(true);
    setLeaveResult(null);
    setError(null);
    try {
      const res = await api.post("/doctors/me/leave-requests", { startDate: leaveStartDate, endDate: leaveEndDate, reason: leaveReason });
      setLeaveResult(res.data.message);
      setLeaveReason("");
      loadLeaveRequests();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLeaveSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-ink/50">Loading profile…</p>;
  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="font-serif text-3xl font-semibold mb-1">My profile &amp; availability</h1>
      <p className="text-ink/60 mb-6">Patients see this info when booking. Update your own schedule any time — no admin needed.</p>

      <div className="space-y-4">
        <Card className="glass-card">
          <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-ink/50">Profile</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name">
              <input className={`${inputClass} opacity-70`} value={data.name} disabled />
            </Field>
            <Field label="Email">
              <input className={`${inputClass} opacity-70`} value={data.email} disabled />
            </Field>
            <Field label="Phone">
              <input className={inputClass} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Specialization">
              <input
                className={inputClass}
                value={form.specialization ?? ""}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })}
              />
            </Field>
            <Field label="Qualifications">
              <input
                className={inputClass}
                placeholder="e.g. MBBS, MD"
                value={form.qualifications ?? ""}
                onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
              />
            </Field>
            <Field label="Years of experience">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.yearsOfExperience ?? ""}
                onChange={(e) => setForm({ ...form, yearsOfExperience: Number(e.target.value) })}
              />
            </Field>
            <Field label="Consultation fee">
              <input
                className={inputClass}
                placeholder="e.g. $50"
                value={form.consultationFee ?? ""}
                onChange={(e) => setForm({ ...form, consultationFee: e.target.value })}
              />
            </Field>
            <Field label="Slot duration (minutes)">
              <input
                type="number"
                min={5}
                className={inputClass}
                value={form.slotDurationMinutes ?? 30}
                onChange={(e) => setForm({ ...form, slotDurationMinutes: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Bio">
              <textarea
                className={`${inputClass} min-h-[80px]`}
                value={form.bio ?? ""}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card className="glass-card">
          <h2 className="font-semibold mb-1 text-sm uppercase tracking-wide text-ink/50">Weekly availability</h2>
          <p className="text-xs text-ink/40 mb-4">Toggle the days you work and set your hours. All times are in UTC.</p>
          <div className="space-y-2">
            {WEEKDAYS.map(({ key, label }) => {
              const enabled = !!hours[key];
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    enabled ? "border-teal/30 bg-teal-light/40" : "border-line"
                  }`}
                >
                  <label className="flex items-center gap-2 w-32 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => toggleDay(key, e.target.checked)}
                      className="accent-teal w-4 h-4"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                  {enabled ? (
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="time"
                        className="rounded-md border border-line px-2 py-1 font-mono text-sm"
                        value={hours[key]?.start ?? "09:00"}
                        onChange={(e) => updateDayTime(key, "start", e.target.value)}
                      />
                      <span className="text-ink/40">to</span>
                      <input
                        type="time"
                        className="rounded-md border border-line px-2 py-1 font-mono text-sm"
                        value={hours[key]?.end ?? "17:00"}
                        onChange={(e) => updateDayTime(key, "end", e.target.value)}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-ink/40">Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {error && <p className="text-sm text-coral bg-coral-light rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-teal-dark bg-teal-light rounded-lg px-3 py-2">{success}</p>}
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save profile & availability"}
        </Button>

        <Card className="glass-card">
          <h2 className="font-semibold mb-1 text-sm uppercase tracking-wide text-ink/50">Request time off</h2>
          <p className="text-xs text-ink/40 mb-4">
            A single day, or a longer stretch. Your request goes to the admin for approval — it only takes effect,
            and patients are only notified, once they approve it.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="From">
              <input
                type="date"
                className={inputClass}
                value={leaveStartDate}
                onChange={(e) => {
                  setLeaveStartDate(e.target.value);
                  if (e.target.value > leaveEndDate) setLeaveEndDate(e.target.value);
                }}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={inputClass}
                min={leaveStartDate}
                value={leaveEndDate}
                onChange={(e) => setLeaveEndDate(e.target.value)}
              />
            </Field>
            <Field label="Reason (optional)">
              <input className={inputClass} value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
            </Field>
          </div>
          {leaveResult && <p className="text-sm text-teal-dark mt-3">{leaveResult}</p>}
          <Button variant="secondary" className="mt-3" disabled={leaveSubmitting} onClick={submitLeave}>
            {leaveSubmitting ? "Sending…" : "Send request to admin"}
          </Button>

          {leaveRequests.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">Your requests</p>
              <ul className="text-sm space-y-2">
                {leaveRequests.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2">
                    <div>
                      <span className="font-mono text-ink/70">
                        {new Date(r.startDate).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}
                        {r.endDate !== r.startDate
                          ? ` – ${new Date(r.endDate).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}`
                          : ""}
                      </span>
                      {r.reason && <span className="text-ink/50"> — {r.reason}</span>}
                      {r.status === "REJECTED" && r.adminNote && (
                        <p className="text-xs text-coral mt-1">Admin note: {r.adminNote}</p>
                      )}
                    </div>
                    <span
                      className={`badge whitespace-nowrap ${
                        r.status === "APPROVED"
                          ? "bg-teal-light text-teal-dark"
                          : r.status === "REJECTED"
                          ? "bg-coral-light text-coral"
                          : "bg-amber-light text-amber"
                      }`}
                    >
                      {r.status === "PENDING" ? "Awaiting approval" : r.status === "APPROVED" ? "Approved" : "Declined"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {leaves.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">Upcoming approved leave days</p>
              <ul className="text-sm space-y-1">
                {leaves
                  .filter((l) => new Date(l.date) >= new Date(new Date().toDateString()))
                  .map((l) => (
                    <li key={l.id} className="font-mono text-ink/70">
                      {new Date(l.date).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}
                      {l.reason ? ` — ${l.reason}` : ""}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Card>

        <ChangePasswordCard />
      </div>
    </div>
  );
}
