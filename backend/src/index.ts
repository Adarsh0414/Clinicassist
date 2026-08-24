import "express-async-errors";
import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { doctorsRouter } from "./routes/doctors";
import { patientsRouter } from "./routes/patients";
import { appointmentsRouter } from "./routes/appointments";
import { adminRouter } from "./routes/admin";
import { calendarRouter } from "./routes/calendar";
import { doctorMessagesRouter } from "./routes/doctorMessages";
import { errorHandler } from "./middleware/errorHandler";
import { startBackgroundJobs } from "./jobs/reminderJobs";

const app = express();

app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ham-backend", time: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/doctors", doctorsRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/doctor-messages", doctorMessagesRouter);

app.use((req, res) => {
  res.status(404).json({ error: "NotFound", message: `No route for ${req.method} ${req.path}` });
});

// Must be registered last.
app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Healthcare Appointment Manager API listening on http://localhost:${env.port}`);
  startBackgroundJobs();
});
