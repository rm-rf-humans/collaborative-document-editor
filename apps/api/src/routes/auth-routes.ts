import { Router } from "express";
import {
  authLoginRequestSchema,
  authLoginResponseSchema,
  authMeResponseSchema,
  listUsersResponseSchema
} from "@midterm/shared";
import { AuthService } from "../services/auth-service.js";
import { requireAuth } from "../middleware/require-auth.js";

export function createAuthRouter(auth: AuthService) {
  const router = Router();

  router.get("/users", (_request, response) => {
    response.json(listUsersResponseSchema.parse({
      users: auth.listUsers()
    }));
  });

  router.post("/auth/login", (request, response) => {
    const body = authLoginRequestSchema.parse(request.body);
    const payload = auth.login(body.userId);
    response.status(201).json(authLoginResponseSchema.parse(payload));
  });

  router.get("/auth/me", requireAuth(auth), (request, response) => {
    response.json(authMeResponseSchema.parse(request.auth));
  });

  return router;
}
