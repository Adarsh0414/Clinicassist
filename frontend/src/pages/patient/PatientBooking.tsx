import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { Button, Card, Field, inputClass, HeartPulse } from "../../components/ui";
import { AddToCalendarButton } from "../../components/AddToCalendarButton";
import { isAvailableNow, summarizeWorkingHours, worksToday, WorkingHours } from "../../utils/availability";

interface Doctor {
  id: string;
  name: string;
  specialization: string;
  bio?: string;
  workingHours?: WorkingHours;
}

type Step = "choose-doctor" | "choose-slot" | "symptoms" | "confirmed";

export default function PatientBooking() {
  const [step, setStep] = useState<Step>("choose-doctor");
  const [specialization, setSpecialization] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [symptoms, setSymptoms] = useState("");
  const [mobile, setMobile] = useState("");
  const [booking, setBooking] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] = useState<any | null>(null);

  useEffect(() => {
    loadDoctors();
  }, []);

  async function loadDoctors(spec?: string) {
    setLoadingDoctors(true);
    setError(null);
    try {
      const res = await api.get("/doctors", { params: spec ? { specialization: spec } : undefined });
      setDoctors(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingDoctors(false);
    }
  }

  async function chooseDoctor(doc: Doctor) {
    setSelectedDoctor(doc);
    setStep("choose-slot");
    await loadSlots(doc.id, date);
  }

  async function loadSlots(doctorId: string, forDate: string) {
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

  async function confirmBooking() {
    if (!selectedDoctor || !selectedSlot) return;
    setBooking(true);
    setError(null);
    try {
      const res = await api.post("/appointments", {
        doctorId: selectedDoctor.id,
        slotStart: selectedSlot,
        symptomsText: symptoms,
        patientMobile: mobile.trim() || undefined,
      });
      setConfirmedAppointment(res.data);
      setStep("confirmed");
    } catch (err) {
      setError(extractErrorMessage(err));
      // Slot may have just been taken — refresh the list so the patient can pick again.
      if (selectedDoctor) await loadSlots(selectedDoctor.id, date);
      setStep("choose-slot");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <HeartPulse />
        <h1 className="font-serif text-3xl font-semibold">Book a visit</h1>
      </div>
      <p className="text-ink/60 mb-6">Tell us what's going on and we'll get you in front of the right doctor.</p>

      <Steps current={step} />

      {error && <p className="text-sm text-coral bg-coral-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {step === "choose-doctor" && (
        <Card>
          <div className="flex gap-2 mb-4">
            <input
              className={inputClass}
              placeholder="Search by specialization (e.g. Cardiology)"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadDoctors(specialization)}
            />
            <Button variant="secondary" onClick={() => loadDoctors(specialization)}>
              Search
            </Button>
          </div>
          {loadingDoctors ? (
            <p className="text-sm text-ink/50">Loading doctors…</p>
          ) : doctors.length === 0 ? (
            <p className="text-sm text-ink/50">No doctors found. Try a different search.</p>
          ) : (
            <ul className="space-y-3">
              {doctors.map((doc) => {
                const hours = doc.workingHours ?? {};
                const availableToday = worksToday(hours);
                const availableNow = isAvailableNow(hours);
                return (
                  <li key={doc.id} className="border border-line rounded-lg p-4 flex items-center justify-between card-hover bg-white">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">Dr. {doc.name}</p>
                        {availableNow ? (
                          <span className="badge bg-teal-light text-teal-dark">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-dark pulse-dot" /> Available now
                          </span>
                        ) : availableToday ? (
                          <span className="badge bg-amber-light text-amber">Available today</span>
                        ) : (
                          <span className="badge bg-line text-ink/50">Not available today</span>
                        )}
                      </div>
                      <p className="text-sm text-ink/60">{doc.specialization}</p>
                      <p className="text-xs font-mono text-ink/40 mt-1">{summarizeWorkingHours(hours)}</p>
                      {doc.bio && <p className="text-xs text-ink/40 mt-1">{doc.bio}</p>}
                    </div>
                    <Button onClick={() => chooseDoctor(doc)}>Select</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {step === "choose-slot" && selectedDoctor && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold">Dr. {selectedDoctor.name}</p>
              <p className="text-sm text-ink/60">{selectedDoctor.specialization}</p>
            </div>
            <Button variant="secondary" onClick={() => setStep("choose-doctor")}>
              Change doctor
            </Button>
          </div>
          <Field label="Date">
            <input
              type="date"
              className={inputClass}
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setDate(e.target.value);
                loadSlots(selectedDoctor.id, e.target.value);
              }}
            />
          </Field>
          <div className="mt-4">
            {loadingSlots ? (
              <p className="text-sm text-ink/50">Loading available times…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-ink/50">No slots available this day — try another date.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((s) => {
                  const label = new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
                  const active = selectedSlot === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedSlot(s)}
                      className={`text-sm font-mono rounded-lg border px-2 py-2 transition-all btn-press ${
                        active ? "bg-teal text-white border-teal shadow-md scale-105" : "border-line hover:border-teal hover:bg-teal-light hover:-translate-y-0.5"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Button className="mt-5 w-full" disabled={!selectedSlot} onClick={() => setStep("symptoms")}>
            Continue
          </Button>
        </Card>
      )}

      {step === "symptoms" && selectedDoctor && selectedSlot && (
        <Card>
          <p className="text-sm text-ink/60 mb-3">
            Dr. {selectedDoctor.name} ·{" "}
            {new Date(selectedSlot).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
          </p>
          <Field label="Describe your symptoms">
            <textarea
              className={`${inputClass} min-h-[140px]`}
              placeholder="e.g. Dry cough and mild fever for 3 days, worse at night, no shortness of breath..."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
          </Field>
          <p className="text-xs text-ink/40 mt-2">
            Your doctor will see an AI-generated summary of this before your visit, including an urgency flag — this helps
            them prepare, but doesn't replace calling emergency services for anything urgent.
          </p>
          <div className="mt-4">
            <Field label="Mobile number (optional)">
              <input
                className={inputClass}
                type="tel"
                placeholder="+1 555 123 4567"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
            </Field>
            <p className="text-xs text-ink/40 mt-1.5">
              Optional. It may be used by the doctor to contact you directly about this appointment or in case of an urgent
              update. You can book without providing one.
            </p>
          </div>
          <div className="flex gap-2 mt-5">
            <Button variant="secondary" onClick={() => setStep("choose-slot")}>
              Back
            </Button>
            <Button className="flex-1" disabled={symptoms.trim().length < 3 || booking} onClick={confirmBooking}>
              {booking ? "Confirming…" : "Confirm appointment"}
            </Button>
          </div>
        </Card>
      )}

      {step === "confirmed" && confirmedAppointment && (
        <Card className="text-center animate-fade-in-scale">
          <div className="w-10 h-10 rounded-full bg-teal-light text-teal flex items-center justify-center mx-auto mb-3 font-bold">
            ✓
          </div>
          <h2 className="font-serif text-xl font-semibold mb-1">You're booked</h2>
          {confirmedAppointment.tokenNumber && (
            <p className="font-mono text-sm text-teal-dark bg-teal-light inline-block px-3 py-1 rounded-full mb-2">
              Your token: #{confirmedAppointment.tokenNumber}
            </p>
          )}
          <p className="text-sm text-ink/60 mb-4">
            {new Date(confirmedAppointment.slotStart).toLocaleString("en-US", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "UTC",
            })}{" "}
            UTC with Dr. {confirmedAppointment.doctor?.name}
          </p>
          <p className="text-xs text-ink/40 mb-5">A confirmation email is on its way. We'll remind you before your visit.</p>
          <div className="flex items-center justify-center gap-2 mb-5">
            <AddToCalendarButton
              title={`Appointment with Dr. ${confirmedAppointment.doctor?.name}`}
              description="Booked via ClinicAssist."
              startIso={confirmedAppointment.slotStart}
              endIso={confirmedAppointment.slotEnd}
              uid={confirmedAppointment.id}
            />
          </div>
          <Button
            onClick={() => {
              setStep("choose-doctor");
              setSelectedDoctor(null);
              setSelectedSlot(null);
              setSymptoms("");
              setMobile("");
              setConfirmedAppointment(null);
            }}
          >
            Book another visit
          </Button>
        </Card>
      )}
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const order: Step[] = ["choose-doctor", "choose-slot", "symptoms", "confirmed"];
  const labels: Record<Step, string> = {
    "choose-doctor": "Doctor",
    "choose-slot": "Time",
    symptoms: "Symptoms",
    confirmed: "Done",
  };
  const currentIndex = order.indexOf(current);
  return (
    <div className="flex items-center gap-2 mb-6">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              i <= currentIndex ? "bg-teal text-white" : "bg-line text-ink/40"
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-xs font-medium ${i <= currentIndex ? "text-ink" : "text-ink/40"}`}>{labels[s]}</span>
          {i < order.length - 1 && <div className="w-6 h-px bg-line" />}
        </div>
      ))}
    </div>
  );
}
