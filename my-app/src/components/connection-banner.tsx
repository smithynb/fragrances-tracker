"use client";

import { useConvex } from "convex/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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

type ConvexConnStatus = { isConnected: boolean; hasEverConnected: boolean };
const SERVER_CONN_STATUS: ConvexConnStatus = { isConnected: false, hasEverConnected: false };

function useConvexConnStatus(): ConvexConnStatus {
  const convex = useConvex();
  const cachedRef = useRef<ConvexConnStatus>(SERVER_CONN_STATUS);
  const subscribe = useCallback(
    (cb: () => void) => convex.subscribeToConnectionState(cb),
    [convex],
  );
  const getSnapshot = useCallback(() => {
    const state = convex.connectionState();
    const prev = cachedRef.current;
    if (
      prev.isConnected === state.isWebSocketConnected &&
      prev.hasEverConnected === state.hasEverConnected
    ) {
      return prev;
    }
    const next = {
      isConnected: state.isWebSocketConnected,
      hasEverConnected: state.hasEverConnected,
    };
    cachedRef.current = next;
    return next;
  }, [convex]);
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_CONN_STATUS);
}

export function ConnectionBanner() {
  const browserOnline = useSyncExternalStore(
    subscribeBrowserOnline,
    getBrowserOnline,
    getServerOnline,
  );
  const connStatus = useConvexConnStatus();
  const [graceTimerFired, setGraceTimerFired] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start grace timer only when we haven't connected yet
  useEffect(() => {
    if (connStatus.hasEverConnected) return;
    const timer = setTimeout(() => {
      setGraceTimerFired(true);
    }, INITIAL_CONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [connStatus.hasEverConnected]);

  // Derive disconnected status — hasEverConnected is used directly, no state needed
  const isDisconnected =
    !browserOnline ||
    (!connStatus.isConnected &&
      (connStatus.hasEverConnected || graceTimerFired));

  // Debounce: only set showBanner=true after sustained disconnection
  useEffect(() => {
    if (!isDisconnected) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setShowBanner(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setShowBanner(true);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
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
