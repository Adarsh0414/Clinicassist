import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@clinicassist.example";
  const adminPassword = "AdminPass123!";

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: "Clinic Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        emailVerified: true,
      },
    });
    console.log(`Created admin: ${adminEmail} / ${adminPassword}`);
  }

  const doctorEmail = "dr.sarah@clinicassist.example";
  const doctorPassword = "DoctorPass123!";
  const existingDoctor = await prisma.user.findUnique({ where: { email: doctorEmail } });
  if (!existingDoctor) {
    await prisma.user.create({
      data: {
        name: "Sarah Chen",
        email: doctorEmail,
        passwordHash: await bcrypt.hash(doctorPassword, 10),
        role: "DOCTOR",
        emailVerified: true,
        doctorProfile: {
          create: {
            specialization: "General Medicine",
            slotDurationMinutes: 30,
            workingHoursJson: JSON.stringify({
              MON: { start: "09:00", end: "17:00" },
              TUE: { start: "09:00", end: "17:00" },
              WED: { start: "09:00", end: "17:00" },
              THU: { start: "09:00", end: "17:00" },
              FRI: { start: "09:00", end: "13:00" },
            }),
            bio: "General practitioner with 10 years of experience.",
          },
        },
      },
    });
    console.log(`Created doctor: ${doctorEmail} / ${doctorPassword}`);
  }

  const patientEmail = "patient@example.com";
  const patientPassword = "PatientPass123!";
  const existingPatient = await prisma.user.findUnique({ where: { email: patientEmail } });
  if (!existingPatient) {
    await prisma.user.create({
      data: {
        name: "Alex Morgan",
        email: patientEmail,
        passwordHash: await bcrypt.hash(patientPassword, 10),
        role: "PATIENT",
        emailVerified: true,
        patientProfile: { create: {} },
      },
    });
    console.log(`Created patient: ${patientEmail} / ${patientPassword}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
