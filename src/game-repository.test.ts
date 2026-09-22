import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMove,
  createEmptyBoard,
  findWinner,
  getNextPlayer,
} from "./services/game-logic.service.ts";
import {
  createOrUpdateSessionStats,
  getSessionStats,
} from "./repositories/game.repository.ts";
import {
  handleWhatsAppMessage,
  parseWhatsAppWebhook,
  verifyWebhookRequest,
} from "./services/whatsapp.service.ts";

test("createEmptyBoard creates a valid empty game board", () => {
  assert.deepEqual(createEmptyBoard(), ["", "", "", "", "", "", "", "", ""]);
});

test("applyMove records a valid move and toggles players", () => {
  const result = applyMove(["X", "", "", "", "", "", "", "", ""], 4, "O");

  assert.equal(result.board[4], "O");
  assert.equal(result.nextPlayer, "X");
  assert.equal(result.status, "active");
});

test("findWinner identifies a completed row", () => {
  const board = ["X", "X", "X", "", "", "", "", "", ""];
  assert.equal(findWinner(board), "X");
});

test("getNextPlayer toggles between X and O", () => {
  assert.equal(getNextPlayer("X"), "O");
  assert.equal(getNextPlayer("O"), "X");
});

test("session stats persist wins and draws per WhatsApp session", async () => {
  const stats = await createOrUpdateSessionStats({
    sessionId: "wa-stats-42",
    gamesPlayed: 1,
    xWins: 1,
    oWins: 0,
    draws: 0,
    lastUpdatedAt: new Date().toISOString(),
  });

  const stored = await getSessionStats("wa-stats-42");

  assert.equal(stats.gamesPlayed, 1);
  assert.equal(stored?.xWins, 1);
  assert.equal(stored?.draws, 0);
});

test("Meta webhook verification accepts the expected token and challenge", () => {
  const challenge = verifyWebhookRequest(
    {
      "hub.mode": "subscribe",
      "hub.challenge": "abc-123",
      "hub.verify_token": "secret-token",
    },
    "secret-token",
  );

  assert.equal(challenge, "abc-123");
});

test("Meta WhatsApp payload parser reads the sender, profile name, and message body", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [
                {
                  profile: { name: "Kishon" },
                  wa_id: "15551234567",
                },
              ],
              messages: [
                {
                  from: "15551234567",
                  text: { body: "start" },
                  type: "text",
                },
              ],
            },
          },
        ],
      },
    ],
  };

  assert.deepEqual(parseWhatsAppWebhook(payload), {
    from: "15551234567",
    body: "start",
    senderName: "Kishon",
  });
});

test("2-Player Workflow: Challenge, Accept, and Turn Enforcement", async () => {
  const player1 = "15551111111";
  const player2 = "15552222222";

  // 1. Player 1 sends challenge to Player 2
  const challengeRes = await handleWhatsAppMessage({
    from: player1,
    senderName: "Kishon",
    body: `play ${player2}`,
  });

  assert.match(challengeRes.message, /Challenge sent to \+15552222222/);
  assert.equal(challengeRes.outboundMessages?.length, 1);
  assert.equal(challengeRes.outboundMessages[0].to, player2);
  assert.match(challengeRes.outboundMessages[0].text, /Kishon/);

  // 2. Player 2 accepts challenge
  const acceptRes = await handleWhatsAppMessage({
    from: player2,
    senderName: "Sarah",
    body: "accept",
  });

  assert.match(acceptRes.message, /Game started! You are O/);
  assert.equal(acceptRes.outboundMessages?.length, 1);
  assert.equal(acceptRes.outboundMessages[0].to, player1);
  assert.match(
    acceptRes.outboundMessages[0].text,
    /Sarah accepted your challenge/,
  );

  // 3. Player 2 attempts to move out of turn (Player 1 / X goes first)
  const wrongTurnRes = await handleWhatsAppMessage({
    from: player2,
    senderName: "Sarah",
    body: "5",
  });

  assert.match(wrongTurnRes.message, /It's not your turn/);

  // 4. Player 1 makes valid move (square 5)
  const moveRes = await handleWhatsAppMessage({
    from: player1,
    senderName: "Kishon",
    body: "5",
  });

  assert.match(moveRes.message, /Move accepted/);
  assert.equal(moveRes.outboundMessages?.length, 1);
  assert.equal(moveRes.outboundMessages[0].to, player2);
  assert.match(moveRes.outboundMessages[0].text, /Kishon played square 5/);
});
