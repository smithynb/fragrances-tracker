import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomePage } from "@/components/home-page";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function Home() {
  if (!(await isAuthenticatedNextjs())) {
    redirect("/signin");
  }

  return <HomePage />;
}
