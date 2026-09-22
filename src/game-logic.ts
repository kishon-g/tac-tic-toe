export type Player = "X" | "O";
export type GameStatus = "active" | "won" | "draw";

export function createEmptyBoard(): string[] {
  return Array(9).fill("");
}

export function getNextPlayer(currentPlayer: Player): Player {
  return currentPlayer === "X" ? "O" : "X";
}

export function findWinner(board: string[]): Player | null {
  const winningLines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of winningLines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as Player;
    }
  }

  return null;
}

export function applyMove(
  board: string[],
  index: number,
  currentPlayer: Player,
): {
  board: string[];
  nextPlayer: Player;
  status: GameStatus;
  winner: Player | null;
} {
  if (index < 0 || index > 8) {
    throw new Error("Move must be between 0 and 8.");
  }

  if (board[index] !== "") {
    throw new Error("That square is already taken.");
  }

  const nextBoard = [...board];
  nextBoard[index] = currentPlayer;

  const winner = findWinner(nextBoard);
  const hasEmptyCell = nextBoard.some((cell) => cell === "");

  let status: GameStatus = "active";
  if (winner) {
    status = "won";
  } else if (!hasEmptyCell) {
    status = "draw";
  }

  return {
    board: nextBoard,
    nextPlayer: getNextPlayer(currentPlayer),
    status,
    winner,
  };
}
