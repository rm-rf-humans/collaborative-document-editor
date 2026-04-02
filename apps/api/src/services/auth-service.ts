import type { Session, User } from "@midterm/shared";
import { AppError, assert } from "../utils/errors.js";
import { InMemoryStore } from "../repositories/in-memory-store.js";

export class AuthService {
  constructor(private readonly store: InMemoryStore) {}

  listUsers() {
    return this.store.listUsers();
  }

  login(userId: string) {
    return this.store.createSession(userId);
  }

  requireUserByToken(token: string): { session: Session; user: User } {
    const sessionUser = this.store.getUserFromSession(token);
    assert(sessionUser, new AppError(401, "UNAUTHORIZED", "A valid session is required."));
    return sessionUser;
  }
}
