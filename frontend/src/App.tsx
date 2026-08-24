import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { RequireAuth } from "./components/RequireAuth";
import { InstallPrompt } from "./components/InstallPrompt";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyOtp from "./pages/VerifyOtp";
import ForgotPassword from "./pages/ForgotPassword";
import CalendarConnected from "./pages/CalendarConnected";
import Landing from "./pages/Landing";
import PatientBooking from "./pages/patient/PatientBooking";
import PatientAppointments from "./pages/patient/PatientAppointments";
import PatientProfile from "./pages/patient/PatientProfile";
import DoctorAgenda from "./pages/doctor/DoctorAgenda";
import DoctorProfile from "./pages/doctor/DoctorProfile";
import DoctorMessages from "./pages/doctor/DoctorMessages";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProfile from "./pages/admin/AdminProfile";

export default function App() {
  return (
    <>
      <InstallPrompt />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-otp" element={<VerifyOtp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route
        path="/patient/book"
        element={
          <RequireAuth roles={["PATIENT"]}>
            <Shell>
              <PatientBooking />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/patient/appointments"
        element={
          <RequireAuth roles={["PATIENT"]}>
            <Shell>
              <PatientAppointments />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/patient/profile"
        element={
          <RequireAuth roles={["PATIENT"]}>
            <Shell>
              <PatientProfile />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/doctor"
        element={
          <RequireAuth roles={["DOCTOR"]}>
            <Shell>
              <DoctorAgenda />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/doctor/profile"
        element={
          <RequireAuth roles={["DOCTOR"]}>
            <Shell>
              <DoctorProfile />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/doctor/messages"
        element={
          <RequireAuth roles={["DOCTOR"]}>
            <Shell>
              <DoctorMessages />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth roles={["ADMIN"]}>
            <Shell>
              <AdminDashboard />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/profile"
        element={
          <RequireAuth roles={["ADMIN"]}>
            <Shell>
              <AdminProfile />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/calendar-connected"
        element={
          <RequireAuth>
            <Shell>
              <CalendarConnected />
            </Shell>
          </RequireAuth>
        }
      />

      <Route path="/" element={<Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
