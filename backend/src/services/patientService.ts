import { prisma } from "../config/db";
import { NotFoundError } from "../utils/errors";

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
