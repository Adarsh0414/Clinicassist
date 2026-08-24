import { Link } from "react-router-dom";
import { Card } from "../components/ui";

export default function CalendarConnected() {
  return (
    <div className="max-w-md mx-auto text-center">
      <Card>
        <div className="w-10 h-10 rounded-full bg-teal-light text-teal flex items-center justify-center mx-auto mb-3 font-bold">
          ✓
        </div>
        <h1 className="font-serif text-xl font-semibold mb-1">Google Calendar connected</h1>
        <p className="text-sm text-ink/60 mb-4">
          Future appointments will now sync to your calendar automatically.
        </p>
        <Link to="/" className="text-teal font-medium text-sm hover:underline">
          Return to ClinicAssist
        </Link>
      </Card>
    </div>
  );
}
