import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { isSafeInternalPath } from "@/lib/mcp/oauth-validation";

const isSignInPage = createRouteMatcher(["/signin"]);
const isProtectedRoute = createRouteMatcher(["/", "/oauth/authorize", "/settings(.*)"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const isAuthenticated = await convexAuth.isAuthenticated();

    if (isSignInPage(request) && isAuthenticated) {
      const target = request.nextUrl.searchParams.get("redirect");
      return nextjsMiddlewareRedirect(
        request,
        target && isSafeInternalPath(target) ? target : "/",
      );
    }

    if (isProtectedRoute(request) && !isAuthenticated) {
      const { pathname, search } = request.nextUrl;
      // Preserve where the user was headed (e.g. an OAuth authorize URL with
      // its full query) so sign-in can bounce them back.
      const suffix =
        pathname === "/" ? "" : `?redirect=${encodeURIComponent(`${pathname}${search}`)}`;
      return nextjsMiddlewareRedirect(request, `/signin${suffix}`);
    }
  },
  {
    cookieConfig: {
      maxAge: 60 * 60 * 24 * 30,
    },
  },
);

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
