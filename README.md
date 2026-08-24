# ClinicAssist — Smart Healthcare Appointment & Follow-up Management

A healthcare appointment platform with separate portals for **patients**, **doctors**, and an
**admin**. Patients book appointments and describe symptoms in advance; doctors get an
AI-generated pre-visit brief and dictate post-visit notes that are turned into a
patient-friendly summary; both sides get email and Google Calendar updates automatically.

```
ham/
├── backend/     Express + TypeScript API, Prisma ORM (PostgreSQL), background jobs
├── frontend/    React + Vite + TypeScript, three role-based portals
└── docs/        System design write-up
```

## 1. Quick start

### Prerequisites
- Node.js 18+
- npm
- PostgreSQL running locally (or any Postgres connection string you already have)

### Backend

```bash
cd backend

# Create a database (skip if you already have one you want to use):
createdb clinicassist

cp .env.example .env
# Edit DATABASE_URL to match your local Postgres, e.g.:
#   DATABASE_URL="postgresql://localhost:5432/clinicassist"
# or, if your setup needs a user/password:
#   DATABASE_URL="postgresql://your_username:your_password@localhost:5432/clinicassist"
# Also fill in GEMINI_API_KEY etc. — see below for what's optional.

npm install
npx prisma migrate dev --name init   # applies the schema to your Postgres database
npm run prisma:seed                  # creates a demo admin, doctor, and patient
npm run dev                          # http://localhost:4000
```

> **Already ran this before and pulled a newer version of this project?** The schema grew
> new fields (patient medical conditions/reminder preference, doctor qualifications/
> experience/fee, and email-verification/OTP fields on the account itself). Just run
> `npx prisma migrate dev --name add_profile_and_auth_fields` again — Prisma detects the
> diff and generates an additive migration; no data is lost.

### Frontend

```bash
cd frontend
cp .env.example .env   # optional — only needed for Google Sign-In, see below
npm install
npm run dev                          # http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173 and sign in with one of the seeded accounts (also shown on the
login screen):

| Role    | Email                        | Password         |
|---------|-------------------------------|-------------------|
| Admin   | admin@clinicassist.example    | AdminPass123!     |
| Doctor  | dr.sarah@clinicassist.example | DoctorPass123!    |
| Patient | patient@example.com           | PatientPass123!   |

Seeded demo accounts are pre-verified so they skip the OTP step. Patients can also
self-register from the login screen (this does go through OTP verification). Doctors and
admins are provisioned by an existing admin (seed script creates the first one).

### What works with zero configuration
- Booking, slot availability, double-booking protection, cancellation
- Leave scheduling (by admin **or** by the doctor themselves) and automatic patient notification
- Patient, doctor, and admin self-service profiles, including patient-reported medical
  conditions/allergies visible to the doctor
- Doctor self-service weekly availability editor
- Email + password sign-up with OTP email verification, forgot/reset/change password
- Add-to-calendar (Google link + universal `.ics` download) on every booking
- Installable PWA — "Add to Home Screen" on mobile, works offline for the app shell
- Email — falls back to a free [Ethereal](https://ethereal.email) test inbox in development;
  a preview link for every email (including OTP codes) is printed to the backend console
- LLM summaries — fall back to a clear, safe placeholder if `GEMINI_API_KEY` is unset

### What needs configuration
- **`DATABASE_URL`**: point it at your local Postgres (see above)
- **Real AI summaries**: set `GEMINI_API_KEY` in `backend/.env`
- **Real email delivery**: set `BREVO_API_KEY` in `backend/.env` (recommended — see section
  10) or `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` for any other SMTP provider
- **"Sign in with Google" button**: set `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` and the
  matching `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `backend/.env` — see [section
  8](#8-sign-in-options--account-security). Hidden entirely if unset.
- **Google Calendar sync**: see [section 7](#7-google-calendar-setup)

## 2. Architecture

- **Backend**: Node.js, Express, TypeScript, Prisma ORM (PostgreSQL), JWT auth, Zod
  validation, `node-cron` background jobs.
- **Frontend**: React 18, Vite, TypeScript, React Router, Tailwind CSS, Axios,
  `vite-plugin-pwa`.
- **Design system**: a "clinical but warm" visual language — muted teal primary, coral
  reserved strictly for high-urgency/errors, a serif (Lora) for empathetic patient-facing
  headers paired with IBM Plex Sans/Mono for dense doctor/admin data views, glassmorphism
  surfaces on cards and the nav bar, and a signature animated "pulse line" motif used as a
  section divider.
- **Roles**: `PATIENT`, `DOCTOR`, `ADMIN` — enforced both by route guards on the frontend and
  middleware on the backend (never trust the client alone).

## 3. Progressive Web App

The frontend is installable. On desktop Chrome/Edge, an install icon appears in the address
bar; on Android Chrome, a "Add to Home Screen" prompt appears automatically; on iOS Safari,
use Share → Add to Home Screen. Once installed it runs in its own standalone window with
the ClinicAssist icon, and the app shell (HTML/CSS/JS) is cached by a service worker so the
UI still loads if the network briefly drops — API calls themselves use a network-first
strategy so booking data is never served stale, only the interface shell is cached
aggressively. Configured in `frontend/vite.config.ts` via `vite-plugin-pwa`; icons live in
`frontend/public/`.

## 4. Profiles & self-service scheduling

- **Patients** manage their own contact info, date of birth, gender, blood group, known
  allergies, address, and an emergency contact — all visible to their doctor before a visit.
- **Doctors** manage their own bio, qualifications, years of experience, consultation fee,
  slot duration, and a full weekly availability grid (toggle each day on/off and set custom
  hours) — no admin required for day-to-day schedule changes. Doctors can also mark their
  own leave days directly, which triggers the same automatic patient-notification flow as
  the admin-initiated version (see `SYSTEM_DESIGN.md`, "Doctor leave conflict handling").
- **Admins** retain full oversight: they can still create doctors, edit any doctor's
  profile/hours, and mark leave on any doctor's behalf (e.g. for sudden absences).

## 5. Database schema

Defined in `backend/prisma/schema.prisma`. Key entities:

- **User** — base account (email/password/role) for all three roles.
- **DoctorProfile** — specialization, slot duration, `workingHoursJson` (per-weekday
  start/end), linked 1:1 to a `User`.
- **PatientProfile** — dob/gender, linked 1:1 to a `User`.
- **DoctorLeave** — one row per doctor per leave date; unique on `(doctorId, date)`.
- **Appointment** — the core entity. Notably:
  - `status`: `HOLD → CONFIRMED → COMPLETED`, or `CANCELLED` / `RESCHEDULE_NEEDED`.
  - `slotLockKey`: a **unique, nullable** string (`"<doctorId>_<slotStartISO>"`), set only
    while the appointment is `HOLD` or `CONFIRMED`. This is what actually prevents
    double-booking — see [section 6](#6-double-booking--concurrency).
  - `preVisitSummaryJson` / `postVisitSummaryText` — LLM outputs, stored so they only need
    to be generated once.
- **MedicationReminder** — one row per prescribed medication, with computed dose times.
- **NotificationLog** — every email attempt, success or failure, with retry `attempts`.
- **GoogleCredential** — a user's stored OAuth refresh token, 1:1 with `User`.

## 6. Double-booking & concurrency

The brief requires that the system "prevent double-booking and handle simultaneous booking
attempts safely." An application-level check (`SELECT ... WHERE doctorId = ? AND slotStart =
?`) is not sufficient on its own: two requests can both pass that check before either has
written its row.

The actual guarantee comes from the database: `Appointment.slotLockKey` is a **unique
column**. It's computed as `"<doctorId>_<slotStart ISO string>"` and only populated while an
appointment is active (`HOLD`/`CONFIRMED`); it's set back to `null` on cancellation or
reschedule-needed (Postgres allows multiple `NULL`s in a unique index, so freed
slots don't collide with each other). When two requests race for the same slot, both attempt
an `INSERT` with the same `slotLockKey` — the database rejects the second one with a unique
constraint violation, which `appointmentService.bookAppointment` catches and turns into a
clean `409 Conflict` ("this slot was just taken"). The frontend refreshes the slot list so
the patient can immediately pick another time. This holds regardless of how many app server
instances are running, since the guarantee lives in the database, not in memory.

A secondary **slot-hold** mechanism (`holdExpiresAt`, default 5 minutes) protects against a
different failure mode: if the process crashes after reserving a slot but before confirming
it (e.g. mid-LLM-call), a background job (`jobs/reminderJobs.ts`) reclaims expired holds so
the slot doesn't stay locked forever.

## 7. Google Calendar setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and
   create an OAuth 2.0 Client ID of type **Web application**.
2. Add `http://localhost:4000/api/calendar/oauth/callback` as an authorized redirect URI
   (adjust the host for production).
3. Enable the **Google Calendar API** for the project.
4. Copy the client ID/secret into `backend/.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.
5. In the app, an authenticated user calls `GET /api/calendar/connect` to get a Google
   consent URL, completes the consent screen, and Google redirects back to
   `/api/calendar/oauth/callback`, which stores their refresh token. From then on, booking or
   cancelling an appointment automatically creates/deletes an event on that user's calendar
   (see `services/calendarService.ts`). Calendar sync is opportunistic — if a user never
   connects, or a Calendar API call fails, booking still succeeds; only the sync step is
   skipped and logged.

## 8. Sign-in options & account security

- **Email + password**, with mandatory email verification: registering sends a 6-digit code
  (see section 10 for the email provider) that must be entered on `/verify-otp` before the
  account can log in. Codes expire after `OTP_EXPIRY_MINUTES` (default 10) and can be resent.
- **Sign in with Google**: an optional Google Identity Services button appears on the
  login/register screens whenever `VITE_GOOGLE_CLIENT_ID` (frontend) and `GOOGLE_CLIENT_ID`
  (backend, same value) are set. The backend verifies the ID token server-side
  (`google-auth-library`) before trusting it — never trusts a client-asserted email. New
  Google sign-ups are provisioned as patients and skip OTP verification, since Google has
  already verified the email address. This is separate from Google **Calendar** sync
  (section 7), which uses its own OAuth consent screen for calendar write access.
- **Forgot / reset password**: `/forgot-password` emails a 6-digit code; `/reset-password`
  exchanges it for a new password. Deliberately returns the same response whether or not the
  email exists, to avoid leaking which addresses are registered.
- **Change password**: available from any profile page once logged in, requires the current
  password.

## 9. Calendar export & doctor availability at a glance

- Every confirmed booking has an **"Add to calendar"** button offering a one-click Google
  Calendar link plus a universal `.ics` download (`frontend/src/utils/calendar.ts`) — `.ics`
  is the standard iCalendar format (RFC 5545) that Apple Calendar, Outlook, Yahoo, and
  virtually every other calendar app can import directly, so this isn't Google-specific.
- The doctor list on the booking page shows each doctor's **weekly hours** (grouped into
  readable ranges, e.g. "Mon–Fri · 9AM–5PM") plus an **"Available now" / "Available today"**
  badge computed client-side from their working hours. This is a quick at-a-glance signal,
  not a guarantee — one-off leave days are only reflected once a specific date is picked in
  the slot picker, which is the actual source of truth for bookability.

## 10. Token/queue system, doctor messaging & richer prescriptions

- **Token/queue**: each booking gets a sequential token number for that doctor's day. The
  doctor's agenda shows a live "Now Serving" panel with **Start consultation** and **No-show**
  actions (`IN_PROGRESS` status = "now serving"); the patient's appointment view polls
  `GET /appointments/:id/queue-status` every 30s for their token, who's being served, how many
  patients are ahead, and an estimated wait (patients ahead × the doctor's slot length).
- **Doctor ↔ Admin messaging**: doctors send a categorized message (technical/account/
  patient/scheduling/general/other) from `/doctor/messages`; admins see and reply from the
  Admin console's Messages tab; doctors see the reply in their own history.
- **Unread badges**: a red count badge appears on the doctor's "Messages" nav link (new admin
  reply), the admin's "Admin console" nav link and Messages tab (new doctor message), the
  admin's Notifications tab (failed email deliveries needing attention), and the patient's "My
  appointments" nav link (an appointment needs rebooking after a doctor went on leave). Badges
  poll every 20s and clear automatically when the relevant inbox is opened
  (`DoctorMessage.readByAdmin` / `readByDoctor` flags — see `doctorMessageService.ts`).
- **Multi-day leave**: marking a doctor unavailable now takes a **From/To** date range (a
  single day is just a range where both ends match) instead of one day at a time — both the
  admin console and the doctor's own self-service leave form support it. Internally this
  creates one `DoctorLeave` row per day (the existing per-day unique constraint didn't need to
  change) and runs the same affected-patient notification for every day in the range.
- **Admin: edit & delete doctors**: full roster management, with a confirmation dialog before
  delete (which cascades to that doctor's profile, leave days, and appointment history — see
  `deleteDoctor()` in `doctorService.ts` for the trade-offs of hard-delete vs. deactivation).
- **Richer prescriptions**: medicine name, strength, dosage, frequency, duration, before/after
  food, and free-text instructions — each field labeled with an example placeholder so a
  doctor never has to guess the expected format.
- **Follow-up recommendation**: doctors can flag "follow-up in N days" on a completed visit;
  the patient sees this on their visit summary and in the "doctor responded" email.
- **Optional patient mobile number**: collected at booking with a plain-language explanation
  of why it's asked for, never required, and only shown to the assigned doctor.
- **Cancellation reason**: patients pick from predefined reasons (or write their own) when
  cancelling; stored on the appointment for the admin to review cancellation patterns.
- **Calendar links baked into emails**: the booking confirmation, reschedule, and both
  reminder emails include a one-click **"Add to Google Calendar"** button, and the
  confirmation/reschedule emails also attach a universal `.ics` file (works with Apple
  Calendar, Outlook, and most other calendar apps) — so a patient can add the appointment to
  their calendar straight from their inbox, not just from inside the app.

## 11. Rescheduling, visit history, audit log & prescription PDFs

- **Appointment rescheduling**: patients, doctors, or admins can move a booking to a new slot
  (`POST /appointments/:id/reschedule`) instead of forcing a cancel-and-rebook. Reuses the same
  unique-`slotLockKey` double-booking protection as a fresh booking, recomputes the token
  number for the new day, emails the patient the new date/time/token, and updates the Google
  Calendar event in place (rather than delete-and-recreate) if one exists.
- **Patient visit history (basic EMR)**: opening any appointment as its doctor surfaces that
  patient's past *completed* visits — date, doctor, diagnosis notes, prescription, and any
  follow-up recommendation — via `GET /appointments/:id/history`. This is a history *view*,
  not a full chart/record system (no cross-visit vitals trending, uploaded documents, etc. —
  see the roadmap).
- **Downloadable prescription PDF**: once a visit is completed, the patient (or the doctor/
  admin) can download a print-ready PDF (`GET /appointments/:id/prescription-pdf`, generated
  server-side with `pdfkit`) with clinic branding, doctor/patient details, the medicines
  table, follow-up note, and a signature line.
- **Audit log**: every doctor create/update/delete, leave marking (self or admin), appointment
  cancellation/reschedule/completion, and doctor-message reply writes an `AuditLog` entry
  (actor, action, target, a short human-readable detail, timestamp) — visible to admins at
  `/admin` → Messages tab's neighbor, the **Audit** tab. Entries snapshot the actor's name as
  plain text so the log stays readable even if that account is later deleted.
- **Better-timed reminders**: alongside the existing ~24h-out reminder, a second one fires
  ~1–2h before the appointment, using a separate `NotificationType` so the two don't collide
  in the "already sent" dedup check.

## 12. LLM prompts

Both live in `backend/src/services/llmService.ts` and call the Gemini `generateContent` API
directly with a `systemInstruction` constraining the model to strict JSON output.

**Pre-visit summary** (triggered automatically when a patient submits their symptom form):
> "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint,
> and three suggested questions for the doctor. Symptoms: `<symptoms>`"

**Post-visit summary** (triggered when a doctor submits clinical notes + prescription):
> "Convert these clinical notes into a patient-friendly summary with medication schedule and
> follow-up steps: `<notes>`" (prescription data is passed alongside as structured JSON)

### LLM failure handling
Every call goes through `callGeminiJson`, which never throws: network errors, timeouts
(15s), non-200 responses, and malformed JSON are all caught and turned into
`{ ok: false, error }`. Callers then use a **safe fallback**, not a broken booking:
- Pre-visit: defaults to **Medium urgency** (never silently Low) with a note that the
  summary is unavailable, so nothing slips through unreviewed, plus generic starter
  questions.
- Post-visit: falls back to the doctor's raw notes plus a plainly-formatted medication
  schedule computed from the prescription data (no LLM needed for this part).

Both cases are flagged in the API response (`preVisitLlmFailed` / `postVisitLlmFailed`) so
the UI can visibly warn the doctor/patient rather than silently showing a lower-quality
summary as if it were normal.

## 13. API reference

All endpoints are prefixed `/api`. Authenticated routes expect `Authorization: Bearer
<token>`.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Patient self-registration — sends an OTP, does not log in yet |
| POST | `/auth/verify-otp` | public | Verify the registration OTP; returns a token on success |
| POST | `/auth/resend-otp` | public | Resend the verification OTP |
| POST | `/auth/login` | public | Login (all roles) — 403 `EmailNotVerified` if unverified |
| POST | `/auth/google` | public | Sign in / sign up with a verified Google ID token |
| POST | `/auth/forgot-password` | public | Email a password-reset OTP |
| POST | `/auth/reset-password` | public | Exchange a reset OTP for a new password |
| PATCH | `/auth/change-password` | any | Change password (requires current password) |
| GET | `/auth/me` | any | Current user |
| PATCH | `/auth/me` | any | Update name/phone |
| GET | `/patients/me` | PATIENT | Own profile (medical details, emergency contact, etc.) |
| PATCH | `/patients/me` | PATIENT | Update own profile |
| GET | `/doctors` | any | List doctors, optional `?specialization=` |
| GET | `/doctors/me` | DOCTOR | Own profile + working hours |
| PATCH | `/doctors/me` | DOCTOR | Update own profile, hours, fee, bio — no admin needed |
| POST | `/doctors/me/leave` | DOCTOR | Mark own leave (date range); notifies affected patients |
| GET | `/doctors/me/leave` | DOCTOR | List own leave days |
| GET | `/doctors/:id` | any | Doctor profile |
| GET | `/doctors/:id/slots?date=YYYY-MM-DD` | any | Available slots for a day |
| POST | `/doctors` | ADMIN | Create a doctor |
| PATCH | `/doctors/:id` | ADMIN | Update any doctor's profile/hours |
| DELETE | `/doctors/:id` | ADMIN | Delete a doctor (cascades to profile/leave/appointments) |
| POST | `/doctors/:id/leave` | ADMIN | Mark leave (date range) for any doctor; notifies patients |
| GET | `/doctors/:id/leave` | any | List a doctor's leave days |
| POST | `/appointments` | PATIENT | Book a slot + submit symptoms (+ optional mobile number) |
| GET | `/appointments/mine` | PATIENT/DOCTOR | List own appointments |
| GET | `/appointments/queue/today` | DOCTOR | Today's queue sorted by token |
| GET | `/appointments/:id/queue-status` | any | Token, now-serving, patients ahead, est. wait |
| POST | `/appointments/:id/start` | DOCTOR | Call the patient in ("now serving") |
| POST | `/appointments/:id/no-show` | DOCTOR | Mark a no-show, frees their queue slot |
| GET | `/appointments/:id` | owner/ADMIN | Appointment detail |
| POST | `/appointments/:id/cancel` | owner/ADMIN | Cancel (+ optional predefined/custom reason) |
| POST | `/appointments/:id/reschedule` | owner/ADMIN | Move to a new slot; recomputes token, notifies patient |
| POST | `/appointments/:id/visit-notes` | DOCTOR | Submit notes + prescription + follow-up flag |
| GET | `/appointments/:id/history` | DOCTOR/ADMIN | That patient's past completed visits |
| GET | `/appointments/:id/prescription-pdf` | owner/ADMIN | Download a print-ready prescription PDF |
| GET | `/doctor-messages/mine` | DOCTOR | Own messages to admin + replies |
| GET | `/doctor-messages/mine/unread-count` | DOCTOR | Unread reply count (nav badge) |
| POST | `/doctor-messages/mine/mark-read` | DOCTOR | Mark own messages as read |
| POST | `/doctor-messages` | DOCTOR | Send a categorized message to admin |
| GET | `/doctor-messages` | ADMIN | All doctor messages, optional `?status=` |
| GET | `/doctor-messages/unread-count` | ADMIN | Unread message count (nav badge) |
| POST | `/doctor-messages/mark-all-read` | ADMIN | Mark all messages as read |
| POST | `/doctor-messages/:id/reply` | ADMIN | Reply, marks the message resolved |
| GET | `/appointments/attention-count` | PATIENT | Count needing attention (nav badge) |
| GET | `/admin/stats` | ADMIN | Dashboard counts |
| GET | `/admin/appointments` | ADMIN | All appointments |
| GET | `/admin/notifications` | ADMIN | Email delivery log |
| GET | `/admin/audit-log` | ADMIN | Traceable log of state-changing actions |
| GET | `/calendar/connect` | any | Start Google OAuth |
| GET | `/calendar/status` | any | Whether calendar is connected |
| DELETE | `/calendar/disconnect` | any | Remove stored credential |

Errors are JSON: `{ "error": "ErrorType", "message": "...", "details"?: [...] }`.

## 14. Background jobs (`backend/src/jobs/reminderJobs.ts`)

| Schedule | Job |
|---|---|
| every 5 min | Release expired slot holds; retry failed email sends (up to 5 attempts) |
| every 15 min | Send medication reminders whose scheduled time has arrived (deduped per day) |
| hourly | Send appointment reminders ~24h before the visit (deduped via `NotificationLog`) |

## 15. Security notes (production hardening)

This is a technical-assessment-scale build; before real deployment:
- Encrypt `GoogleCredential.refreshToken` at rest (e.g. via `pgcrypto` or an app-level KMS).
- Move `JWT_SECRET` to a real secrets manager; rotate periodically.
- Add rate limiting on `/auth/login` and `/auth/register`.
- Use a production-grade managed Postgres instance (with connection pooling, e.g. PgBouncer
  or your provider's pooler) once traffic grows beyond a single small instance.
- Add HTTPS termination and set `secure`/`sameSite` cookie flags if you move off
  bearer-token-in-localStorage.

## 16. Deploying

- **Backend**: any Node host (Render, Railway, Fly.io). Set the env vars from
  `.env.example`, run `npx prisma migrate deploy` then `npm run build && npm start`.
- **Frontend**: `npm run build` produces `dist/`; deploy as a static site (Vercel, Netlify,
  Render static site) and point it at the backend URL (set `CLIENT_URL` on the backend to
  match, and update the Vite proxy / add a `VITE_API_URL` env if the frontend and backend
  aren't on the same domain).

## 17. Roadmap — not yet built

Being direct about scope: the items below are each a substantial feature in their own right
and are **not** in this build yet. Listed in roughly the order they'd be tackled next:

- **Walk-in patients & a receptionist role** — admin/receptionist creates a walk-in patient +
  appointment that enters the same token queue as online bookings.
- **Uploaded medical reports** (blood tests, X-rays, etc.) — needs file storage (S3-compatible
  bucket) plus doctor-side viewing. (Prescriptions are already downloadable as PDF — see
  section 11 — this item is specifically about *patient-uploaded* documents.)
- **WhatsApp/SMS reminders** as an optional channel alongside the existing email reminders
  (24h and 1–2h out are both already built — see section 11).
- **Family member profiles** under one patient account.
- **Doctor verification** (registration number, documents, a "Verified ✓" badge).
- **Full RBAC with a RECEPTIONIST role**, separate from admin.
- **Analytics dashboards** (charts for appointments/day, cancellation & no-show rate, most-
  booked doctors, etc.) for both admin and doctor.
- **Payment/billing** (consultation fees, online payment, invoices, refunds).
- **Real push notifications** — the PWA install/offline support is real (section 3), but
  *push* notifications specifically need a VAPID key pair and a subscription flow; today the
  app relies on email for all async notifications, which works everywhere without extra setup.
- **"Doctor is running late" broadcast** to the day's waiting queue.

## 18. A note on the visual design

The dashboard/PWA mockups and the landing-page reference shared during development were used
as **direction**, not traced pixel-for-pixel: this build reuses ClinicAssist's own established
design system (teal/coral/amber palette, Lora serif + IBM Plex Sans, the pulse-line motif)
throughout, including on the new landing page, rather than adopting a different third-party
site's exact layout, photography, and copy. Recreating another site's specific design
verbatim (its exact stock photography, headline copy, and composition) isn't something this
build does — the landing page's hero instead uses a live-feeling mock of the product's own
queue feature as proof, which stays true to the reference's *spirit* (bold headline + a
floating card of "real" data) without copying a specific designer's work.
