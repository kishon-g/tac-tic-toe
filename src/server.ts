import "dotenv/config";
import express, { type Request, type Response } from "express";
import { z } from "zod";

import {
  createGameState,
  getActiveGameState,
  ensureGameTable,
} from "./game-repository.ts";
import {
  buildWhatsAppReply,
  handleWhatsAppMessage,
  parseWhatsAppWebhook,
  sendWhatsAppMessage,
  verifyWebhookRequest,
} from "./whatsapp-bot.ts";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

const CreateGameSchema = z.object({
  sessionId: z.string().min(1),
  board: z.array(z.string()).length(9),
  currentPlayer: z.enum(["X", "O"]).default("X"),
  status: z.enum(["active", "won", "draw"]).default("active"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/webhook/whatsapp", (req: Request, res: Response) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "secret-token";
  const challenge = verifyWebhookRequest(
    req.query as Record<string, string | undefined>,
    verifyToken,
  );

  if (!challenge) {
    res.status(403).send("Forbidden");
    return;
  }

  res.status(200).send(challenge);
});

app.post("/webhook/whatsapp", async (req: Request, res: Response) => {
  const payload = parseWhatsAppWebhook(req.body);

  if (!payload) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const result = await handleWhatsAppMessage(payload);
  const reply = buildWhatsAppReply(result.message, payload.from);

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const outboundResults: unknown[] = [];

  if (accessToken && phoneNumberId) {
    try {
      const senderOutbound = await sendWhatsAppMessage(
        payload.from,
        result.message,
        accessToken,
        phoneNumberId,
      );
      outboundResults.push(senderOutbound);

      if (result.outboundMessages && result.outboundMessages.length > 0) {
        for (const item of result.outboundMessages) {
          const opponentOutbound = await sendWhatsAppMessage(
            item.to,
            item.text,
            accessToken,
            phoneNumberId,
          );
          outboundResults.push(opponentOutbound);
        }
      }

      res.status(200).json({
        ok: true,
        outbound: outboundResults,
        game: result.game ?? null,
      });
      console.log(
        "[WhatsApp Outbound Results]",
        JSON.stringify(outboundResults, null, 2),
      );
      return;
    } catch (error) {
      res.status(200).json({
        ok: true,
        error: error instanceof Error ? error.message : "send failed",
        reply,
        game: result.game ?? null,
      });
      return;
    }
  }

  res.status(200).json({
    ok: true,
    reply,
    outboundMessages: result.outboundMessages ?? [],
    game: result.game ?? null,
  });
});

app.post("/api/send-whatsapp", async (req: Request, res: Response) => {
  const { to, text } = req.body as { to?: string; text?: string };

  if (!to || !text) {
    res.status(400).json({ error: "Expected { to, text } payload" });
    return;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

  if (!accessToken || !phoneNumberId) {
    res.status(200).json({
      ok: true,
      payload: buildWhatsAppReply(text, to),
    });
    return;
  }

  try {
    const outbound = await sendWhatsAppMessage(
      to,
      text,
      accessToken,
      phoneNumberId,
    );

    res.status(200).json({ ok: true, outbound });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Send failed",
    });
  }
});

app.post("/api/game", async (req: Request, res: Response) => {
  try {
    const payload = CreateGameSchema.parse(req.body);
    const saved = await createGameState({
      gameId: payload.sessionId,
      sessionId: payload.sessionId,
      playerXId: payload.sessionId,
      playerXName: "Player X",
      playerOId: "player_o",
      playerOName: "Player O",
      board: payload.board,
      currentPlayer: payload.currentPlayer,
      status: payload.status,
      createdAt: payload.createdAt ?? new Date().toISOString(),
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
    });

    res.status(201).json(saved);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid game payload";
    res.status(400).json({ error: message });
  }
});

app.get("/api/game/:sessionId", async (req: Request, res: Response) => {
  const sessionId = Array.isArray(req.params.sessionId)
    ? req.params.sessionId[0]
    : req.params.sessionId;
  const game = await getActiveGameState(sessionId);

  if (!game) {
    res.status(404).json({ error: "No active game found for this session" });
    return;
  }

  res.json(game);
});

app.get("/api/game", async (_req: Request, res: Response) => {
  res.status(400).json({
    error: "Provide a sessionId in the path, e.g. /api/game/wa-session-123",
  });
});

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
