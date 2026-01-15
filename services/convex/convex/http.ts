import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Register Better Auth routes with Convex
// Enable CORS for Electron cross-origin renderer
// The app:// protocol is used in production to avoid Origin: null issues
// Development uses http://localhost:5173
authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: ["app://-", "http://localhost:5173", "http://localhost:3000"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Length", "Content-Type"],
  },
});

export default http;
