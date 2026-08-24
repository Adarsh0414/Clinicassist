import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { HeartPulse, PulseRule } from "../components/ui";

export default function Landing() {
  const { user } = useAuth();
  const dashboardPath = user ? (user.role === "PATIENT" ? "/patient/book" : user.role === "DOCTOR" ? "/doctor" : "/admin") : "/login";

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="ambient-blob absolute -top-40 -left-32 w-[32rem] h-[32rem] rounded-full bg-teal/20 blur-3xl" />
        <div className="ambient-blob absolute top-1/4 -right-32 w-96 h-96 rounded-full bg-amber/15 blur-3xl" style={{ animationDelay: "-6s" }} />
      </div>

      {/* Nav */}
      <header className="glass-nav border-b border-line sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeartPulse className="text-xl" />
            <span className="font-serif text-lg font-semibold tracking-tight">ClinicAssist</span>
          </div>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link to={dashboardPath} className="text-sm font-semibold bg-teal text-white rounded-lg px-4 py-2 hover:bg-teal-dark transition-colors">
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-medium text-ink/70 hover:text-ink px-3 py-2">
                  Sign in
                </Link>
                <Link to="/register" className="text-sm font-semibold bg-teal text-white rounded-lg px-4 py-2 hover:bg-teal-dark transition-colors">
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-2 gap-12 items-center">
        <div className="animate-fade-in">
          <span className="badge bg-teal-light text-teal-dark mb-5">AI-assisted clinic scheduling</span>
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold leading-[1.1] tracking-tight">
            Appointments that <span className="text-teal">know what's coming.</span>
          </h1>
          <p className="text-ink/60 text-lg mt-5 max-w-md">
            Patients describe symptoms before they arrive. Doctors get an AI-written brief and a live queue instead of a
            guessing game. Everyone gets the confirmation, reminder, and follow-up — without anyone chasing anyone.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to={user ? dashboardPath : "/register"} className="btn-press bg-teal text-white font-semibold rounded-lg px-6 py-3 hover:bg-teal-dark transition-colors">
              {user ? "Go to dashboard" : "Book your first visit"}
            </Link>
            <Link to="/login" className="btn-press bg-white border border-line font-semibold rounded-lg px-6 py-3 hover:bg-teal-light transition-colors">
              Sign in
            </Link>
          </div>
          <div className="text-teal/25 mt-10 max-w-xs">
            <PulseRule />
          </div>
        </div>

        {/* Signature element: a live-feeling queue widget mirroring the real doctor dashboard,
            with a second floating "AI Visit Brief" card overlapping it — proof of the product,
            not decoration or stock photography. */}
        <div className="relative animate-fade-in-scale soft-float">
          <div className="glass-card rounded-2xl shadow-card p-6 max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-ink/50 uppercase tracking-wide">Dr. Adarsh Singh · Today</span>
              <span className="badge bg-teal-light text-teal-dark">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-dark pulse-dot" /> Live
              </span>
            </div>
            <p className="text-xs text-ink/50">Now serving</p>
            <p className="font-serif text-5xl font-bold text-teal-dark leading-none mt-1">#14</p>
            <p className="text-sm text-ink/60 mt-1">Anoushak Singh · Follow-up</p>

            <div className="border-t border-line mt-5 pt-4">
              <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">Up next</p>
              <div className="space-y-2">
                {[
                  { token: 15, name: "Aaru Singh", urgency: "Medium" },
                  { token: 16, name: "Tanya Singhania", urgency: "Low" },
                  { token: 17, name: "Samrathe Kulkarni", urgency: "Low" },
                ].map((p) => (
                  <div key={p.token} className="flex items-center justify-between bg-white border border-line rounded-lg px-3 py-2">
                    <span className="text-sm font-medium">
                      <span className="font-mono text-ink/50 mr-2">#{p.token}</span>
                      {p.name}
                    </span>
                    <span className={`badge ${p.urgency === "Medium" ? "bg-amber-light text-amber" : "bg-teal-light text-teal-dark"}`}>
                      {p.urgency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Overlapping AI brief card — hidden on small screens where there's no room to float it */}
          <div className="hidden lg:block absolute -bottom-20 -right-12 w-64 glass-card rounded-xl shadow-card p-4 opacity-20 animate-fade-in-scale" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-ink/50 uppercase tracking-wide flex items-center gap-1">
                ✨ AI Visit Brief
              </span>
            </div>
            <span className="badge bg-amber-light text-amber mb-2">Medium urgency</span>
            <p className="text-xs text-ink/70 leading-relaxed">Dry cough and mild fever for 3 days, worse at night.</p>
            <div className="mt-2 space-y-1 text-[11px] text-ink/50">
              <p>⊘ No shortness of breath</p>
              <p>⊘ No chest pain</p>
            </div>
            <p className="text-[10px] text-ink/35 mt-2">Generated 2 mins ago</p>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="font-serif text-2xl font-semibold text-center mb-2">One app, three very different days</h2>
        <p className="text-ink/60 text-center max-w-lg mx-auto mb-10">
          Patients, doctors, and clinic admins all use ClinicAssist — but each sees exactly what their day requires.
        </p>
        <div className="grid sm:grid-cols-3 gap-5">
          <RoleCard
            title="Patients"
            description="Book by specialization, describe symptoms in advance, track your token and queue position, and get a plain-language summary after every visit."
            accent="teal"
            photo="/images/patient.png"
            photoAlt="A patient checking their appointment on a phone"
          />
          <RoleCard
            title="Doctors"
            description="Walk into each visit with an AI-written brief and urgency flag. Run today's queue, write prescriptions with clear fields, and manage your own schedule."
            accent="amber"
            photo="/images/doctor.png"
            photoAlt="A doctor reviewing a patient brief on a tablet"
          />
          <RoleCard
            title="Admins"
            description="Manage the doctor roster, leave requests, and notification delivery from one console — with an audit-ready log of what went out and why."
            accent="coral"
            photo="/images/admin.png"
            photoAlt="A clinic administrator working on a laptop"
          />
        </div>
      </section>

      {/* Trust band */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="glass-card rounded-2xl border border-line px-6 py-6 flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
          <div className="flex items-center gap-3 sm:pr-6 sm:border-r sm:border-line">
            <div className="w-10 h-10 rounded-full bg-teal-light flex items-center justify-center shrink-0">
              <HeartPulse className="text-base" />
            </div>
            <div>
              <p className="font-semibold text-sm">Secure. Private. Compliant.</p>
              <p className="text-xs text-ink/50">Your data is protected with enterprise-grade security and industry best practices.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-ink/60 font-medium">
            <span>🛡️ HIPAA-minded design</span>
            <span>🔒 256-bit encryption</span>
            <span>🔐 Secure infrastructure</span>
          </div>
        </div>
      </section>

      <footer className="text-center text-xs text-ink/40 py-8 border-t border-line">
        ClinicAssist — Smart Healthcare Appointment &amp; Follow-up Management
      </footer>
    </div>
  );
}

function RoleCard({
  title,
  description,
  accent,
  photo,
  photoAlt,
}: {
  title: string;
  description: string;
  accent: "teal" | "amber" | "coral";
  photo: string;
  photoAlt: string;
}) {
  const accentClass = { teal: "bg-teal-light text-teal-dark", amber: "bg-amber-light text-amber", coral: "bg-coral-light text-coral" }[accent];
  return (
    <div className="card-hover bg-white border border-line rounded-xl overflow-hidden">
      <div className="h-36 w-full overflow-hidden bg-line">
        <img src={photo} alt={photoAlt} loading="lazy" className="w-full h-full object-cover" />
      </div>
      <div className="p-6">
        <div className={`w-8 h-8 rounded-lg ${accentClass} flex items-center justify-center font-serif font-semibold mb-4`}>
          {title[0]}
        </div>
        <h3 className="font-semibold mb-1.5">{title}</h3>
        <p className="text-sm text-ink/60 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
