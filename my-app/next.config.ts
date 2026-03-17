import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent the page from being embedded in iframes (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },

          // Stop browsers from MIME-sniffing the content-type.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Only send the origin as referrer to external sites.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },

          // Disable browser features the app doesn't use.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },

          // NOTE: Strict-Transport-Security is intentionally omitted.
          // Vercel enforces HTTPS and sets HSTS automatically on all
          // deployments — adding it here would only duplicate the header.

          // Content-Security-Policy — allow Convex, Google Fonts, and
          // Google OAuth while blocking everything else by default.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud wss://*.convex.site https://accounts.google.com",
              "img-src 'self' data:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
