import http from "node:http";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const { app, context } = createApp();
const server = http.createServer(app);

context.hub.attach(server);

server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`AI provider: ${context.ai.getProviderStatus().message}`);
});
