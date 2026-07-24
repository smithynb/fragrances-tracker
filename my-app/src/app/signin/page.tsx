import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/sign-in-screen";
import { isSafeInternalPath } from "@/lib/mcp/oauth-validation";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const target =
    redirectParam && isSafeInternalPath(redirectParam) ? redirectParam : "/";

  if (await isAuthenticatedNextjs()) {
    redirect(target);
  }

  return <SignInScreen redirectTo={target} />;
}
