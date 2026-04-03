import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { errorResponseSchema } from "@midterm/shared";
import { InMemoryStore } from "./repositories/in-memory-store.js";
import { AuthService } from "./services/auth-service.js";
import { DocumentService } from "./services/document-service.js";
import { AiService } from "./services/ai-service.js";
import { createAiProvider } from "./services/create-ai-provider.js";
import { FastApiExportService, type DocumentExporter } from "./services/export-service.js";
import { createAuthRouter } from "./routes/auth-routes.js";
import { createDocumentRouter } from "./routes/document-routes.js";
import { CollaborationHub } from "./realtime/collaboration-hub.js";
import { AppError } from "./utils/errors.js";

export type ApplicationContext = {
  auth: AuthService;
  documents: DocumentService;
  ai: AiService;
  hub: CollaborationHub;
  exporter: DocumentExporter;
};

export function createApplicationContext(): ApplicationContext {
  const store = new InMemoryStore();
  const auth = new AuthService(store);
  const documents = new DocumentService(store);
  const provider = createAiProvider();
  const exporter = new FastApiExportService();
  let hub: CollaborationHub | null = null;

  const ai = new AiService(documents, provider, (documentId, interaction) => {
    hub?.broadcastAiCompletion(documentId, interaction);
  });

  hub = new CollaborationHub(auth, documents);

  return {
    auth,
    documents,
    ai,
    hub,
    exporter
  };
}

export function createApp(context = createApplicationContext()) {
  const app = express();

  app.use(cors({
    origin: "http://localhost:5173"
  }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/v1", createAuthRouter(context.auth));
  app.use("/v1", createDocumentRouter(context.auth, context.documents, context.ai, context.hub, context.exporter));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const appError = error instanceof AppError
      ? error
      : new AppError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.", true);

    response.status(appError.statusCode).json(errorResponseSchema.parse({
      error: {
        code: appError.code,
        message: appError.message,
        retryable: appError.retryable
      }
    }));
  });

  return { app, context };
}
