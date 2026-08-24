import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../api/client";
import { Button, Field, inputClass } from "./ui";

interface Props {
  appointmentId: string;
  doctorId: string;
  onClose: () => void;
  onDone: () => void;
}

export function RescheduleDialog({ appointmentId, doctorId, onClose, onDone }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadSlots(forDate: string) {
    setLoadingSlots(true);
    setSelectedSlot(null);
    setError(null);
    try {
      const res = await api.get(`/doctors/${doctorId}/slots`, { params: { date: forDate } });
      setSlots(res.data.slots);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    loadSlots(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/appointments/${appointmentId}/reschedule`, { slotStart: selectedSlot });
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
      loadSlots(date);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-6 animate-fade-in">
      <div className="glass-card bg-white rounded-xl shadow-card max-w-sm w-full p-6 animate-fade-in-scale">
        <h3 className="font-serif text-lg font-semibold mb-1">Reschedule appointment</h3>
        <p className="text-sm text-ink/60 mb-4">Pick a new date and time — your token number will update.</p>

        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setDate(e.target.value);
              loadSlots(e.target.value);
            }}
          />
        </Field>

        <div className="mt-4">
          {loadingSlots ? (
            <p className="text-sm text-ink/50">Loading available times…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-ink/50">No slots available this day — try another date.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {slots.map((s) => {
                const label = new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
                const active = selectedSlot === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSelectedSlot(s)}
                    className={`text-sm font-mono rounded-lg border px-2 py-2 transition-colors ${
                      active ? "bg-teal text-white border-teal" : "border-line hover:border-teal hover:bg-teal-light"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-coral mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selectedSlot || submitting}>
            {submitting ? "Saving…" : "Confirm new time"}
          </Button>
        </div>
      </div>
    </div>
  );
}
