import type { Request, Response } from "express";
import { z } from "zod";
import {
  createGameState,
  getActiveGameState,
} from "../repositories/game.repository.js";
import {
  buildWhatsAppReply,
  sendWhatsAppMessage,
} from "../services/whatsapp.service.js";

const CreateGameSchema = z.object({
  sessionId: z.string().min(1),
  board: z.array(z.string()).length(9),
  currentPlayer: z.enum(["X", "O"]).default("X"),
  status: z
    .enum(["active", "won", "draw", "pending_invite", "cancelled"])
    .default("active"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export async function createGame(req: Request, res: Response): Promise<void> {
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
}

export async function getGameBySessionId(
  req: Request,
  res: Response,
): Promise<void> {
  const sessionId = Array.isArray(req.params.sessionId)
    ? req.params.sessionId[0]
    : req.params.sessionId;
  const game = await getActiveGameState(sessionId);

  if (!game) {
    res.status(404).json({ error: "No active game found for this session" });
    return;
  }

  res.json(game);
}

export async function handleGameMissingId(
  _req: Request,
  res: Response,
): Promise<void> {
  res.status(400).json({
    error: "Provide a sessionId in the path, e.g. /api/game/wa-session-123",
  });
}

export async function manualSendWhatsApp(
  req: Request,
  res: Response,
): Promise<void> {
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
}
