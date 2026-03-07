"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Sparkles, Wine } from "lucide-react";

export function SignInScreen() {
  const { signIn } = useAuthActions();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      await signIn("google", { redirectTo: "/" });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start Google sign-in.",
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(228,188,120,0.28),_transparent_38%),linear-gradient(180deg,_var(--color-bg)_0%,_var(--color-surface)_100%)]">
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-6 py-16">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[32px] border border-border/50 bg-bg/85 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface-alt/70 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.28em] text-text-secondary">
              <Sparkles className="h-3.5 w-3.5" />
              Personal fragrance archive
            </div>

            <div className="mt-8 max-w-2xl space-y-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent/12 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <Wine className="h-8 w-8" />
              </div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">
                Sign in to track every bottle, wear, and note.
              </h1>
              <p className="max-w-xl text-base leading-7 text-text-secondary sm:text-lg">
                Use Google to unlock your personal collection, wear history, and
                fragrance stats across devices.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/50 bg-surface/70 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-secondary">
                  Collection
                </p>
                <p className="mt-3 text-sm leading-6 text-text">
                  Keep bottles, sizes, brands, and notes in one place.
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-surface/70 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-secondary">
                  Wear log
                </p>
                <p className="mt-3 text-sm leading-6 text-text">
                  Capture sprays, ratings, and context after each wear.
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-surface/70 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-secondary">
                  Private data
                </p>
                <p className="mt-3 text-sm leading-6 text-text">
                  Your bottles and logs stay scoped to your account.
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center">
            <div className="w-full rounded-[28px] border border-border/50 bg-surface/88 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.1)] backdrop-blur sm:p-10">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-text-secondary">
                Welcome back
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-text">
                Continue with Google
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Google OAuth is the only sign-in method enabled for this app.
              </p>

              <Button
                onClick={() => void handleGoogleSignIn()}
                disabled={isSigningIn}
                className="mt-8 h-12 w-full justify-center rounded-xl bg-white text-slate-900 shadow-[0_14px_30px_rgba(15,23,42,0.12)] hover:bg-white/90"
              >
                {isSigningIn ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-900">
                    G
                  </span>
                )}
                {isSigningIn ? "Redirecting..." : "Continue with Google"}
              </Button>

              {errorMessage ? (
                <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {errorMessage}
                </p>
              ) : null}

              <p className="mt-6 text-xs leading-5 text-text-secondary">
                By signing in you will be redirected to Google, then back to your
                Convex-powered dashboard.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
