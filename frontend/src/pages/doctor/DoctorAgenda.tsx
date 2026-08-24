import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { Button, Card, Field, inputClass, Skeleton, StatusBadge, UrgencyBadge } from "../../components/ui";

interface PreVisitSummary {
  urgency: string;
  chiefComplaint: string;
  suggestedQuestions: string[];
}

interface Appointment {
  id: string;
  status: string;
  slotStart: string;
  tokenNumber: number | null;
  patientMobile: string | null;
  symptomsText: string | null;
  preVisitSummary: PreVisitSummary | null;
  preVisitLlmFailed: boolean;
  patient: { name: string; email: string; bloodGroup?: string | null; allergies?: string | null; medicalConditions?: string | null };
}

export default function DoctorAgenda() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [queue, setQueue] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNotesFor, setActiveNotesFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [mineRes, queueRes] = await Promise.all([api.get("/appointments/mine"), api.get("/appointments/queue/today")]);
      setAppointments(mineRes.data);
      setQueue(queueRes.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function startConsultation(id: string) {
    setActioningId(id);
    try {
      await api.post(`/appointments/${id}/start`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setActioningId(null);
    }
  }

  async function markNoShow(id: string) {
    setActioningId(id);
    try {
      await api.post(`/appointments/${id}/no-show`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setActioningId(null);
    }
  }

  const upcoming = appointments
    .filter((a) => a.status === "CONFIRMED" || a.status === "IN_PROGRESS")
    .sort((a, b) => {
      if (a.tokenNumber != null && b.tokenNumber != null) return a.tokenNumber - b.tokenNumber;
      if (a.tokenNumber != null) return -1;
      if (b.tokenNumber != null) return 1;
      return new Date(a.slotStart).getTime() - new Date(b.slotStart).getTime();
    });
  const others = appointments.filter((a) => a.status !== "CONFIRMED" && a.status !== "IN_PROGRESS");

  const nowServing = queue.find((q) => q.status === "IN_PROGRESS");
  const waiting = queue.filter((q) => q.status === "CONFIRMED");

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-1">My agenda</h1>
      <p className="text-ink/60 mb-6">Today's queue and upcoming visits, with an AI-generated pre-visit brief for each patient.</p>

      {error && <p className="text-sm text-coral bg-coral-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {queue.length > 0 && (
            <Card className="glass-card">
              <h2 className="text-sm font-semibold text-ink/50 uppercase tracking-wide mb-3">Today's queue</h2>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs text-ink/50">Now serving</p>
                  {nowServing ? (
                    <p className="font-serif text-4xl font-bold text-teal-dark">
                      #{nowServing.tokenNumber}
                      <span className="text-sm font-sans font-normal text-ink/60 ml-2">{nowServing.patient.name}</span>
                    </p>
                  ) : (
                    <p className="text-ink/40 text-sm mt-1">No one in consultation</p>
                  )}
                </div>
                <div className="text-sm text-ink/60">
                  Waiting: {waiting.length === 0 ? "none" : waiting.map((w) => `#${w.tokenNumber}`).join(", ")}
                </div>
              </div>
              {waiting.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {waiting.map((w) => (
                    <div key={w.id} className="flex items-center gap-2 border border-line rounded-lg px-3 py-1.5 bg-white">
                      <span className="font-mono text-sm font-semibold">#{w.tokenNumber}</span>
                      <span className="text-sm">{w.patient.name}</span>
                      <button
                        disabled={actioningId === w.id || !!nowServing}
                        onClick={() => startConsultation(w.id)}
                        className="text-xs font-semibold text-teal hover:underline disabled:opacity-40"
                        title={nowServing ? "Complete the current consultation first" : "Call this patient in"}
                      >
                        Call in
                      </button>
                      <button
                        disabled={actioningId === w.id}
                        onClick={() => markNoShow(w.id)}
                        className="text-xs font-semibold text-coral hover:underline disabled:opacity-40"
                      >
                        No-show
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {upcoming.length === 0 && (
            <Card>
              <p className="text-sm text-ink/50">No upcoming confirmed visits.</p>
            </Card>
          )}
          {upcoming.map((a) => (
            <Card key={a.id} className={`card-hover ${a.preVisitSummary?.urgency === "High" ? "border-l-4 border-l-coral" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.tokenNumber && <span className="badge bg-ink/5 text-ink/70 font-mono">#{a.tokenNumber}</span>}
                    <p className="font-semibold">{a.patient.name}</p>
                    {a.status === "IN_PROGRESS" && <span className="badge bg-teal text-white">In consultation</span>}
                    {a.preVisitSummary && <UrgencyBadge urgency={a.preVisitSummary.urgency} />}
                    {a.preVisitLlmFailed && (
                      <span className="badge bg-amber-light text-amber">AI summary unavailable — see raw notes</span>
                    )}
                  </div>
                  <p className="text-sm font-mono text-ink/60 mt-0.5">
                    {new Date(a.slotStart).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                    {a.patientMobile && <span className="ml-3 text-ink/50">📞 {a.patientMobile}</span>}
                  </p>

                  {(a.patient.bloodGroup || a.patient.allergies || a.patient.medicalConditions) && (
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      {a.patient.bloodGroup && <span className="badge bg-ink/5 text-ink/70">Blood type {a.patient.bloodGroup}</span>}
                      {a.patient.allergies && <span className="badge bg-coral-light text-coral">Allergies: {a.patient.allergies}</span>}
                      {a.patient.medicalConditions && (
                        <span className="badge bg-amber-light text-amber">History: {a.patient.medicalConditions}</span>
                      )}
                    </div>
                  )}
                  {a.preVisitSummary && (
                    <div className="mt-3 bg-teal-light/40 border border-teal/20 rounded-lg p-3">
                      <p className="text-sm font-medium text-ink/80">{a.preVisitSummary.chiefComplaint}</p>
                      {a.preVisitSummary.suggestedQuestions?.length > 0 && (
                        <ul className="mt-2 text-sm text-ink/70 list-disc list-inside space-y-0.5">
                          {a.preVisitSummary.suggestedQuestions.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {a.symptomsText && (
                    <details className="mt-2">
                      <summary className="text-xs text-ink/40 cursor-pointer">Raw patient notes</summary>
                      <p className="text-sm text-ink/60 mt-1">{a.symptomsText}</p>
                    </details>
                  )}
                  <button
                    onClick={() => setHistoryFor(historyFor === a.id ? null : a.id)}
                    className="text-xs text-teal font-medium mt-2 hover:underline"
                  >
                    {historyFor === a.id ? "Hide patient history" : "View patient history"}
                  </button>
                  {historyFor === a.id && <PatientHistory appointmentId={a.id} />}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {a.status === "CONFIRMED" && (
                    <Button variant="secondary" disabled={actioningId === a.id || !!nowServing} onClick={() => startConsultation(a.id)}>
                      Start consultation
                    </Button>
                  )}
                  <Button onClick={() => setActiveNotesFor(activeNotesFor === a.id ? null : a.id)}>
                    {activeNotesFor === a.id ? "Close" : "Complete visit"}
                  </Button>
                </div>
              </div>
              {activeNotesFor === a.id && (
                <VisitNotesForm
                  appointmentId={a.id}
                  onDone={() => {
                    setActiveNotesFor(null);
                    load();
                  }}
                />
              )}
            </Card>
          ))}

          {others.length > 0 && (
            <div className="pt-2">
              <h2 className="text-sm font-semibold text-ink/50 uppercase tracking-wide mb-3">Other appointments</h2>
              <div className="space-y-2">
                {others.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border border-line rounded-lg p-3 bg-white">
                    <div>
                      <p className="text-sm font-medium">{a.patient.name}</p>
                      <p className="text-xs font-mono text-ink/50">
                        {new Date(a.slotStart).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PatientHistory({ appointmentId }: { appointmentId: string }) {
  const [history, setHistory] = useState<
    Array<{
      id: string;
      slotStart: string;
      doctorName: string;
      doctorNotes: string | null;
      prescription: Array<{ medication: string; strength?: string; dosage: string }> | null;
      followUpRecommended: boolean;
      followUpAfterDays: number | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/appointments/${appointmentId}/history`)
      .then((res) => setHistory(res.data))
      .finally(() => setLoading(false));
  }, [appointmentId]);

  if (loading) return <p className="text-xs text-ink/40 mt-2">Loading history…</p>;
  if (history.length === 0) return <p className="text-xs text-ink/40 mt-2">No previous completed visits on record.</p>;

  return (
    <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
      {history.map((h) => (
        <div key={h.id} className="text-sm">
          <p className="font-medium text-ink/70">
            {new Date(h.slotStart).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}
            <span className="text-ink/40 font-normal"> · Dr. {h.doctorName}</span>
          </p>
          {h.doctorNotes && <p className="text-ink/60 mt-0.5">{h.doctorNotes}</p>}
          {h.prescription && h.prescription.length > 0 && (
            <p className="text-xs font-mono text-ink/50 mt-0.5">
              {h.prescription.map((p) => `${p.medication}${p.strength ? ` (${p.strength})` : ""}`).join(", ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

interface PrescriptionRow {
  medication: string;
  strength: string;
  dosage: string;
  frequencyPerDay: number;
  durationDays: number;
  foodTiming: "" | "before" | "after";
  instructions: string;
}

const emptyRow: PrescriptionRow = {
  medication: "",
  strength: "",
  dosage: "",
  frequencyPerDay: 2,
  durationDays: 5,
  foodTiming: "after",
  instructions: "",
};

function VisitNotesForm({ appointmentId, onDone }: { appointmentId: string; onDone: () => void }) {
  const [doctorNotes, setDoctorNotes] = useState("");
  const [rows, setRows] = useState<PrescriptionRow[]>([{ ...emptyRow }]);
  const [followUpRecommended, setFollowUpRecommended] = useState(false);
  const [followUpAfterDays, setFollowUpAfterDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(i: number, patch: Partial<PrescriptionRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const prescription = rows
        .filter((r) => r.medication.trim().length > 0)
        .map((r) => ({ ...r, foodTiming: r.foodTiming || undefined, instructions: r.instructions || undefined }));
      await api.post(`/appointments/${appointmentId}/visit-notes`, {
        doctorNotes,
        prescription,
        followUpRecommended,
        followUpAfterDays: followUpRecommended ? followUpAfterDays : undefined,
      });
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4 space-y-4">
      <Field label="Clinical notes">
        <textarea
          className={`${inputClass} min-h-[100px]`}
          value={doctorNotes}
          onChange={(e) => setDoctorNotes(e.target.value)}
          placeholder="Diagnosis, findings, and instructions..."
        />
      </Field>

      <div>
        <p className="text-sm font-medium text-ink/80 mb-1">Prescription</p>
        <p className="text-xs text-ink/40 mb-3">Example: Paracetamol · 500 mg · 1 tablet · 2 times a day · 5 days · After food</p>
        <div className="space-y-4">
          {rows.map((r, i) => (
            <div key={i} className="border border-line rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="Medicine name">
                  <input
                    className={inputClass}
                    placeholder="e.g. Paracetamol"
                    value={r.medication}
                    onChange={(e) => updateRow(i, { medication: e.target.value })}
                  />
                </Field>
                <Field label="Strength">
                  <input className={inputClass} placeholder="e.g. 500 mg" value={r.strength} onChange={(e) => updateRow(i, { strength: e.target.value })} />
                </Field>
                <Field label="Dosage">
                  <input
                    className={inputClass}
                    placeholder="e.g. 1 tablet"
                    value={r.dosage}
                    onChange={(e) => updateRow(i, { dosage: e.target.value })}
                  />
                </Field>
                <Field label="Frequency (times/day)">
                  <input
                    type="number"
                    min={1}
                    max={6}
                    className={inputClass}
                    value={r.frequencyPerDay}
                    onChange={(e) => updateRow(i, { frequencyPerDay: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Field label="Duration (days)">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className={inputClass}
                    value={r.durationDays}
                    onChange={(e) => updateRow(i, { durationDays: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Timing">
                  <select className={inputClass} value={r.foodTiming} onChange={(e) => updateRow(i, { foodTiming: e.target.value as any })}>
                    <option value="after">After food</option>
                    <option value="before">Before food</option>
                    <option value="">No preference</option>
                  </select>
                </Field>
                <Field label="Instructions (optional)">
                  <input
                    className={inputClass}
                    placeholder="e.g. Avoid alcohol"
                    value={r.instructions}
                    onChange={(e) => updateRow(i, { instructions: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <button className="text-xs text-teal font-medium mt-2 hover:underline" onClick={() => setRows([...rows, { ...emptyRow }])}>
          + Add another medicine
        </button>
      </div>

      <div className="border border-line rounded-lg p-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-teal w-4 h-4"
            checked={followUpRecommended}
            onChange={(e) => setFollowUpRecommended(e.target.checked)}
          />
          <span className="text-sm font-medium">Recommend a follow-up visit</span>
        </label>
        {followUpRecommended && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-ink/60">After</span>
            <input
              type="number"
              min={1}
              max={365}
              className={`${inputClass} w-20`}
              value={followUpAfterDays}
              onChange={(e) => setFollowUpAfterDays(Number(e.target.value))}
            />
            <span className="text-sm text-ink/60">days</span>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-coral">{error}</p>}
      <Button disabled={doctorNotes.trim().length < 3 || submitting} onClick={submit}>
        {submitting ? "Generating summary…" : "Finish visit & send summary"}
      </Button>
    </div>
  );
}
