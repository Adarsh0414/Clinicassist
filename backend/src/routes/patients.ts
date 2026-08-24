import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { updatePatientProfileSchema } from "../utils/validation";
import { getPatientByUserId, updatePatientProfile } from "../services/patientService";

export const patientsRouter = Router();
patientsRouter.use(authenticate, requireRole("PATIENT"));

patientsRouter.get("/me", async (req, res) => {
  const patient = await getPatientByUserId(req.auth!.userId);
  res.json({
    id: patient.id,
    name: patient.user.name,
    email: patient.user.email,
    phone: patient.user.phone,
    dob: patient.dob,
    gender: patient.gender,
    bloodGroup: patient.bloodGroup,
    allergies: patient.allergies,
    medicalConditions: patient.medicalConditions,
    emergencyContactName: patient.emergencyContactName,
    emergencyContactPhone: patient.emergencyContactPhone,
    address: patient.address,
    emailRemindersEnabled: patient.emailRemindersEnabled,
  });
});

patientsRouter.patch("/me", async (req, res) => {
  const data = updatePatientProfileSchema.parse(req.body);
  const updated = await updatePatientProfile(req.auth!.patientProfileId!, data);
  res.json(updated);
});
