import { useEffect, useState } from "react";
import { api, extractErrorMessage, downloadAuthedFile } from "../../api/client";
import { Button, Card, Field, inputClass, Skeleton, StatusBadge } from "../../components/ui";
import { AddToCalendarButton } from "../../components/AddToCalendarButton";
import { RescheduleDialog } from "../../components/RescheduleDialog";

interface Prescription {
  medication: string;
  strength?: string;
  dosage: string;
  frequencyPerDay: number;
  durationDays: number;
  foodTiming?: string;
  instructions?: string;
}

interface Appointment {
  id: string;
  status: string;
  slotStart: string;
  slotEnd: string;
  tokenNumber: number | null;
  doctor: { id: string; name: string; specialization: string };
  postVisitSummary: string | null;
  prescription: Prescription[] | null;
  followUpRecommended?: boolean;
  followUpAfterDays?: number | null;
  cancellationReason?: string | null;
  readByPatient?: boolean;
}

const CANCEL_REASONS = ["Doctor unavailable", "Change of plans", "Found another doctor", "Appointment timing issue", "Emergency", "Other"];

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: string; doctorId: string } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/appointments/mine");
      setAppointments(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, readByPatient: true } : a)));
    try {
      await api.post(`/appointments/${id}/mark-read`);
    } catch {
      // badge-clearing is best-effort — worst case it re-shows on next load
    }
  }

  async function downloadPdf(id: string) {
    setDownloadingId(id);
    try {
      await downloadAuthedFile(`/appointments/${id}/prescription-pdf`, `prescription-${id.slice(0, 8)}.pdf`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-serif text-3xl font-semibold mb-6">My appointments</h1>
      {error && <p className="text-sm text-coral bg-coral-light rounded-lg px-3 py-2 mb-4">{error}</p>}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : appointments.length === 0 ? (
        <Card>
          <p className="text-sm text-ink/50">You don't have any appointments yet.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {appointments.map((a) => (
            <li key={a.id}>
              <Card className="card-hover">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.tokenNumber && <span className="badge bg-ink/5 text-ink/70 font-mono">Token #{a.tokenNumber}</span>}
                      <p className="font-semibold">Dr. {a.doctor?.name}</p>
                    </div>
                    <p className="text-sm text-ink/60">{a.doctor?.specialization}</p>
                    <p className="text-sm font-mono text-ink/70 mt-1">
                      {new Date(a.slotStart).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {a.readByPatient === false && (
                      <span className="inline-flex items-center gap-1 badge bg-coral-light text-coral">
                        <span className="w-1.5 h-1.5 rounded-full bg-coral pulse-dot" /> New
                      </span>
                    )}
                    <StatusBadge status={a.status} />
                  </div>
                </div>

                {(a.status === "CONFIRMED" || a.status === "IN_PROGRESS") && <QueueStatus appointmentId={a.id} status={a.status} />}

                <div className="flex gap-2 mt-3 flex-wrap">
                  {a.status === "CONFIRMED" && (
                    <>
                      <Button variant="danger" onClick={() => setCancelTarget(a.id)}>
                        Cancel
                      </Button>
                      <Button variant="secondary" onClick={() => setRescheduleTarget({ id: a.id, doctorId: a.doctor.id })}>
                        Reschedule
                      </Button>
                      <AddToCalendarButton
                        title={`Appointment with Dr. ${a.doctor?.name}`}
                        description="Booked via ClinicAssist."
                        startIso={a.slotStart}
                        endIso={a.slotEnd}
                        uid={a.id}
                      />
                    </>
                  )}
                  {a.status === "HOLD" && (
                    <Button variant="danger" onClick={() => setCancelTarget(a.id)}>
                      Cancel
                    </Button>
                  )}
                  {a.status === "RESCHEDULE_NEEDED" && (
                    <p className="text-sm text-coral">Your doctor is unavailable — please book a new time.</p>
                  )}
                  {a.status === "CANCELLED" && a.cancellationReason && (
                    <p className="text-xs text-ink/40">Cancellation reason: {a.cancellationReason}</p>
                  )}
                  {a.status === "COMPLETED" && a.postVisitSummary && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const opening = expanded !== a.id;
                        setExpanded(opening ? a.id : null);
                        if (opening && a.readByPatient === false) markRead(a.id);
                      }}
                    >
                      {expanded === a.id ? "Hide visit summary" : "View visit summary"}
                    </Button>
                  )}
                  {a.status === "COMPLETED" && a.prescription && a.prescription.length > 0 && (
                    <Button
                      variant="secondary"
                      disabled={downloadingId === a.id}
                      onClick={() => {
                        if (a.readByPatient === false) markRead(a.id);
                        downloadPdf(a.id);
                      }}
                    >
                      {downloadingId === a.id ? "Preparing…" : "Download prescription PDF"}
                    </Button>
                  )}
                </div>

                {expanded === a.id && a.postVisitSummary && (
                  <div className="mt-4 border-t border-line pt-4">
                    <p className="text-sm whitespace-pre-line text-ink/80">{a.postVisitSummary}</p>
                    {a.followUpRecommended && a.followUpAfterDays && (
                      <p className="mt-3 text-sm text-amber bg-amber-light rounded-lg px-3 py-2">
                        Your doctor recommended a follow-up visit in about {a.followUpAfterDays} day{a.followUpAfterDays === 1 ? "" : "s"}.
                      </p>
                    )}
                    {a.prescription && a.prescription.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">Prescription</p>
                        <ul className="text-sm space-y-2">
                          {a.prescription.map((p, i) => (
                            <li key={i} className="border border-line rounded-lg p-2.5">
                              <p className="font-medium">
                                {p.medication} {p.strength && <span className="text-ink/50 font-normal">({p.strength})</span>}
                              </p>
                              <p className="text-xs font-mono text-ink/60 mt-0.5">
                                {p.dosage} · {p.frequencyPerDay}x/day · {p.durationDays} days
                                {p.foodTiming && ` · ${p.foodTiming === "after" ? "After food" : "Before food"}`}
                              </p>
                              {p.instructions && <p className="text-xs text-ink/50 mt-0.5">{p.instructions}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {cancelTarget && (
        <CancelDialog
          appointmentId={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={() => {
            setCancelTarget(null);
            load();
          }}
        />
      )}

      {rescheduleTarget && (
        <RescheduleDialog
          appointmentId={rescheduleTarget.id}
          doctorId={rescheduleTarget.doctorId}
          onClose={() => setRescheduleTarget(null)}
          onDone={() => {
            setRescheduleTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function QueueStatus({ appointmentId, status }: { appointmentId: string; status: string }) {
  const [queue, setQueue] = useState<{ tokenNumber: number | null; nowServing: number | null; patientsAhead: number; estimatedWaitMinutes: number } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await api.get(`/appointments/${appointmentId}/queue-status`);
        if (!cancelled) setQueue(res.data);
      } catch {
        // non-critical
      }
    }
    poll();
    const interval = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appointmentId]);

  if (!queue || !queue.tokenNumber) return null;

  return (
    <div className="mt-3 bg-teal-light/40 border border-teal/20 rounded-lg p-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <span>
        Your token: <strong className="font-mono">#{queue.tokenNumber}</strong>
      </span>
      <span>
        Now serving:{" "}
        <strong className="font-mono">{status === "IN_PROGRESS" ? "You" : queue.nowServing ? `#${queue.nowServing}` : "—"}</strong>
      </span>
      {status !== "IN_PROGRESS" && (
        <>
          <span>
            Patients ahead: <strong>{queue.patientsAhead}</strong>
          </span>
          {queue.estimatedWaitMinutes > 0 && (
            <span>
              Est. wait: <strong>~{queue.estimatedWaitMinutes} min</strong>
            </span>
          )}
        </>
      )}
    </div>
  );
}

function CancelDialog({ appointmentId, onClose, onDone }: { appointmentId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/appointments/${appointmentId}/cancel`, {
        reason,
        customReason: reason === "Other" ? customReason : undefined,
      });
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-6 animate-fade-in">
      <div className="glass-card bg-white rounded-xl shadow-card max-w-sm w-full p-6 animate-fade-in-scale">
        <h3 className="font-serif text-lg font-semibold mb-1">Cancel this appointment?</h3>
        <p className="text-sm text-ink/60 mb-4">Letting us know why helps the clinic improve — this step is optional but appreciated.</p>
        <Field label="Reason (optional)">
          <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        {reason === "Other" && (
          <div className="mt-3">
            <Field label="Tell us more">
              <input className={inputClass} value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
            </Field>
          </div>
        )}
        {error && <p className="text-sm text-coral mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Keep appointment
          </Button>
          <Button variant="danger" onClick={submit} disabled={submitting}>
            {submitting ? "Cancelling…" : "Cancel appointment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
