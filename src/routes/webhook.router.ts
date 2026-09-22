import { Router } from "express";
import {
  processWebhook,
  verifyWebhook,
} from "../controllers/webhook.controller.js";

const router = Router();

router.get("/webhook/whatsapp", verifyWebhook);
router.post("/webhook/whatsapp", processWebhook);

export default router;

