import { z } from "zod";

// `.nullish()` (accepts string | null | undefined) is used deliberately for every
// optional profile field below. These forms are round-tripped: the frontend loads
// a profile (where unset fields come back as `null` from Postgres), the user edits
// one field, and the *whole* object — including the untouched `null`s — is sent
// back. `.optional()` alone rejects `null`, which was previously causing "Request
// data failed validation" on any save where an untouched field was still empty.

export const registerPatientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().nullish(),
  dob: z.string().nullish(),
  gender: z.string().nullish(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const googleSignInSchema = z.object({
  idToken: z.string().min(10),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export const resendOtpSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// password is omitted entirely for Google-auth accounts (they have no user-known
// password to confirm with) — the service layer decides whether it's required.
export const deleteAccountSchema = z.object({
  password: z.string().min(1).optional(),
});

const workingHoursSchema = z.record(z.string(), z.object({ start: z.string(), end: z.string() }));

export const createDoctorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  specialization: z.string().min(2),
  slotDurationMinutes: z.number().int().positive().default(30),
  workingHours: workingHoursSchema,
  bio: z.string().nullish(),
});

export const updateDoctorSchema = z.object({
  specialization: z.string().min(2).optional(),
  slotDurationMinutes: z.number().int().positive().optional(),
  workingHours: workingHoursSchema.optional(),
  bio: z.string().nullish(),
  qualifications: z.string().nullish(),
  yearsOfExperience: z.number().int().min(0).max(70).nullish(),
  consultationFee: z.string().nullish(),
});

export const updateMeSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().nullish(),
});

export const updatePatientProfileSchema = z.object({
  dob: z.string().nullish(),
  gender: z.string().nullish(),
  bloodGroup: z.string().nullish(),
  allergies: z.string().nullish(),
  medicalConditions: z.string().nullish(),
  emergencyContactName: z.string().nullish(),
  emergencyContactPhone: z.string().nullish(),
  address: z.string().nullish(),
  emailRemindersEnabled: z.boolean().optional(),
});

export const updateOwnDoctorProfileSchema = z.object({
  specialization: z.string().min(2).optional(),
  slotDurationMinutes: z.number().int().positive().optional(),
  workingHours: workingHoursSchema.optional(),
  bio: z.string().nullish(),
  qualifications: z.string().nullish(),
  yearsOfExperience: z.number().int().min(0).max(70).nullish(),
  consultationFee: z.string().nullish(),
});

export const markLeaveSchema = z
  .object({
    startDate: z.string(), // ISO date, e.g. "2026-08-25"
    endDate: z.string(), // ISO date, inclusive — same as startDate for a single day off
    reason: z.string().nullish(),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

// Same shape as markLeaveSchema — kept as a separate export so the doctor-facing "request
// time off" endpoint reads clearly in routes, even though the validation is identical.
export const requestLeaveSchema = markLeaveSchema;

export const decideLeaveRequestSchema = z.object({
  adminNote: z.string().nullish(),
});

export const bookAppointmentSchema = z.object({
  doctorId: z.string(),
  slotStart: z.string(), // ISO datetime
  symptomsText: z.string().min(3, "Please describe your symptoms in a bit more detail."),
  patientMobile: z.string().nullish(),
});

const cancellationReasons = [
  "Doctor unavailable",
  "Change of plans",
  "Found another doctor",
  "Appointment timing issue",
  "Emergency",
  "Other",
] as const;

export const cancelAppointmentSchema = z.object({
  reason: z.enum(cancellationReasons).nullish(),
  customReason: z.string().max(500).nullish(),
});

export const rescheduleAppointmentSchema = z.object({
  slotStart: z.string(),
});

export const visitNotesSchema = z.object({
  doctorNotes: z.string().min(3),
  prescription: z
    .array(
      z.object({
        medication: z.string().min(1),
        strength: z.string().nullish(),
        dosage: z.string().min(1),
        frequencyPerDay: z.number().int().min(1).max(6),
        durationDays: z.number().int().min(1).max(90),
        foodTiming: z.enum(["before", "after", ""]).nullish(),
        instructions: z.string().nullish(),
      })
    )
    .default([]),
  followUpRecommended: z.boolean().default(false),
  followUpAfterDays: z.number().int().min(1).max(365).nullish(),
});

export const createDoctorMessageSchema = z.object({
  category: z.enum(["technical", "account", "patient", "scheduling", "general", "other"]),
  subject: z.string().min(3).max(150),
  message: z.string().min(3).max(3000),
});

export const replyDoctorMessageSchema = z.object({
  adminReply: z.string().min(1).max(3000),
});
