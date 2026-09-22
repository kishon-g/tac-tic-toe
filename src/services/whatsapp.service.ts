import {
  cancelActiveGamesForUser,
  createOrUpdateGame,
  getActiveGameForUser,
} from "../repositories/game.repository.js";
import {
  applyMove,
  createEmptyBoard,
  formatBoard,
} from "./game-logic.service.js";
import type {
  BotResponse,
  Player,
  WhatsAppMessage,
} from "../types/game.types.js";

export function verifyWebhookRequest(
  params: Record<string, string | undefined>,
  expectedToken: string,
): string | null {
  const mode = params["hub.mode"];
  const token = params["hub.verify_token"];
  const challenge = params["hub.challenge"];

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return challenge;
  }

  return null;
}

export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export async function handleWhatsAppMessage(
  message: WhatsAppMessage,
): Promise<BotResponse> {
  const senderId = normalizePhoneNumber(message.from);
  const senderName = message.senderName || `+${senderId}`;
  const trimmedBody = message.body.trim();
  const lowerBody = trimmedBody.toLowerCase();

  // 1. Challenge Command: "play <number>", "challenge <number>", or "start <number>"
  const challengeMatch = trimmedBody.match(
    /^(?:play|challenge|start)\s+(\+?\d[\d\s-]{6,15})$/i,
  );
  if (challengeMatch) {
    const rawTarget = challengeMatch[1];
    const targetId = normalizePhoneNumber(rawTarget);

    if (!targetId || targetId.length < 7) {
      return {
        message:
          'Invalid phone number format. Please send "play <country_code><phone_number>" with a valid mobile number.',
      };
    }

    if (targetId === senderId) {
      return {
        message:
          "You cannot challenge yourself! Please specify a friend's phone number.",
      };
    }

    // Cancel existing pending/active matches for sender
    await cancelActiveGamesForUser(senderId);

    const gameId = `game_${Date.now()}_${senderId}`;
    const newGame = await createOrUpdateGame({
      gameId,
      playerXId: senderId,
      playerXName: senderName,
      playerOId: targetId,
      playerOName: `+${targetId}`,
      board: createEmptyBoard(),
      currentPlayer: "X",
      status: "pending_invite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      message: `🎮 Challenge sent to +${targetId}! Waiting for them to reply "accept"...`,
      outboundMessages: [
        {
          to: targetId,
          text: `🎮 ${senderName} (+${senderId}) has challenged you to a game of Tic-Tac-Toe!\n\nReply "accept" to play as O, or "decline" to reject.`,
        },
      ],
      game: newGame,
    };
  }

  // 2. Accept or Decline Pending Invitation
  if (lowerBody === "accept" || lowerBody === "decline") {
    const activeGame = await getActiveGameForUser(senderId);

    if (
      !activeGame ||
      activeGame.status !== "pending_invite" ||
      activeGame.playerOId !== senderId
    ) {
      return {
        message:
          'No pending invitation found for you. To start a game, send "play <country_code><phone_number>"".',
      };
    }

    if (lowerBody === "decline") {
      const cancelledGame = await createOrUpdateGame({
        ...activeGame,
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      });

      return {
        message: "Challenge declined.",
        outboundMessages: [
          {
            to: activeGame.playerXId,
            text: `❌ ${senderName} (+${senderId}) declined your game challenge.`,
          },
        ],
        game: cancelledGame,
      };
    }

    // Accept invitation
    const startedGame = await createOrUpdateGame({
      ...activeGame,
      playerOName: senderName,
      status: "active",
      updatedAt: new Date().toISOString(),
    });

    return {
      message: `🎮 Game started! You are O. Waiting for ${startedGame.playerXName} (X) to make their move.\n\nBoard:\n${formatBoard(startedGame.board)}`,
      outboundMessages: [
        {
          to: startedGame.playerXId,
          text: `🎮 ${senderName} accepted your challenge! Game started. It is your turn (X).\n\nBoard:\n${formatBoard(startedGame.board)}\n\nReply 1-9 to move.`,
        },
      ],
      game: startedGame,
    };
  }

  // 3. Game Move (1-9)
  const parsedMove = Number.parseInt(trimmedBody, 10);
  if (!Number.isNaN(parsedMove) && parsedMove >= 1 && parsedMove <= 9) {
    const activeGame = await getActiveGameForUser(senderId);

    if (!activeGame || activeGame.status !== "active") {
      return {
        message:
          'No active game found. To challenge a friend, reply with "play <country_code><phone_number>"".',
      };
    }

    // Check turn order
    if (activeGame.currentPlayer === "X" && senderId !== activeGame.playerXId) {
      return {
        message: `It's not your turn! Waiting for ${activeGame.playerXName} (X) to move.`,
        game: activeGame,
      };
    }

    if (activeGame.currentPlayer === "O" && senderId !== activeGame.playerOId) {
      return {
        message: `It's not your turn! Waiting for ${activeGame.playerOName} (O) to move.`,
        game: activeGame,
      };
    }

    const boardIndex = parsedMove - 1;
    const currentPlayer = activeGame.currentPlayer as Player;

    try {
      const result = applyMove(activeGame.board, boardIndex, currentPlayer);
      const updatedGame = await createOrUpdateGame({
        ...activeGame,
        board: result.board,
        currentPlayer: result.nextPlayer,
        status: result.status,
        updatedAt: new Date().toISOString(),
      });

      const opponentId =
        senderId === activeGame.playerXId
          ? activeGame.playerOId
          : activeGame.playerXId;
      const currentMoverName =
        senderId === activeGame.playerXId
          ? activeGame.playerXName
          : activeGame.playerOName;
      const nextPlayerName =
        result.nextPlayer === "X"
          ? activeGame.playerXName
          : activeGame.playerOName;

      if (result.winner) {
        const winnerName =
          result.winner === "X"
            ? activeGame.playerXName
            : activeGame.playerOName;

        return {
          message: `🎉 Congratulations! You won the game!\n\nFinal Board:\n${formatBoard(result.board)}`,
          outboundMessages: [
            {
              to: opponentId,
              text: `🏆 Game over! ${winnerName} won.\n\nFinal Board:\n${formatBoard(result.board)}`,
            },
          ],
          game: updatedGame,
        };
      }

      if (result.status === "draw") {
        return {
          message: `🤝 Game ended in a draw!\n\nFinal Board:\n${formatBoard(result.board)}`,
          outboundMessages: [
            {
              to: opponentId,
              text: `🤝 Game ended in a draw!\n\nFinal Board:\n${formatBoard(result.board)}`,
            },
          ],
          game: updatedGame,
        };
      }

      return {
        message: `Move accepted. It is now ${nextPlayerName}'s turn (${result.nextPlayer}).\n\nBoard:\n${formatBoard(result.board)}`,
        outboundMessages: [
          {
            to: opponentId,
            text: `🎮 ${currentMoverName} played square ${parsedMove}.\n\nIt is your turn (${result.nextPlayer})!\n\nBoard:\n${formatBoard(result.board)}\n\nReply 1-9 to move.`,
          },
        ],
        game: updatedGame,
      };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : "Invalid move.",
        game: activeGame,
      };
    }
  }

  // 4. Default Instructions / Help
  return {
    message:
      `Welcome to WhatsApp 2-Player Tic-Tac-Toe!\n\n` +
      `To play with a friend:\n` +
      `• Send: play <country_code><country_code><phone_number>" (e.g. play +94771234567)\n\n` +
      `Your friend will receive an invitation to accept!`,
  };
}

export function parseWhatsAppWebhook(payload: unknown): WhatsAppMessage | null {
  const obj = payload as Record<string, any>;
  const entry = Array.isArray(obj?.entry) ? obj.entry[0] : undefined;
  const changes = Array.isArray(entry?.changes) ? entry.changes[0] : undefined;
  const value = changes?.value;
  const message = Array.isArray(value?.messages)
    ? value.messages[0]
    : undefined;
  const contact = Array.isArray(value?.contacts)
    ? value.contacts[0]
    : undefined;

  const from = message?.from ?? "";
  const body = message?.text?.body ?? "";
  const senderName = contact?.profile?.name ?? undefined;

  if (!from || !body) {
    return null;
  }

  return { from, body, senderName };
}

export function buildWhatsAppReply(text: string, to: string) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };
}

export async function sendWhatsAppMessage(
  to: string,
  text: string,
  accessToken: string,
  phoneNumberId: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    },
  );

  const body = await response.json();
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}
