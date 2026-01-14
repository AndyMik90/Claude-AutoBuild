import { defineSchema } from "convex/server";

// Define the Convex schema
// Better Auth tables will be auto-generated in the _generated folder
// We can add custom tables here later for template library features
export default defineSchema({
  // Custom tables will be added here as needed
  // Example:
  // templates: defineTable({
  //   name: v.string(),
  //   description: v.optional(v.string()),
  //   createdAt: v.number(),
  // })
});
