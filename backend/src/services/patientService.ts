import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import { AppError, NotFoundError, UnauthorizedError } from "../utils/errors";

interface UpdatePatientProfileInput {
  dob?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  address?: string | null;
  emailRemindersEnabled?: boolean;
}

export async function getPatientByUserId(userId: string) {
  const patient = await prisma.patientProfile.findUnique({ where: { userId }, include: { user: true } });
  if (!patient) throw new NotFoundError("Patient profile not found");
  return patient;
}

export async function updatePatientProfile(patientId: string, patch: UpdatePatientProfileInput) {
  return prisma.patientProfile.update({
    where: { id: patientId },
    data: {
      dob: patch.dob ? new Date(patch.dob) : patch.dob === null ? null : undefined,
      gender: patch.gender,
      bloodGroup: patch.bloodGroup,
      allergies: patch.allergies,
      medicalConditions: patch.medicalConditions,
      emergencyContactName: patch.emergencyContactName,
      emergencyContactPhone: patch.emergencyContactPhone,
      address: patch.address,
      emailRemindersEnabled: patch.emailRemindersEnabled,
    },
  });
}

/** Deletes a patient's own User account, which cascades (via schema onDelete: Cascade) to
 *  their PatientProfile, appointments, medication reminders, and Google Calendar
 *  credential. NotificationLog rows are kept with appointmentId set to null (onDelete:
 *  SetNull) so delivery history isn't silently lost. This is a hard delete for this
 *  iteration — same trade-off as doctorService.deleteDoctor, see that comment for the
 *  rationale.
 *
 *  Password-based accounts must confirm with their current password. Google-auth
 *  accounts have no user-known password (a random one is generated at sign-up), so
 *  that check is skipped for them — the frontend gates that case with an explicit
 *  confirmation dialog instead. */
export async function deletePatientAccount(userId: string, password?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("Account not found");

  if (user.authProvider === "password") {
    if (!password) throw new AppError("Enter your password to confirm account deletion", 400);
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Incorrect password");
  }

  await prisma.user.delete({ where: { id: userId } });
}
