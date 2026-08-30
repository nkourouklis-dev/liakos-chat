import { useState } from "react";

type Cell = "X" | "O" | null;
const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function winner(board: Cell[]): Cell | "draw" | null {
  for (const [a, b, c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return board.every(Boolean) ? "draw" : null;
}

export default function Games() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const result = winner(board);

  function play(index: number) {
    if (board[index] || result) return;
    const next = [...board];
    next[index] = turn;
    setBoard(next);
    setTurn(turn === "X" ? "O" : "X");
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Παιχνίδια</h1>
      <p className="text-white/60">Τρίλιζα — MVP. Επόμενο βήμα: multiplayer μέσα στο δωμάτιο.</p>
      <div className="grid grid-cols-3 gap-2">
        {board.map((cell, index) => (
          <button key={index} className="card aspect-square text-4xl font-bold" onClick={() => play(index)}>{cell}</button>
        ))}
      </div>
      <div className="text-center text-lg">
        {result === "draw" ? "Ισοπαλία!" : result ? `Νίκησε ο ${result}!` : `Σειρά του ${turn}`}
      </div>
      <button className="btn w-full" onClick={() => { setBoard(Array(9).fill(null)); setTurn("X"); }}>Νέο παιχνίδι</button>
    </div>
  );
}
