import { Button } from "./ui";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = true, onConfirm, onCancel, submitting }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-6 animate-fade-in">
      <div className="glass-card bg-white rounded-xl shadow-card max-w-sm w-full p-6 animate-fade-in-scale">
        <h3 className="font-serif text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-ink/70 mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={submitting}>
            {submitting ? "Please wait…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
