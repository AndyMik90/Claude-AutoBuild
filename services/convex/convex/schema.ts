import { defineSchema } from "convex/server";
import { v } from "convex/values";

// Define the Convex schema with Better Auth tables
// Better Auth tables are managed by @convex-dev/better-auth
export default defineSchema({
  // User profiles (managed by Better Auth)
  // The plugin will create: user, session, account, verification tables
  // Custom tables for template library features
  // Add custom tables here as needed for template library functionality
});
