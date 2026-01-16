import type { AuthConfig } from "convex/server";

const convexSiteUrl = process.env.CONVEX_SITE_URL || process.env.CONVEX_URL;

if (!convexSiteUrl) {
  throw new Error("CONVEX_SITE_URL or CONVEX_URL must be set in environment variables");
}

export default {
  providers: [
    {
      domain: convexSiteUrl,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
