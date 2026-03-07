import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/sign-in-screen";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function SignInPage() {
  if (await isAuthenticatedNextjs()) {
    redirect("/");
  }

  return <SignInScreen />;
}
