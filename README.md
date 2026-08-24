# 🏥 ClinicAssist

A full-stack healthcare appointment and follow-up management platform with separate portals for **patients**, **doctors**, and **clinic admins**.

ClinicAssist streamlines the complete appointment workflow — from doctor discovery and symptom collection to appointment booking, AI-assisted pre-visit briefs, live queue management, prescriptions, follow-up summaries, email notifications, Google Sign-In, and Google Calendar integration.

## ✨ Features

### 👤 Patients

- Register and securely log in
- Sign in with Google
- Browse doctors by specialization
- View available appointment slots
- Book appointments
- Describe symptoms before the visit
- Receive an AI-generated pre-visit summary
- Get appointment token numbers
- Track appointment and queue status
- Cancel appointments
- Receive appointment confirmation emails
- Add appointments to calendar
- View post-visit summaries
- View prescriptions and follow-up information

The booking flow collects symptoms before confirmation and informs the doctor that an AI-generated summary and urgency flag will be available before the visit. :contentReference[oaicite:2]{index=2}

### 👨‍⚕️ Doctors

- Secure doctor login
- View today's appointments
- Manage live patient queue
- View patient symptoms before the appointment
- View AI-generated visit briefs
- See urgency indicators
- View patient appointment history
- Add clinical notes
- Create prescriptions
- Complete visits
- Generate patient-friendly post-visit summaries
- Manage working schedule
- Handle appointment-related actions

### 🛡️ Clinic Admins

- Secure admin dashboard
- Create and manage doctor accounts
- Manage doctor specializations
- Configure working hours
- Configure appointment slot duration
- Manage doctor leave
- View appointments
- Manage clinic operations
- Monitor notification activity

---

## 🤖 AI-Assisted Healthcare Workflow

ClinicAssist uses Gemini to assist doctors with pre-visit and post-visit information.

### Pre-visit AI Brief

Before an appointment, the patient's symptoms are processed into a structured brief containing information such as:

- Urgency level
- Chief complaint
- Key symptoms
- Suggested questions for the doctor

Example:

> **Medium urgency**
>
> Dry cough and mild fever for 3 days, worse at night.
>
> No shortness of breath  
> No chest pain

The AI summary is intended to help doctors prepare for the visit and does **not replace professional medical judgment or emergency services**.

### Post-visit Summary

After the doctor completes a visit, ClinicAssist can generate a patient-friendly summary containing:

- Visit summary
- Medication instructions
- Follow-up information
- Important instructions for the patient

---

## 🏗️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | JWT |
| Google Authentication | Google Identity Services |
| AI | Google Gemini API |
| Email | Brevo / transactional email |
| Calendar | Google Calendar API |
| API Testing | Postman |
| Version Control | Git + GitHub |
| Development | VS Code |

---

## 📁 Project Structure

```text
ClinicAssist/
│
├── frontend/
│   ├── public/
│   │   └── images/
│   │       └── patient.jpg
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── services/
│   │   └── ...
│   ├── .env.example
│   └── package.json
│
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── ...
│   ├── .env.example
│   └── package.json
│
├── README.md
└── ...
```

---

# 🚀 1. Setup Guide

## Prerequisites

Install the following before running ClinicAssist:

| Requirement | Purpose |
|---|---|
| Node.js 18+ | Frontend and backend runtime |
| PostgreSQL | Application database |
| Git | Version control |
| Google Cloud Project | Google Sign-In + Calendar |
| Gemini API Key | AI-generated visit summaries |
| Brevo account | Transactional email |
| VS Code | Recommended development environment |

---

## Backend Setup

Open a terminal in the project root:

```bash
cd backend
npm install
```

Create your environment file:

```bash
copy .env.example .env
```

For Git Bash:

```bash
cp .env.example .env
```

Configure the variables in `.env`.

Then generate the Prisma client:

```bash
npx prisma generate
```

Run database migrations:

```bash
npx prisma migrate dev
```

Start the backend:

```bash
npm run dev
```

The backend runs on:

```text
http://localhost:4000
```

---

## Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create the frontend environment file:

```bash
copy .env.example .env
```

For Git Bash:

```bash
cp .env.example .env
```

Start the frontend:

```bash
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

---

# 🔐 2. Environment Variables

## Backend

Create:

```text
backend/.env
```

Example:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/clinicassist"

JWT_SECRET="your-long-random-secret"
JWT_EXPIRES_IN="7d"

PORT=4000

CORS_ORIGIN="http://localhost:5173"

APP_URL="http://localhost:5173"

# Gemini
GEMINI_API_KEY="your-gemini-api-key"

# Email
BREVO_API_KEY="your-brevo-api-key"
EMAIL_FROM="your-verified-email@example.com"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:4000/api/calendar/oauth/callback"
```

Your project uses `DATABASE_URL`, JWT configuration, Gemini configuration, and Google OAuth-related environment variables in the backend configuration. :contentReference[oaicite:3]{index=3}

---

## Frontend

Create:

```text
frontend/.env
```

Example:

```env
VITE_API_URL="http://localhost:4000"

VITE_GOOGLE_CLIENT_ID="your-google-client-id"
```

The `VITE_GOOGLE_CLIENT_ID` is the Google OAuth Client ID used by Google Sign-In in the frontend.

The Google OAuth client is shared between the frontend Google Sign-In flow and the backend Google integration.

---

> 🔒 **Never commit `.env` files or API keys to GitHub.**
>
> Store production secrets in your hosting provider's environment-variable dashboard.

---

# 🗄️ 3. Database

ClinicAssist uses **PostgreSQL with Prisma ORM**.

The Prisma schema manages the application's healthcare entities and relationships.

Core entities include:

### User

Stores authentication and account information for:

- Patients
- Doctors
- Admins

Users are separated by their role.

```text
PATIENT
DOCTOR
ADMIN
```

### Doctor Profile

Contains doctor-specific information such as:

- Specialization
- Qualifications
- Working hours
- Appointment slot duration
- Leave days

### Appointment

Stores appointment information including:

- Patient
- Doctor
- Appointment date
- Slot start/end
- Token number
- Symptoms
- Appointment status
- AI pre-visit information
- Doctor notes
- Prescription
- Post-visit summary

### Doctor Messages

Supports doctor/patient communication associated with the healthcare workflow.

---

## Preventing Double Booking

Appointment availability is checked before booking, while the database layer is used to maintain appointment consistency.

The goal is to prevent two patients from successfully booking the same doctor's time slot.

---

# 🔑 4. Authentication

ClinicAssist supports:

- JWT-based authentication
- Role-based access
- Patient registration
- Doctor authentication
- Admin authentication
- Google Sign-In
- Password reset functionality

The frontend uses the authenticated user's role to route them to the appropriate portal:

```text
Patient → Patient Dashboard
Doctor  → Doctor Dashboard
Admin   → Admin Dashboard
```

---

# 📅 5. Appointment Workflow

The main patient booking flow is:

```text
Choose Specialization
        ↓
Choose Doctor
        ↓
Choose Available Date
        ↓
Choose Available Time Slot
        ↓
Describe Symptoms
        ↓
AI Pre-visit Processing
        ↓
Confirm Appointment
        ↓
Token Number Generated
        ↓
Confirmation Email
        ↓
Google Calendar
        ↓
Doctor Queue
        ↓
Doctor Completes Visit
        ↓
Prescription + Notes
        ↓
AI Post-visit Summary
        ↓
Patient Follow-up
```

The frontend currently follows a multi-step flow of **Doctor → Time → Symptoms → Done** and displays the patient's token after successful booking. :contentReference[oaicite:4]{index=4} :contentReference[oaicite:5]{index=5}

---

# 🔌 6. API Reference

Core API areas include:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Patient registration |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/forgot-password` | Request password reset |
| `POST` | `/api/auth/reset-password` | Reset password |
| `GET` | `/api/doctors` | List/search doctors |
| `GET` | `/api/appointments/available-slots` | Get available appointment slots |
| `POST` | `/api/appointments/book` | Book appointment |
| `POST` | `/api/appointments/:id/cancel` | Cancel appointment |
| `POST` | `/api/appointments/:id/post-visit` | Complete visit |
| `GET` | `/api/calendar/connect` | Start Google Calendar connection |
| `GET` | `/api/calendar/oauth/callback` | Google Calendar OAuth callback |

Authenticated routes use:

```http
Authorization: Bearer <JWT_TOKEN>
```

---

# 🧠 7. Gemini AI

ClinicAssist uses the **Google Gemini API** for AI-assisted healthcare summaries.

### Pre-visit

Input:

```text
Patient symptoms
```

Output:

```text
Urgency
Chief complaint
Suggested questions
Structured visit brief
```

### Post-visit

Input:

```text
Doctor notes
Prescription
Visit information
```

Output:

```text
Patient-friendly summary
Medication information
Follow-up instructions
```

Add your Gemini key to:

```env
GEMINI_API_KEY="your-api-key"
```

The Gemini model/configuration is kept in the backend environment rather than exposing the API key to the frontend.

---

# 📧 8. Email Notifications

ClinicAssist sends transactional emails for important appointment events.

Examples include:

- Appointment confirmation
- Appointment cancellation
- Appointment reminders
- Follow-up communication
- Password-related emails

The patient booking confirmation also informs the user that a confirmation email is being sent and provides calendar functionality. :contentReference[oaicite:6]{index=6}

Email configuration:

```env
BREVO_API_KEY="your-api-key"
EMAIL_FROM="verified-sender@example.com"
```

The sender address should be verified with the email provider before using it in production.

---

# 📆 9. Google Calendar Setup

ClinicAssist can integrate appointments with Google Calendar.

### Step 1

Open Google Cloud Console:

```text
https://console.cloud.google.com/
```

### Step 2

Create or select your project.

### Step 3

Enable:

```text
Google Calendar API
```

### Step 4

Configure the OAuth consent screen.

### Step 5

Create:

```text
OAuth Client ID
```

Choose:

```text
Web application
```

### Step 6

Add the frontend origin:

```text
http://localhost:5173
```

under:

```text
Authorized JavaScript origins
```

### Step 7

Add the backend callback:

```text
http://localhost:4000/api/calendar/oauth/callback
```

under:

```text
Authorized redirect URIs
```

### Step 8

Add the credentials to:

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:4000/api/calendar/oauth/callback"
```

For frontend Google Sign-In:

```env
VITE_GOOGLE_CLIENT_ID="..."
```

Use the **same Google OAuth Client ID** where the application requires it.

---

# 🌐 10. Google Sign-In

Google Sign-In is implemented using Google Identity Services.

Frontend:

```env
VITE_GOOGLE_CLIENT_ID="your-client-id"
```

Backend:

```env
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

For local development, add:

```text
http://localhost:5173
```

as an authorized JavaScript origin in Google Cloud.

---

# 🩺 11. Role-Based Portals

ClinicAssist provides three dedicated experiences.

### Patient Portal

```text
Register/Login
     ↓
Find Doctor
     ↓
Book Appointment
     ↓
Describe Symptoms
     ↓
Track Token
     ↓
Appointment
     ↓
Post-visit Summary
```

### Doctor Portal

```text
Login
  ↓
Today's Queue
  ↓
Patient AI Brief
  ↓
Consultation
  ↓
Clinical Notes
  ↓
Prescription
  ↓
Complete Visit
```

### Admin Portal

```text
Login
  ↓
Doctor Management
  ↓
Schedules
  ↓
Leave Management
  ↓
Appointment Management
  ↓
Clinic Operations
```

---

# 🖼️ 12. Frontend Assets

Static frontend assets are stored inside:

```text
frontend/public/images/
```

For example:

```text
frontend/public/images/patient.jpg
```

can be referenced from React as:

```tsx
<img
  src="/images/patient.jpg"
  alt="A patient checking their appointment on a phone"
/>
```

---

# 🚀 13. Production Deployment

ClinicAssist can be deployed as separate frontend and backend services.

Recommended architecture:

```text
                    ┌─────────────────┐
                    │     Patient     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Frontend     │
                    │  React + Vite   │
                    └────────┬────────┘
                             │
                         HTTPS API
                             │
                    ┌────────▼────────┐
                    │     Backend     │
                    │ Node + Express  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   PostgreSQL    │
                    │     Prisma      │
                    └─────────────────┘

              External Integrations
              ├── Google Gemini
              ├── Google OAuth
              ├── Google Calendar
              └── Email Provider
```

### Frontend

Can be deployed using:

```text
Vercel
```

### Backend

Can be deployed using:

```text
Render
```

### Database

Use a hosted PostgreSQL provider.

---

# 🔒 14. Security

ClinicAssist follows several security practices:

- JWT authentication
- Role-based authorization
- Password hashing
- Environment-based secrets
- Server-side validation
- Protected API routes
- Database constraints
- CORS configuration
- OAuth-based Google integration
- API keys kept on the backend
- `.env` excluded from Git

> **Important:** ClinicAssist is a software project and should not be represented as medically certified or HIPAA-compliant unless the required legal, security, operational, and contractual requirements have actually been satisfied.

---

# 🧪 15. Development Commands

### Backend

```bash
cd backend
npm install
npm run dev
```

Prisma:

```bash
npx prisma generate
```

```bash
npx prisma migrate dev
```

Open Prisma Studio:

```bash
npx prisma studio
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Production build:

```bash
npm run build
```

---

# 🛠️ 16. Troubleshooting

### Backend cannot connect to PostgreSQL

Check:

```env
DATABASE_URL="..."
```

Then verify PostgreSQL is running.

Run:

```bash
npx prisma generate
```

and:

```bash
npx prisma migrate dev
```

### Google Sign-In does not work

Check:

```env
VITE_GOOGLE_CLIENT_ID="..."
```

and make sure:

```text
http://localhost:5173
```

is configured as an authorized JavaScript origin.

### Google Calendar does not work

Check:

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:4000/api/calendar/oauth/callback"
```

The redirect URI in Google Cloud must exactly match the URI used by the backend.

### Gemini does not generate summaries

Check:

```env
GEMINI_API_KEY="..."
```

and restart the backend after changing environment variables.

---

# 📌 17. Project Highlights

- 🏥 Full healthcare appointment workflow
- 👤 Separate patient, doctor, and admin portals
- 🤖 Gemini-powered pre-visit and post-visit summaries
- 🎫 Appointment token and queue management
- 📧 Automated email notifications
- 📅 Google Calendar integration
- 🔐 JWT authentication
- 🔑 Google Sign-In
- 🗄️ PostgreSQL + Prisma
- 📱 Responsive React frontend
- 🔒 Environment-based secret management
- ⚡ Modern React + TypeScript architecture

---

## 📄 License

This project is intended for educational, portfolio, and demonstration purposes.

---

### ClinicAssist

**Smart Healthcare Appointment & Follow-up Management**

Patient ↔ Doctor ↔ Admin  
Appointment Booking ↔ AI Visit Brief ↔ Queue Management ↔ Prescription ↔ Follow-up