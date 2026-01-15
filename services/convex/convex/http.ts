import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Register Better Auth routes with Convex
authComponent.registerRoutes(http, createAuth);

export default http;
