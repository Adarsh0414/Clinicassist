import { useCallback, useEffect, useRef, useState } from "react";
import { HeartPulse } from "./ui";

const DISMISS_KEY = "clinicassist-install-dismissed-at";
const DISMISS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // don't re-nag for a week

// Panel size (matches the w-[...] / max-h-[...] used on the card below). Kept as
// constants so the drag-clamping math and the markup can't drift out of sync.
const PANEL_WIDTH = "min(22rem, calc(100vw - 1.5rem))"; // ~352px, shrinks on narrow screens
const EDGE_GAP = 12; // px kept between the panel and the viewport edge while dragging

/** Where the launcher bubble / panel sits before the user has dragged it anywhere —
 *  top-right corner, just under the header, like a chat-widget launcher. */
function defaultCorner() {
  return { top: 84, right: 16 };
}

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

  // Chat-widget behaviour: `visible` means "the launcher bubble exists at all";
  // `open` means "the panel is expanded". Closing the panel (✕) just collapses it
  // back to the bubble — only "Not now" / accepting the install snoozes it away.
  const [open, setOpen] = useState(false);

  // Draggable position, anchored from top+right by default so it behaves sensibly
  // on any screen size without needing to know the panel's rendered width up front.
  const [pos, setPos] = useState(defaultCorner);
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; startPos: { top: number; right: number } } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const clampPos = useCallback((next: { top: number; right: number }) => {
    const panelW = panelRef.current?.offsetWidth ?? 320;
    const panelH = panelRef.current?.offsetHeight ?? 200;
    const maxTop = Math.max(EDGE_GAP, window.innerHeight - panelH - EDGE_GAP);
    const maxRight = Math.max(EDGE_GAP, window.innerWidth - panelW - EDGE_GAP);
    return {
      top: Math.min(Math.max(next.top, EDGE_GAP), maxTop),
      right: Math.min(Math.max(next.right, EDGE_GAP), maxRight),
    };
  }, []);

  const onDragPointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore drags started on interactive elements (close button etc).
    if ((e.target as HTMLElement).closest("button")) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPos: pos };
  }, [pos]);

  const onDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current?.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos(
      clampPos({
        top: dragState.current.startPos.top + dy,
        // dragging right (+dx) should shrink the distance-from-right-edge
        right: dragState.current.startPos.right - dx,
      })
    );
  }, [clampPos]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (dragState.current) dragState.current.dragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // Keep the panel on-screen if the window gets resized/rotated while it's open.
  useEffect(() => {
    if (!open) return;
    function onResize() {
      setPos((p) => clampPos(p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, clampPos]);

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

  // Collapsed state: a small round launcher bubble, chat-widget style. Clicking it
  // expands the draggable panel; it never blocks page content on its own.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Install ClinicAssist"
        style={{ top: pos.top, right: pos.right }}
        className="fixed z-30 w-12 h-12 rounded-full bg-transparent text-teal shadow-none flex items-center justify-center btn-press hover:bg-transparent transition-colors animate-fade-in-scale"
      >
        <HeartPulse className="text-lg" />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-coral border-2 border-white" />
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{ top: pos.top, right: pos.right, width: PANEL_WIDTH }}
      className="fixed z-30 max-w-[92vw] max-h-[80vh] overflow-auto animate-fade-in-scale"
    >
      <div className="glass-card rounded-xl shadow-card border border-line">
        {/* Drag handle — grab anywhere in the header to move the panel. Touch and
            mouse both work since these are pointer events. */}
        <div
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex items-center justify-between px-3 pt-2.5 pb-1 cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink/35">Drag to move</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Minimize"
            className="text-ink/30 hover:text-ink/60 text-sm leading-none px-1"
          >
            ✕
          </button>
        </div>

        <div className="flex items-start gap-3 p-4 pt-1">
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
        </div>
      </div>
    </div>
  );
}
