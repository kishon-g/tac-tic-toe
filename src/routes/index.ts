import { Router } from "express";
import gameRouter from "./game.router.js";
import healthRouter from "./health.router.js";
import webhookRouter from "./webhook.router.js";

const router = Router();

router.use(healthRouter);
router.use(webhookRouter);
router.use(gameRouter);

export default router;
