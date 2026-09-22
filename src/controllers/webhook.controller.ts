import type { Request, Response } from "express";
import {
  buildWhatsAppReply,
  handleWhatsAppMessage,
  parseWhatsAppWebhook,
  sendWhatsAppMessage,
  verifyWebhookRequest,
} from "../services/whatsapp.service.js";

export function verifyWebhook(req: Request, res: Response): void {
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
}

export async function processWebhook(
  req: Request,
  res: Response,
): Promise<void> {
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
}
