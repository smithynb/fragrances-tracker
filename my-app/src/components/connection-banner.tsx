"use client";

import { useConvex } from "convex/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

const DEBOUNCE_MS = 2000;
const INITIAL_CONNECT_GRACE_MS = 5000;

function subscribeBrowserOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getBrowserOnline() {
  return navigator.onLine;
}

function getServerOnline() {
  return true;
}

export function ConnectionBanner() {
  const convex = useConvex();
  const browserOnline = useSyncExternalStore(
    subscribeBrowserOnline,
    getBrowserOnline,
    getServerOnline,
  );
  const [wsDisconnected, setWsDisconnected] = useState(false);
  const [initialConnectTimedOut, setInitialConnectTimedOut] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!initialConnectTimedOut) {
      graceTimerRef.current = setTimeout(() => {
        setInitialConnectTimedOut(true);
      }, INITIAL_CONNECT_GRACE_MS);
    }

    const unsubscribe = convex.subscribeToConnectionState((state) => {
      if (state.hasEverConnected && graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      setWsDisconnected(
        !state.isWebSocketConnected &&
          (state.hasEverConnected || initialConnectTimedOut),
      );
    });
    return () => {
      unsubscribe();
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, [convex, initialConnectTimedOut]);

  const isDisconnected = !browserOnline || wsDisconnected;

  useEffect(() => {
    if (isDisconnected) {
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          setShowBanner(true);
          timerRef.current = null;
        }, DEBOUNCE_MS);
      }
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowBanner(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isDisconnected]);

  if (!showBanner) return null;

  return (
    <>
      <div
        role="alert"
        aria-live="assertive"
        className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 bg-danger px-4 py-2.5 text-sm font-medium text-white shadow-lg animate-fade-in"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>
          Connection lost &mdash; your changes will not be saved until the
          connection is restored.
        </span>
      </div>
      <div className="h-10 shrink-0" />
    </>
  );
}
