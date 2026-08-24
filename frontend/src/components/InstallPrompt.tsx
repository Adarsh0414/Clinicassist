import { useEffect, useState } from "react";
import { HeartPulse } from "./ui";

const DISMISS_KEY = "clinicassist-install-dismissed-at";
const DISMISS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // don't re-nag for a week

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for "launched from home screen"
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_SNOOZE_MS;
}

/** A small, dismissible "Install ClinicAssist" banner. On Chrome/Edge/Android it captures
 *  the native beforeinstallprompt event and triggers the real install flow. iOS Safari
 *  doesn't support that event at all, so there it just shows the manual "Add to Home
 *  Screen" steps instead. Renders nothing once the app is already installed/standalone,
 *  already dismissed recently, or (on non-iOS) no install prompt is available yet. */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    function onInstalled() {
      setInstalled(true);
      setVisible(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show the manual banner after a short delay
    // instead, so it doesn't compete with the initial page paint.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      iosTimer = setTimeout(() => setVisible(true), 1500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setShowIosSteps(false);
  }

  async function install() {
    if (!deferredPrompt) {
      if (isIos()) setShowIosSteps(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    } else {
      dismiss();
    }
    setDeferredPrompt(null);
  }

  if (!visible || installed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-sm animate-fade-in-scale">
      <div className="glass-card rounded-xl shadow-card border border-line p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-light flex items-center justify-center shrink-0">
            <HeartPulse className="text-lg" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">Install ClinicAssist</p>
            <p className="text-xs text-ink/60 mt-0.5">
              {isIos()
                ? "Add it to your Home Screen for one-tap access, even offline."
                : "Get one-tap access from your home screen, with offline support."}
            </p>

            {showIosSteps ? (
              <ol className="text-xs text-ink/70 mt-2 space-y-1 list-decimal list-inside">
                <li>
                  Tap the <span className="font-semibold">Share</span> icon in Safari's toolbar
                </li>
                <li>
                  Choose <span className="font-semibold">Add to Home Screen</span>
                </li>
                <li>
                  Tap <span className="font-semibold">Add</span> to confirm
                </li>
              </ol>
            ) : (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={install}
                  className="btn-press bg-teal text-white text-xs font-semibold rounded-lg px-3 py-1.5 hover:bg-teal-dark transition-colors"
                >
                  Install
                </button>
                <button
                  onClick={dismiss}
                  className="text-xs font-medium text-ink/50 hover:text-ink px-2 py-1.5"
                >
                  Not now
                </button>
              </div>
            )}
          </div>
          <button onClick={dismiss} aria-label="Dismiss" className="text-ink/30 hover:text-ink/60 text-sm leading-none px-1">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
