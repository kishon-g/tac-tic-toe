import { Router } from "express";
import {
  createGame,
  getGameBySessionId,
  handleGameMissingId,
  manualSendWhatsApp,
} from "../controllers/game.controller.js";

const router = Router();

router.post("/api/game", createGame);
router.get("/api/game/:sessionId", getGameBySessionId);
router.get("/api/game", handleGameMissingId);
router.post("/api/send-whatsapp", manualSendWhatsApp);

export default router;
