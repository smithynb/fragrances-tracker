"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Wine } from "lucide-react";

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
    <main className="relative min-h-dvh overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--color-accent-subtle),_var(--color-bg)_70%)]">
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>

      <div className="flex min-h-dvh items-center justify-center px-5">
        <div className="w-full max-w-[340px] animate-scale-in">
          <div className="rounded-2xl border border-border/40 bg-surface/80 p-8 shadow-[0_8px_40px_rgba(0,0,0,0.06)] backdrop-blur-sm">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                <Wine className="h-6 w-6" />
              </div>
              <span className="mt-3 font-display text-xl tracking-tight text-text">
                Fragrance Tracker
              </span>
            </div>

            <div className="my-7 h-px bg-border/50" />

            <Button
              onClick={() => void handleGoogleSignIn()}
              disabled={isSigningIn}
              className="h-11 w-full justify-center rounded-lg border border-border bg-surface-alt text-sm font-medium text-text shadow-none hover:bg-border/50 active:scale-[0.98]"
            >
              {isSigningIn ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              {isSigningIn ? "Redirecting..." : "Continue with Google"}
            </Button>

            {errorMessage ? (
              <p className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <p className="mt-4 text-center text-xs text-text-secondary/60">
            You&rsquo;ll be redirected to Google to sign in.
          </p>
        </div>
      </div>
    </main>
  );
}
