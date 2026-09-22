import { PrismaClient } from "@prisma/client";
import type {
  GameState,
  GameStatus,
  Player,
  SessionStats,
} from "../types/game.types.js";

const inMemoryGames = new Map<string, GameState>();
const inMemorySessionStats = new Map<string, SessionStats>();
let memoryFallbackEnabled =
  process.env.USE_IN_MEMORY_DB === "true" || process.env.NODE_ENV === "test";

const prisma = new PrismaClient();

function normalizeBoard(board: string[]): string[] {
  if (board.length !== 9) {
    throw new Error("Board must contain exactly 9 cells.");
  }

  return board.map((cell) => (cell === "X" || cell === "O" ? cell : ""));
}

export async function ensureGameTable(): Promise<void> {
  // Prisma manages tables automatically
}

export async function createOrUpdateGame(
  gameState: GameState,
): Promise<GameState> {
  const normalizedBoard = normalizeBoard(gameState.board);
  const now = new Date();
  const nowIso = now.toISOString();
  const gameId =
    gameState.gameId || gameState.sessionId || `game_${Date.now()}`;
  const payload: GameState = {
    ...gameState,
    gameId,
    sessionId: gameId,
    board: normalizedBoard,
    currentPlayer: gameState.currentPlayer === "O" ? "O" : "X",
    status: gameState.status,
    createdAt: gameState.createdAt || nowIso,
    updatedAt: gameState.updatedAt || nowIso,
  };

  if (memoryFallbackEnabled) {
    const saved = { ...payload, id: inMemoryGames.size + 1 };
    inMemoryGames.set(gameId, saved);
    return saved;
  }

  try {
    const result = await prisma.gameMatch.upsert({
      where: { gameId },
      update: {
        playerXId: payload.playerXId,
        playerXName: payload.playerXName,
        playerOId: payload.playerOId,
        playerOName: payload.playerOName,
        board: payload.board,
        currentPlayer: payload.currentPlayer,
        status: payload.status,
        updatedAt: now,
      },
      create: {
        gameId,
        playerXId: payload.playerXId,
        playerXName: payload.playerXName,
        playerOId: payload.playerOId,
        playerOName: payload.playerOName,
        board: payload.board,
        currentPlayer: payload.currentPlayer,
        status: payload.status,
        createdAt: gameState.createdAt ? new Date(gameState.createdAt) : now,
        updatedAt: now,
      },
    });

    return {
      id: result.id,
      gameId: result.gameId,
      playerXId: result.playerXId,
      playerXName: result.playerXName,
      playerOId: result.playerOId,
      playerOName: result.playerOName,
      board: result.board,
      currentPlayer: result.currentPlayer as Player,
      status: result.status as GameStatus,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };
  } catch (error) {
    memoryFallbackEnabled = true;
    const saved = { ...payload, id: inMemoryGames.size + 1 };
    inMemoryGames.set(gameId, saved);
    return saved;
  }
}

export async function getActiveGameForUser(
  phoneNumber: string,
): Promise<GameState | null> {
  if (memoryFallbackEnabled) {
    for (const game of inMemoryGames.values()) {
      if (
        (game.status === "active" || game.status === "pending_invite") &&
        (game.playerXId === phoneNumber || game.playerOId === phoneNumber)
      ) {
        return game;
      }
    }
    return null;
  }

  try {
    const result = await prisma.gameMatch.findFirst({
      where: {
        status: { in: ["pending_invite", "active"] },
        OR: [{ playerXId: phoneNumber }, { playerOId: phoneNumber }],
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      gameId: result.gameId,
      playerXId: result.playerXId,
      playerXName: result.playerXName,
      playerOId: result.playerOId,
      playerOName: result.playerOName,
      board: result.board,
      currentPlayer: result.currentPlayer as Player,
      status: result.status as GameStatus,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };
  } catch (error) {
    memoryFallbackEnabled = true;
    for (const game of inMemoryGames.values()) {
      if (
        (game.status === "active" || game.status === "pending_invite") &&
        (game.playerXId === phoneNumber || game.playerOId === phoneNumber)
      ) {
        return game;
      }
    }
    return null;
  }
}

export async function cancelActiveGamesForUser(
  phoneNumber: string,
): Promise<void> {
  if (memoryFallbackEnabled) {
    for (const game of inMemoryGames.values()) {
      if (
        (game.status === "active" || game.status === "pending_invite") &&
        (game.playerXId === phoneNumber || game.playerOId === phoneNumber)
      ) {
        game.status = "cancelled";
        game.updatedAt = new Date().toISOString();
      }
    }
    return;
  }

  try {
    await prisma.gameMatch.updateMany({
      where: {
        status: { in: ["pending_invite", "active"] },
        OR: [{ playerXId: phoneNumber }, { playerOId: phoneNumber }],
      },
      data: {
        status: "cancelled",
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    memoryFallbackEnabled = true;
    for (const game of inMemoryGames.values()) {
      if (
        (game.status === "active" || game.status === "pending_invite") &&
        (game.playerXId === phoneNumber || game.playerOId === phoneNumber)
      ) {
        game.status = "cancelled";
        game.updatedAt = new Date().toISOString();
      }
    }
  }
}

export const createGameState = createOrUpdateGame;
export const getActiveGameState = getActiveGameForUser;

export async function createOrUpdateSessionStats(
  stats: SessionStats,
): Promise<SessionStats> {
  if (memoryFallbackEnabled) {
    const saved = { ...stats };
    inMemorySessionStats.set(stats.sessionId, saved);
    return saved;
  }

  try {
    const now = new Date();
    const result = await prisma.sessionStats.upsert({
      where: { sessionId: stats.sessionId },
      update: {
        gamesPlayed: stats.gamesPlayed,
        xWins: stats.xWins,
        oWins: stats.oWins,
        draws: stats.draws,
        lastUpdatedAt: now,
      },
      create: {
        sessionId: stats.sessionId,
        gamesPlayed: stats.gamesPlayed,
        xWins: stats.xWins,
        oWins: stats.oWins,
        draws: stats.draws,
        lastUpdatedAt: stats.lastUpdatedAt
          ? new Date(stats.lastUpdatedAt)
          : now,
      },
    });

    return {
      sessionId: result.sessionId,
      gamesPlayed: result.gamesPlayed,
      xWins: result.xWins,
      oWins: result.oWins,
      draws: result.draws,
      lastUpdatedAt: result.lastUpdatedAt.toISOString(),
    };
  } catch (error) {
    memoryFallbackEnabled = true;
    const saved = { ...stats };
    inMemorySessionStats.set(stats.sessionId, saved);
    return saved;
  }
}

export async function getSessionStats(
  sessionId: string,
): Promise<SessionStats | null> {
  if (memoryFallbackEnabled) {
    return inMemorySessionStats.get(sessionId) ?? null;
  }

  try {
    const result = await prisma.sessionStats.findUnique({
      where: { sessionId },
    });

    if (!result) {
      return null;
    }

    return {
      sessionId: result.sessionId,
      gamesPlayed: result.gamesPlayed,
      xWins: result.xWins,
      oWins: result.oWins,
      draws: result.draws,
      lastUpdatedAt: result.lastUpdatedAt.toISOString(),
    };
  } catch (error) {
    memoryFallbackEnabled = true;
    return inMemorySessionStats.get(sessionId) ?? null;
  }
}

export async function closePool(): Promise<void> {
  await prisma.$disconnect();
}
