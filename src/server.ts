import "dotenv/config";
import express from "express";

import { ensureGameTable } from "./repositories/game.repository.js";
import routes from "./routes/index.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(routes);

async function start() {
  await ensureGameTable();
  app.listen(port, "0.0.0.0", () => {
    console.log(`WhatsApp Tic-Tac-Toe server listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

export default app;
