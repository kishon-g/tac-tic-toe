export type Player = "X" | "O";

export type GameStatus =
  | "pending_invite"
  | "active"
  | "won"
  | "draw"
  | "cancelled";

export interface GameState {
  id?: number;
  gameId: string;
  playerXId: string;
  playerXName: string;
  playerOId: string;
  playerOName: string;
  board: string[];
  currentPlayer: Player;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
}

export interface SessionStats {
  sessionId: string;
  gamesPlayed: number;
  xWins: number;
  oWins: number;
  draws: number;
  lastUpdatedAt: string;
}

export interface WhatsAppMessage {
  from: string;
  body: string;
  senderName?: string;
}

export interface BotResponse {
  message: string;
  outboundMessages?: Array<{ to: string; text: string }>;
  game?: unknown;
}
