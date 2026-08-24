# System Design Write-up

## Double-booking prevention

The naive approach — check for an existing appointment at a given doctor/time before
inserting a new one — is not safe under concurrency: two simultaneous requests for the same
slot can both pass the check before either has committed its write, producing two confirmed
bookings for one slot.

Instead, the guarantee is pushed down to the database. `Appointment.slotLockKey` is a
**unique, nullable** column computed as `"<doctorId>_<slotStart ISO>"`. It is populated only
while an appointment is in an "active" state (`HOLD` or `CONFIRMED`) and is cleared back to
`null` the moment an appointment is cancelled or marked `RESCHEDULE_NEEDED`. Postgres
treats `NULL` as distinct from any other value in a unique index, so any number of
cancelled/freed appointments can share a `null` key without conflict — only one *active*
appointment per doctor/slot can exist at a time, enforced by the engine itself.

When a patient books, the service attempts an `INSERT` with that key inside
`bookAppointment()`. If a concurrent request already claimed the slot, the second `INSERT`
fails with a unique-constraint violation (Postgres error code `23505`, surfaced by Prisma as `P2002`),
which the service catches and converts into a clean `409 Conflict` response
("this slot was just taken by another patient"). The frontend reacts by silently refreshing
the slot list so the patient can immediately choose a different time — no dead end, no stale
UI. This approach works correctly regardless of how many application server instances are
running, because the invariant lives in the data layer, not in any single process's memory
or in a distributed lock service that would add its own failure modes.

## Slot hold mechanism

Booking isn't a single atomic step in this system — after a slot is reserved, the pre-visit
LLM summary is generated, which involves a network call that can take a few seconds and can,
in principle, fail entirely (process crash, timeout). To avoid a slot being silently
locked forever if that happens, the appointment is first created with `status: HOLD` and a
`holdExpiresAt` timestamp (5 minutes by default). Only once the LLM step completes
(successfully or via its own internal fallback — see below) does the service flip the status
to `CONFIRMED` and clear `holdExpiresAt`. A background job runs every 5 minutes and cancels
any `HOLD` row whose expiry has passed, clearing its `slotLockKey` in the same update so the
slot becomes bookable again. This means a crash mid-booking degrades to "the patient has to
retry," not "this slot is permanently unavailable."

## Doctor leave conflict handling

When an admin marks a doctor unavailable for a date (`POST /doctors/:id/leave`), the leave
day is recorded first (unique per doctor/date, so re-marking the same day is idempotent and
just updates the reason). Then the service queries every `HOLD`/`CONFIRMED` appointment for
that doctor on that date and, for each one: sets its status to `RESCHEDULE_NEEDED`, clears
`slotLockKey` (releasing the DB-level lock — though the slot is moot anyway since the doctor
is now on leave), deletes the corresponding Google Calendar event if one exists, and sends
the patient an immediate "please rebook" email. This all happens synchronously within the
leave-marking request, so the admin gets an accurate count of how many patients were
affected in the response, and no patient is left holding a confirmed slot with a doctor who
won't show up. Future availability queries for that doctor/date simply return no slots,
since `getAvailableSlots` checks `DoctorLeave` before generating candidates.

## Notification failure handling

Email delivery is treated as important but never load-bearing: `sendEmail()` never throws.
Every attempt — success or failure — writes a row to `NotificationLog` (recipient, subject,
type, status, and the error message on failure). This means booking, cancellation, and
visit-completion flows always complete even if the SMTP provider is down; the user simply
might not get an email that particular moment. A background job runs every 5 minutes and
retries any `FAILED` log entry from the last 24 hours (capped at 5 attempts, to avoid
retrying forever against a permanently bad address), promoting it to `SENT` on success or
`RETRYING` with an updated error otherwise. The admin console surfaces this log directly
(`GET /admin/notifications`), so clinic staff can see delivery failures and intervene
manually (e.g. call the patient) rather than the failure being invisible. The same
fail-soft/log-and-continue pattern is applied identically to the LLM calls and to Google
Calendar sync, so a third-party outage in any one of these three integrations degrades
gracefully instead of blocking the core appointment workflow.
