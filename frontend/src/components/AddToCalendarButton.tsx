import { useState } from "react";
import { downloadIcsFile, googleCalendarUrl } from "../utils/calendar";

interface Props {
  title: string;
  description: string;
  startIso: string;
  endIso: string;
  uid: string;
}

export function AddToCalendarButton({ title, description, startIso, endIso, uid }: Props) {
  const [open, setOpen] = useState(false);
  const event = { title, description, startIso, endIso, uid };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-teal-light hover:border-teal/30 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        Add to calendar
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-56 glass-card rounded-lg shadow-card p-1.5 animate-fade-in">
          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md px-3 py-2 text-sm hover:bg-teal-light"
            onClick={() => setOpen(false)}
          >
            Google Calendar
          </a>
          <button
            onClick={() => {
              downloadIcsFile(event, "clinicassist-appointment.ics");
              setOpen(false);
            }}
            className="block w-full text-left rounded-md px-3 py-2 text-sm hover:bg-teal-light"
          >
            Apple Calendar / Outlook / other (.ics)
          </button>
        </div>
      )}
    </div>
  );
}
