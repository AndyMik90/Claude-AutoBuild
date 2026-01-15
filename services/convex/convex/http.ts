import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Register Better Auth routes with Convex
// This will handle CORS based on the trustedOrigins configuration in auth.ts
authComponent.registerRoutes(http, createAuth);

export default http;
