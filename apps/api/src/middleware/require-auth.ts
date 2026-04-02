import type { NextFunction, Request, Response } from "express";
import { AuthService } from "../services/auth-service.js";
import { AppError } from "../utils/errors.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: ReturnType<AuthService["requireUserByToken"]>;
  }
}

export function requireAuth(auth: AuthService) {
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      const authorization = request.header("authorization") ?? "";
      const token = authorization.replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        throw new AppError(401, "UNAUTHORIZED", "A bearer token is required.");
      }

      request.auth = auth.requireUserByToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
