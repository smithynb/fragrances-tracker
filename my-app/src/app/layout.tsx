import type { Metadata } from "next";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Geist, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fragrance Tracker",
    template: "%s | Fragrance Tracker",
  },
  description: "Track your fragrance collection and wear history",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} antialiased`}
      >
        <ClerkProvider>
          <Providers>
            <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-end">
              <header className="pointer-events-auto animate-fade-up rounded-full border border-border/70 bg-surface/90 p-1.5 shadow-lg shadow-black/5 backdrop-blur dark:shadow-black/20">
                <Show when="signed-out">
                  <div className="flex items-center gap-1.5">
                    <SignInButton>
                      <button
                        className="rounded-full px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-alt hover:text-text"
                        type="button"
                      >
                        Sign in
                      </button>
                    </SignInButton>
                    <SignUpButton>
                      <button
                        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover dark:text-bg"
                        type="button"
                      >
                        Sign up
                      </button>
                    </SignUpButton>
                  </div>
                </Show>

                <Show when="signed-in">
                  <div className="flex items-center px-1">
                    <UserButton />
                  </div>
                </Show>
              </header>
            </div>

            {children}
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
