import { type AuthConfig } from "convex/server";

const clerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!clerkIssuerDomain) {
  throw new Error(
    "CLERK_JWT_ISSUER_DOMAIN must be set in the Convex environment. " +
      "Use the issuer for the Clerk instance you actually sign into, " +
      "including a Clerk development instance."
  );
}

export default {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
