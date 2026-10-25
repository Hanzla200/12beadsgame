"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  playLiftSound,
  playDeselectSound,
  playMoveSound,
  playCaptureSound,
  playTurnNotification,
  playInvalidSound,
  playWinSound,
  playDefeatSound,
  playButtonClick,
  playMenuToggleSound,
  setSoundVolume,
  toggleSoundEnabled,
} from "./sounds";

type Side = "red" | "green";
type Cell = Side | null;
type Move = { source: number; destination: number; captured: number | null };
type Mode = "computer" | "two";
type Difficulty = "easy" | "medium" | "hard";
type Theme = "classic" | "royal" | "cyber" | "marble";

interface MoveLogItem {
  id: number;
  text: string;
  side: Side;
  isCapture: boolean;
  time: string;
}

interface GameStats {
  gamesPlayed: number;
  greenWins: number;
  redWins: number;
  winStreak: number;
  bestStreak: number;
  totalCaptures: number;
}

interface HistoryStep {
  cells: Cell[];
  turn: Side;
  cpuMovesCount: number;
  message: string;
}

interface AnimatedFlight {
  side: Side;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  arcAltitude: number;
  scale: number;
  isJump: boolean;
}

interface MoveToast {
  text: string;
  x: number;
  y: number;
  id: number;
}

// 4 totally distinct themes with unique bead colors, board finishes, and palettes
export const THEME_CONFIG: Record<
  Theme,
  {
    name: string;
    p1Name: string; // Green side
    p2Name: string; // Red side
    p1Color: string;
    p2Color: string;
    p1Gradient: [string, string, string];
    p2Gradient: [string, string, string];
    boardBg: string;
    boardPlate: string;
    grooveColor: string;
    pathColor: string;
    nodeSocketFill: string;
    nodeSocketStroke: string;
    accentGold: string;
    accentGlow: string;
  }
> = {
  classic: {
    name: "Jade & Ruby",
    p1Name: "Jade Green",
    p2Name: "Ruby Red",
    p1Color: "#10b981",
    p2Color: "#ef4444",
    p1Gradient: ["#a7f3d0", "#10b981", "#064e3b"],
    p2Gradient: ["#ff8a80", "#ef4444", "#7f1d1d"],
    boardBg: "radial-gradient(circle at 50% 50%, #1e312e 0%, #111e1f 70%, #0a1314 100%)",
    boardPlate: "#152425",
    grooveColor: "rgba(0, 0, 0, 0.6)",
    pathColor: "#4d6963",
    nodeSocketFill: "#1b2f2d",
    nodeSocketStroke: "#334d49",
    accentGold: "#d4af37",
    accentGlow: "rgba(212, 175, 55, 0.35)",
  },
  royal: {
    name: "Gold & Sapphire",
    p1Name: "Imperial Gold",
    p2Name: "Royal Sapphire",
    p1Color: "#f59e0b",
    p2Color: "#3b82f6",
    p1Gradient: ["#fef08a", "#f59e0b", "#78350f"],
    p2Gradient: ["#93c5fd", "#3b82f6", "#1e3a8a"],
    boardBg: "radial-gradient(circle at 50% 50%, #172554 0%, #0f172a 70%, #020617 100%)",
    boardPlate: "#0f172a",
    grooveColor: "rgba(0, 0, 0, 0.75)",
    pathColor: "#3b5284",
    nodeSocketFill: "#1e293b",
    nodeSocketStroke: "#475569",
    accentGold: "#f59e0b",
    accentGlow: "rgba(245, 158, 11, 0.45)",
  },
  cyber: {
    name: "Cyber Neon",
    p1Name: "Laser Cyan",
    p2Name: "Neon Pink",
    p1Color: "#06b6d4",
    p2Color: "#f43f5e",
    p1Gradient: ["#a5f3fc", "#06b6d4", "#164e63"],
    p2Gradient: ["#fbcfe8", "#f43f5e", "#881337"],
    boardBg: "radial-gradient(circle at 50% 50%, #200f38 0%, #110722 70%, #06020c 100%)",
    boardPlate: "#140924",
    grooveColor: "rgba(0, 0, 0, 0.85)",
    pathColor: "#8b5cf6",
    nodeSocketFill: "#24103f",
    nodeSocketStroke: "#a855f7",
    accentGold: "#ec4899",
    accentGlow: "rgba(236, 72, 153, 0.5)",
  },
  marble: {
    name: "Pearl & Onyx",
    p1Name: "Pearl Ivory",
    p2Name: "Obsidian Onyx",
    p1Color: "#f8fafc",
    p2Color: "#334155",
    p1Gradient: ["#ffffff", "#e2e8f0", "#94a3b8"],
    p2Gradient: ["#475569", "#1e293b", "#020617"],
    boardBg: "radial-gradient(circle at 50% 50%, #27272a 0%, #18181b 70%, #09090b 100%)",
    boardPlate: "#18181b",
    grooveColor: "rgba(0, 0, 0, 0.9)",
    pathColor: "#52525b",
    nodeSocketFill: "#27272a",
    nodeSocketStroke: "#71717a",
    accentGold: "#e2e8f0",
    accentGlow: "rgba(226, 232, 240, 0.4)",
  },
};

// 5x5 board network with orthogonal and diagonal connections
function makeGraph() {
  const graph = Array.from({ length: 25 }, () => new Set<number>());
  const connect = (a: number, b: number) => {
    graph[a].add(b);
    graph[b].add(a);
  };
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const p = row * 5 + col;
      if (col < 4) connect(p, p + 1);
      if (row < 4) connect(p, p + 5);
      if (row < 4 && col < 4) {
        if ((row + col) % 2 === 0) connect(p, p + 6);
        else connect(p + 1, p + 5);
      }
    }
  }
  return graph;
}

const graph = makeGraph();
const other = (side: Side): Side => (side === "red" ? "green" : "red");

// 12 beads per side, point 12 (center) starts empty
function initialBoard(): Cell[] {
  const board: Cell[] = Array(25).fill(null);
  // Red beads on top 2 rows + 2 on middle row
  [...Array.from({ length: 10 }, (_, i) => i), 10, 11].forEach((i) => (board[i] = "red"));
  // Green beads on bottom 2 rows + 2 on middle row
  [...Array.from({ length: 10 }, (_, i) => i + 15), 13, 14].forEach((i) => (board[i] = "green"));
  return board;
}

function legalSteps(board: Cell[], source: number): Move[] {
  const side = board[source];
  if (!side) return [];
  const row = Math.floor(source / 5);
  const col = source % 5;
  const moves: Move[] = [];

  for (const neighbor of graph[source]) {
    // Normal step to adjacent empty node
    if (!board[neighbor]) {
      moves.push({ source, destination: neighbor, captured: null });
      continue;
    }
    // Cannot jump over own bead
    if (board[neighbor] === side) continue;

    // Jump capture over enemy bead
    const nr = Math.floor(neighbor / 5);
    const nc = neighbor % 5;
    const lr = nr * 2 - row;
    const lc = nc * 2 - col;
    if (lr < 0 || lr > 4 || lc < 0 || lc > 4) continue;
    const landing = lr * 5 + lc;
    if (graph[neighbor].has(landing) && !board[landing]) {
      moves.push({ source, destination: landing, captured: neighbor });
    }
  }
  return moves;
}

const count = (board: Cell[], side: Side) => board.filter((cell) => cell === side).length;
const hasMoves = (board: Cell[], side: Side) =>
  board.some((cell, i) => cell === side && legalSteps(board, i).length > 0);

function applyMove(board: Cell[], move: Move, side: Side): Cell[] {
  const next = [...board];
  next[move.source] = null;
  next[move.destination] = side;
  if (move.captured !== null) next[move.captured] = null;
  return next;
}

function extendCaptures(board: Cell[], source: number, side: Side, prefix: Move[], output: Move[][]) {
  const captures = legalSteps(board, source).filter((move) => move.captured !== null);
  if (!captures.length) {
    output.push(prefix);
    return;
  }
  for (const move of captures) {
    extendCaptures(applyMove(board, move, side), move.destination, side, [...prefix, move], output);
  }
}

function legalActions(board: Cell[], side: Side, forcedSource?: number): Move[][] {
  const actions: Move[][] = [];
  const sources =
    forcedSource === undefined
      ? board.map((cell, i) => (cell === side ? i : -1)).filter((i) => i >= 0)
      : [forcedSource];

  for (const source of sources) {
    for (const move of legalSteps(board, source)) {
      const after = applyMove(board, move, side);
      if (move.captured === null) {
        actions.push([move]);
      } else {
        extendCaptures(after, move.destination, side, [move], actions);
      }
    }
  }
  return actions;
}

function applyAction(board: Cell[], action: Move[], side: Side): Cell[] {
  return action.reduce((pos, move) => applyMove(pos, move, side), board);
}

// AI Position Evaluator
function evaluate(board: Cell[], side: Side): number {
  const enemy = other(side);
  const ownCount = count(board, side);
  const enemyCount = count(board, enemy);
  const materialWeight = 150 + Math.max(0, 12 - ownCount - enemyCount) * 12;
  let score = (ownCount - enemyCount) * materialWeight;

  const ownSteps: Move[] = [];
  const enemySteps: Move[] = [];
  board.forEach((owner, source) => {
    if (!owner) return;
    const target = owner === side ? ownSteps : enemySteps;
    target.push(...legalSteps(board, source));
  });

  score += (ownSteps.length - enemySteps.length) * 4;
  const ownVictims = new Set(
    ownSteps.filter((move) => move.captured !== null).map((move) => move.captured)
  );
  const enemyVictims = new Set(
    enemySteps.filter((move) => move.captured !== null).map((move) => move.captured)
  );
  score += (ownVictims.size - enemyVictims.size) * 12;

  board.forEach((owner, point) => {
    if (!owner) return;
    const row = Math.floor(point / 5);
    const col = point % 5;
    const sign = owner === side ? 1 : -1;
    score += sign * (4 - Math.abs(row - 2) - Math.abs(col - 2)) * 5;
    const friends = [...graph[point]].filter((neighbor) => board[neighbor] === owner).length;
    score += sign * friends * 2;
    if (owner === side && enemyVictims.has(point)) score -= 24;
    if (owner === enemy && ownVictims.has(point)) score += 24;
  });

  return score;
}

// AI Move Selector with Alpha-Beta Search & First-Move Random Rule
function chooseCpuAction(
  board: Cell[],
  side: Side,
  difficulty: Difficulty,
  isCpuFirstTurn: boolean
): Move[] {
  const actions = legalActions(board, side);
  if (!actions.length) return [];

  // REQUIREMENT: If this is the first turn of computer, make move the random bead which is legal
  if (isCpuFirstTurn) {
    const randomIndex = Math.floor(Math.random() * actions.length);
    return actions[randomIndex];
  }

  // Easy mode: shallow depth with occasional casual moves
  if (difficulty === "easy") {
    const captures = actions.filter((a) => a.some((m) => m.captured !== null));
    if (captures.length && Math.random() < 0.75) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    if (Math.random() < 0.35) {
      return actions[Math.floor(Math.random() * actions.length)];
    }
  }

  const maxDepth = difficulty === "easy" ? 2 : difficulty === "medium" ? 4 : 12;
  const MATE = 1_000_000;
  const deadline = Date.now() + (difficulty === "hard" ? 850 : 450);
  const table = new Map<string, { depth: number; score: number; flag: string; action: Move[] | null }>();
  let nodes = 0;

  class SearchTimeout extends Error {}
  const checkTime = () => {
    nodes++;
    if ((nodes & 127) === 0 && Date.now() >= deadline) throw new SearchTimeout();
  };

  const keyFor = (position: Cell[], turn: Side) =>
    turn + position.map((cell) => (cell === null ? "." : cell === "red" ? "r" : "g")).join("");

  const ordered = (position: Cell[], turn: Side, acts: Move[][], preferred?: Move[] | null) =>
    acts.slice().sort((a, b) => {
      if (preferred && JSON.stringify(a) === JSON.stringify(preferred)) return -1;
      if (preferred && JSON.stringify(b) === JSON.stringify(preferred)) return 1;
      const capA = a.filter((m) => m.captured !== null).length;
      const capB = b.filter((m) => m.captured !== null).length;
      if (capA !== capB) return capB - capA;
      const center = (action: Move[]) =>
        action.reduce(
          (tot, m) =>
            tot +
            Math.abs(Math.floor(m.destination / 5) - 2) +
            Math.abs((m.destination % 5) - 2),
          0
        );
      return center(a) - center(b);
    });

  function quiescence(
    position: Cell[],
    turn: Side,
    alpha: number,
    beta: number,
    remaining: number,
    ply: number,
    path: Set<string>
  ): number {
    checkTime();
    const key = keyFor(position, turn);
    if (path.has(key)) return 0;
    const available = legalActions(position, turn);
    if (!available.length) return -MATE + ply;
    const stand = evaluate(position, turn);
    if (remaining <= 0 || stand >= beta) return remaining <= 0 ? stand : beta;
    alpha = Math.max(alpha, stand);
    const captures = available.filter((act) => act[0].captured !== null);
    if (!captures.length) return stand;
    const nextPath = new Set(path);
    nextPath.add(key);
    for (const act of ordered(position, turn, captures)) {
      const score = -quiescence(
        applyAction(position, act, turn),
        other(turn),
        -beta,
        -alpha,
        remaining - 1,
        ply + 1,
        nextPath
      );
      if (score >= beta) return beta;
      alpha = Math.max(alpha, score);
    }
    return alpha;
  }

  function search(
    position: Cell[],
    turn: Side,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    path: Set<string>
  ): number {
    checkTime();
    const key = keyFor(position, turn);
    if (path.has(key)) return 0;
    const originalAlpha = alpha;
    const originalBeta = beta;
    const entry = table.get(key);
    const preferred: Move[] | null = entry?.action ?? null;
    if (entry && entry.depth >= depth) {
      if (entry.flag === "exact") return entry.score;
      if (entry.flag === "lower") alpha = Math.max(alpha, entry.score);
      else beta = Math.min(beta, entry.score);
      if (alpha >= beta) return entry.score;
    }
    const acts = legalActions(position, turn);
    if (!acts.length) return -MATE + ply;
    if (depth <= 0) return quiescence(position, turn, alpha, beta, 4, ply, path);
    let best = -Infinity;
    let bestAction: Move[] | null = null;
    const childPath = new Set(path);
    childPath.add(key);
    for (const act of ordered(position, turn, acts, preferred)) {
      const score = -search(
        applyAction(position, act, turn),
        other(turn),
        depth - 1,
        -beta,
        -alpha,
        ply + 1,
        childPath
      );
      if (score > best) {
        best = score;
        bestAction = act;
      }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    table.set(key, {
      depth,
      score: best,
      flag: best <= originalAlpha ? "upper" : best >= originalBeta ? "lower" : "exact",
      action: bestAction,
    });
    return best;
  }

  let bestAction = ordered(board, side, actions)[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let alpha = -Infinity;
      let bestScore = -Infinity;
      let iterBest = bestAction;
      for (const act of ordered(board, side, actions, bestAction)) {
        checkTime();
        const score = -search(
          applyAction(board, act, side),
          other(side),
          depth - 1,
          -Infinity,
          -alpha,
          1,
          new Set([keyFor(board, side)])
        );
        if (score > bestScore) {
          bestScore = score;
          iterBest = act;
        }
        alpha = Math.max(alpha, bestScore);
      }
      bestAction = iterBest;
      if (Math.abs(bestScore) >= MATE - 100) break;
    } catch (e) {
      if (!(e instanceof SearchTimeout)) throw e;
      break;
    }
  }
  return bestAction;
}

// Coordinate converter for notations: 0 -> A1, 12 -> C3, 24 -> E5
function pointNotation(idx: number): string {
  const col = String.fromCharCode(65 + (idx % 5));
  const row = Math.floor(idx / 5) + 1;
  return `${col}${row}`;
}

export default function Home() {
  // Game Board State
  const [cells, setCells] = useState<Cell[]>(initialBoard);
  const [turn, setTurn] = useState<Side>(() => {
    if (typeof window !== "undefined") {
      return Math.random() < 0.5 ? "green" : "red";
    }
    return "green";
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [chain, setChain] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("computer");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("12beads_theme") as Theme | null;
      if (saved) return saved;
    }
    return "classic";
  });

  // Track computer move count for the "first turn random legal move" rule
  const [cpuMovesCount, setCpuMovesCount] = useState(0);

  // Status & Modals
  const [winner, setWinner] = useState<Side | null>(null);
  const [winReason, setWinReason] = useState("");
  const [message, setMessage] = useState(() =>
    typeof window !== "undefined"
      ? "🎲 Coin Toss decided the starting turn. Make your move!"
      : "Your turn! Select a bead to move."
  );
  const [thinking, setThinking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);

  // Audio state
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("12beads_sound");
      if (saved !== null) {
        const on = saved === "true";
        toggleSoundEnabled(on);
        return on;
      }
    }
    return true;
  });
  const [volume, setVolume] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("12beads_volume");
      if (saved !== null) {
        const v = parseFloat(saved);
        setSoundVolume(v);
        return v;
      }
    }
    return 0.7;
  });

  // Physics animation states
  const [animatedFlight, setAnimatedFlight] = useState<AnimatedFlight | null>(null);
  const [capturedExits, setCapturedExits] = useState<{ id: number; point: number; side: Side }[]>([]);
  const [shockwaves, setShockwaves] = useState<{ id: number; x: number; y: number }[]>([]);
  const [boardRumble, setBoardRumble] = useState(false);
  const [lastMoveTrace, setLastMoveTrace] = useState<{ from: number; to: number } | null>(null);
  const [moveToast, setMoveToast] = useState<MoveToast | null>(null);
  const [comboBanner, setComboBanner] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Game tracking
  const [moveLogs, setMoveLogs] = useState<MoveLogItem[]>([]);
  const [undoStack, setUndoStack] = useState<HistoryStep[]>([]);
  const [matchSeconds, setMatchSeconds] = useState(0);
  const [stats, setStats] = useState<GameStats>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("12beads_stats");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {
      gamesPlayed: 0,
      greenWins: 0,
      redWins: 0,
      winStreak: 0,
      bestStreak: 0,
      totalCaptures: 0,
    };
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Board layout geometry (viewBox 0 0 600 600)
  const points = useMemo(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        i,
        x: 60 + (i % 5) * 120,
        y: 60 + Math.floor(i / 5) * 120,
        label: pointNotation(i),
      })),
    []
  );

  const edges = useMemo(
    () => graph.flatMap((neighbors, i) => [...neighbors].filter((n) => n > i).map((n) => [i, n] as const)),
    []
  );

  // Save theme to root attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("12beads_theme", theme);
    } catch {}
  }, [theme]);

  // Match seconds timer
  useEffect(() => {
    if (!winner && !menuOpen && !rulesOpen && !quitConfirmOpen) {
      timerRef.current = setInterval(() => setMatchSeconds((s) => s + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [winner, menuOpen, rulesOpen, quitConfirmOpen]);

  // Update sound settings
  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    toggleSoundEnabled(next);
    if (next) playLiftSound();
    try {
      localStorage.setItem("12beads_sound", String(next));
    } catch {}
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    setSoundVolume(v);
    try {
      localStorage.setItem("12beads_volume", String(v));
    } catch {}
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    playButtonClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Trigger floating move guidance toast
  const showToast = useCallback(
    (text: string, pointIndex: number) => {
      const p = points[pointIndex];
      setMoveToast({ text, x: p.x, y: p.y, id: Date.now() });
      setTimeout(() => {
        setMoveToast((prev) => (prev?.id === Date.now() ? null : prev));
      }, 1600);
    },
    [points]
  );

  // Trigger shockwave & board rumble
  const triggerImpact = useCallback(
    (pointIndex: number) => {
      const p = points[pointIndex];
      const id = Date.now() + Math.random();
      setShockwaves((prev) => [...prev, { id, x: p.x, y: p.y }]);
      setBoardRumble(true);
      setTimeout(() => setBoardRumble(false), 260);
      setTimeout(() => {
        setShockwaves((prev) => prev.filter((sw) => sw.id !== id));
      }, 480);
    },
    [points]
  );

  // Reset or Start New Game (Random First Turn Coin Toss)
  const resetGame = useCallback(
    (nextMode = mode, nextDiff = difficulty) => {
      playButtonClick();
      const startingTurn: Side = Math.random() < 0.5 ? "green" : "red";
      setCells(initialBoard());
      setTurn(startingTurn);
      setSelected(null);
      setChain(null);
      setWinner(null);
      setWinReason("");
      setThinking(false);
      setCpuMovesCount(0);
      setMode(nextMode);
      setDifficulty(nextDiff);
      setMoveLogs([]);
      setUndoStack([]);
      setLastMoveTrace(null);
      setMatchSeconds(0);
      setMenuOpen(false);
      setQuitConfirmOpen(false);

      const p1Label = THEME_CONFIG[theme].p1Name;
      const p2Label = THEME_CONFIG[theme].p2Name;

      if (nextMode === "computer") {
        setMessage(
          startingTurn === "green"
            ? `🎲 Coin Toss: You (${p1Label}) move first!`
            : `🎲 Coin Toss: Computer (${p2Label}) moves first.`
        );
      } else {
        setMessage(
          startingTurn === "green"
            ? `🎲 Coin Toss: Player 1 (${p1Label}) moves first!`
            : `🎲 Coin Toss: Player 2 (${p2Label}) moves first!`
        );
      }

      setComboBanner(
        startingTurn === "green"
          ? `🎲 ${p1Label.toUpperCase()} STARTS`
          : `🎲 ${p2Label.toUpperCase()} STARTS`
      );
      setTimeout(() => setComboBanner(null), 2000);
    },
    [mode, difficulty, theme]
  );

  // Finish a turn & check for victory condition
  const finishTurn = useCallback(
    (board: Cell[], movingSide: Side) => {
      const nextSide = other(movingSide);
      setSelected(null);
      setChain(null);

      const nextSideCount = count(board, nextSide);
      const nextSideHasMoves = hasMoves(board, nextSide);

      const movingLabel = movingSide === "green" ? THEME_CONFIG[theme].p1Name : THEME_CONFIG[theme].p2Name;
      const nextLabel = nextSide === "green" ? THEME_CONFIG[theme].p1Name : THEME_CONFIG[theme].p2Name;

      if (nextSideCount === 0 || !nextSideHasMoves) {
        const reason =
          nextSideCount === 0
            ? `${nextLabel} has no beads remaining!`
            : `${nextLabel} is completely blocked with no legal moves!`;

        setWinner(movingSide);
        setWinReason(reason);
        setMessage(`${movingLabel} Wins!`);

        if (movingSide === "green" || (mode === "two" && movingSide === "red")) {
          playWinSound();
        } else {
          playDefeatSound();
        }

        // Save Match Record
        setStats((prev) => {
          const isPlayerWin = movingSide === "green";
          const newStreak = isPlayerWin ? prev.winStreak + 1 : 0;
          const updated: GameStats = {
            gamesPlayed: prev.gamesPlayed + 1,
            greenWins: prev.greenWins + (isPlayerWin ? 1 : 0),
            redWins: prev.redWins + (isPlayerWin ? 0 : 1),
            winStreak: newStreak,
            bestStreak: Math.max(prev.bestStreak, newStreak),
            totalCaptures: prev.totalCaptures + (12 - nextSideCount),
          };
          try {
            localStorage.setItem("12beads_stats", JSON.stringify(updated));
          } catch {}
          return updated;
        });
        return;
      }

      setTurn(nextSide);
      playTurnNotification();

      if (mode === "computer") {
        setMessage(
          nextSide === "green"
            ? `Your turn (${THEME_CONFIG[theme].p1Name}). Tap an empty space to move.`
            : "Computer is thinking..."
        );
      } else {
        setMessage(`${nextLabel}'s turn.`);
      }
    },
    [mode, theme]
  );

  // Realistic Flight Physics Animation
  const animateMoveFlight = useCallback(
    (
      move: Move,
      movingSide: Side,
      onComplete: () => void,
      onApexCapture?: () => void
    ) => {
      const fromP = points[move.source];
      const toP = points[move.destination];
      const isJump = move.captured !== null;
      const duration = isJump ? 320 : 250;
      const startTime = performance.now();
      let apexTriggered = false;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Realistic cubic deceleration easing
        const eased = 1 - Math.pow(1 - progress, 3);

        const currentX = fromP.x + (toP.x - fromP.x) * eased;
        const currentY = fromP.y + (toP.y - fromP.y) * eased;

        // Parabolic arc for jump captures
        const arcProgress = Math.sin(Math.PI * progress);
        const arcAltitude = isJump ? arcProgress * 42 : arcProgress * 10;
        const scale = isJump ? 1 + arcProgress * 0.32 : 1 + arcProgress * 0.08;

        if (isJump && progress >= 0.48 && !apexTriggered) {
          apexTriggered = true;
          if (onApexCapture) onApexCapture();
        }

        setAnimatedFlight({
          side: movingSide,
          startX: fromP.x,
          startY: fromP.y,
          targetX: toP.x,
          targetY: toP.y,
          currentX,
          currentY: currentY - arcAltitude,
          arcAltitude,
          scale,
          isJump,
        });

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          setAnimatedFlight(null);
          setLastMoveTrace({ from: move.source, to: move.destination });
          onComplete();
        }
      };

      requestAnimationFrame(step);
    },
    [points]
  );

  // Execute Computer Move with Realistic Parabolic Physics
  const executeCpuMove = useCallback(
    (currentBoard: Cell[]) => {
      const isFirstTurn = cpuMovesCount === 0;
      const action = chooseCpuAction(currentBoard, "red", difficulty, isFirstTurn);

      if (!action.length) {
        setThinking(false);
        finishTurn(currentBoard, "green");
        return;
      }

      setCpuMovesCount((c) => c + 1);

      let position = currentBoard;
      let comboCount = 0;

      const playStep = (index: number) => {
        const move = action[index];
        const isCap = move.captured !== null;
        const p2Name = THEME_CONFIG[theme].p2Name;

        animateMoveFlight(
          move,
          "red",
          () => {
            position = applyMove(position, move, "red");
            setCells(position);

            if (isCap) {
              comboCount++;
              triggerImpact(move.destination);
              playCaptureSound(comboCount);
              if (comboCount > 1) {
                setComboBanner(`COMBO x${comboCount}!`);
                setTimeout(() => setComboBanner(null), 1000);
              }
            } else {
              playMoveSound();
            }

            // Log move
            const logText = isCap
              ? `${p2Name} jumped to ${pointNotation(move.destination)} (Captured ${pointNotation(move.captured!)})`
              : `${p2Name} moved ${pointNotation(move.source)} → ${pointNotation(move.destination)}`;
            setMoveLogs((prev) => [
              { id: Date.now() + Math.random(), text: logText, side: "red", isCapture: isCap, time: `${matchSeconds}s` },
              ...prev.slice(0, 24),
            ]);

            setTimeout(() => {
              if (index + 1 < action.length) {
                playStep(index + 1);
              } else {
                setThinking(false);
                finishTurn(position, "red");
              }
            }, 180);
          },
          () => {
            if (isCap) {
              const capId = Date.now() + Math.random();
              setCapturedExits((prev) => [...prev, { id: capId, point: move.captured!, side: "green" }]);
              setTimeout(() => {
                setCapturedExits((prev) => prev.filter((item) => item.id !== capId));
              }, 400);
            }
          }
        );
      };

      playStep(0);
    },
    [cpuMovesCount, difficulty, finishTurn, matchSeconds, animateMoveFlight, triggerImpact, theme]
  );

  // Trigger computer move when appropriate
  useEffect(() => {
    if (mode !== "computer" || turn !== "red" || winner || thinking || menuOpen || quitConfirmOpen) {
      return;
    }
    const timer = setTimeout(() => {
      setThinking(true);
      executeCpuMove(cells);
    }, 450);
    return () => clearTimeout(timer);
  }, [mode, turn, winner, thinking, menuOpen, quitConfirmOpen, cells, executeCpuMove]);

  // Execute a validated human touch/click move
  const executeHumanMove = useCallback(
    (source: number, destination: number) => {
      const legalMoves = chain === source
        ? legalSteps(cells, source).filter((m) => m.captured !== null)
        : legalSteps(cells, source);

      const move = legalMoves.find((m) => m.destination === destination);

      if (!move) {
        // Find reason for invalid touch on empty junction
        const isNeighbor = graph[source].has(destination);
        if (cells[destination] !== null) {
          showToast("Point is already occupied", destination);
        } else if (!isNeighbor) {
          showToast("Points are not connected", destination);
        } else {
          showToast("Illegal move", destination);
        }
        playInvalidSound();
        return;
      }

      // Save undo state
      setUndoStack((prev) => [
        { cells: [...cells], turn, cpuMovesCount, message },
        ...prev.slice(0, 15),
      ]);

      const isCap = move.captured !== null;
      const movingName = turn === "green" ? THEME_CONFIG[theme].p1Name : THEME_CONFIG[theme].p2Name;

      // Realistic flight animation
      animateMoveFlight(
        move,
        turn,
        () => {
          const nextCells = applyMove(cells, move, turn);
          setCells(nextCells);

          if (isCap) {
            triggerImpact(destination);
            playCaptureSound(chain !== null ? 2 : 1);
          } else {
            playMoveSound();
          }

          // Move log
          const logText = isCap
            ? `${movingName} jumped to ${pointNotation(destination)} (Captured ${pointNotation(move.captured!)})`
            : `${movingName} moved ${pointNotation(source)} → ${pointNotation(destination)}`;
          setMoveLogs((prev) => [
            { id: Date.now() + Math.random(), text: logText, side: turn, isCapture: isCap, time: `${matchSeconds}s` },
            ...prev.slice(0, 24),
          ]);

          // Check if chain capture is available
          const canChain = isCap && legalSteps(nextCells, destination).some((m) => m.captured !== null);

          if (canChain) {
            setChain(destination);
            setSelected(destination);
            setComboBanner("COMBO! Jump Again");
            setMessage("Chain capture required! Tap the next empty jump landing point.");
            setTimeout(() => setComboBanner(null), 1200);
          } else {
            finishTurn(nextCells, turn);
          }
        },
        () => {
          if (isCap) {
            const capId = Date.now() + Math.random();
            setCapturedExits((prev) => [...prev, { id: capId, point: move.captured!, side: other(turn) }]);
            setTimeout(() => {
              setCapturedExits((prev) => prev.filter((item) => item.id !== capId));
            }, 400);
          }
        }
      );
    },
    [cells, chain, turn, cpuMovesCount, message, animateMoveFlight, triggerImpact, finishTurn, matchSeconds, showToast, theme]
  );

  // Pure Touch / Click Interaction (Select bead & Tap empty space)
  const handlePointTap = (point: number) => {
    if (winner || thinking || (mode === "computer" && turn === "red") || animatedFlight) {
      return;
    }

    // Case 1: No bead currently selected
    if (selected === null) {
      if (cells[point] === turn) {
        const moves = legalSteps(cells, point);
        if (moves.length === 0) {
          playInvalidSound();
          showToast("No legal moves available", point);
        } else {
          setSelected(point);
          playLiftSound();
          setMessage(
            chain !== null
              ? "Chain capture required! Tap empty space to jump."
              : "Bead selected. Tap an empty space to place."
          );
        }
      } else if (cells[point] !== null) {
        playInvalidSound();
        const sideName = cells[point] === "green" ? THEME_CONFIG[theme].p1Name : THEME_CONFIG[theme].p2Name;
        showToast(`It is ${sideName}'s turn`, point);
      } else {
        // Tapped empty space while nothing selected
        playInvalidSound();
        showToast("Select a bead first", point);
      }
      return;
    }

    // Case 2: Tapping the already selected bead (Deselect)
    if (point === selected) {
      if (chain !== null) {
        playInvalidSound();
        showToast("Must continue capture chain", point);
        return;
      }
      setSelected(null);
      playDeselectSound();
      setMessage(
        mode === "computer"
          ? `Your turn (${THEME_CONFIG[theme].p1Name})! Tap a bead to move.`
          : `${turn === "green" ? THEME_CONFIG[theme].p1Name : THEME_CONFIG[theme].p2Name}'s turn.`
      );
      return;
    }

    // Case 3: Tapping another of the player's beads (Switch selection)
    if (cells[point] === turn && chain === null) {
      const moves = legalSteps(cells, point);
      setSelected(point);
      if (moves.length === 0) {
        playInvalidSound();
        showToast("No legal moves available", point);
      } else {
        playLiftSound();
        setMessage("Bead selected. Tap an empty space to place.");
      }
      return;
    }

    // Case 4: Tapping an empty space or destination node to move!
    executeHumanMove(selected, point);
  };

  // Undo Move Feature
  const handleUndo = () => {
    if (undoStack.length === 0 || thinking || animatedFlight !== null) return;
    playButtonClick();

    const previous = undoStack[0];
    setCells(previous.cells);
    setTurn(mode === "computer" ? "green" : previous.turn);
    setCpuMovesCount(previous.cpuMovesCount);
    setMessage(previous.message);
    setSelected(null);
    setChain(null);
    setWinner(null);
    setWinReason("");
    setLastMoveTrace(null);
    setUndoStack((prev) => prev.slice(1));
  };

  // Handle Match Quit / Forfeit
  const handleQuitConfirm = () => {
    playButtonClick();
    setQuitConfirmOpen(false);
    const forfeiter = mode === "computer" ? "green" : turn;
    const winnerSide = other(forfeiter);
    const winnerName = winnerSide === "green" ? THEME_CONFIG[theme].p1Name : THEME_CONFIG[theme].p2Name;
    const forfeiterName = forfeiter === "green" ? THEME_CONFIG[theme].p1Name : THEME_CONFIG[theme].p2Name;
    setWinner(winnerSide);
    setWinReason(`${forfeiterName} forfeited the match.`);
    setMessage(`${winnerName} Wins by Forfeit!`);
    playDefeatSound();
    setMenuOpen(true);
  };

  // Share Match Summary
  const handleShareSummary = () => {
    playButtonClick();
    const text = `I just finished a 12 Beads match (${THEME_CONFIG[theme].name} theme) in ${formattedTime} with ${moveLogs.length} total moves! 100% offline ready.`;
    if (navigator.share) {
      navigator.share({ title: "12 Beads Match Result", text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      });
    }
  };

  const redCount = count(cells, "red");
  const greenCount = count(cells, "green");
  const totalBeads = redCount + greenCount;
  const redPercentage = totalBeads > 0 ? (redCount / totalBeads) * 100 : 50;

  const currentTheme = THEME_CONFIG[theme];

  const formattedTime = `${Math.floor(matchSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(matchSeconds % 60).toString().padStart(2, "0")}`;

  return (
    <div className="app-container">
      <div className="ambient-glow glow-left" />
      <div className="ambient-glow glow-right" />

      {/* Top Navigation Bar */}
      <header className="top-navbar">
        <div className="brand-section" onClick={() => setMenuOpen(true)}>
          <div className="brand-icon">
            <svg viewBox="0 0 24 24">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="18" r="3" />
              <path d="M6 9v6M9 6h6M9 18h6M18 9v6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="brand-title">
            <h1>12 BEADS</h1>
            <span>{currentTheme.name.toUpperCase()} • OFFLINE</span>
          </div>
        </div>

        <div className="top-controls">
          <div className="status-pill">
            <span className="status-dot" />
            <span>{mode === "computer" ? `VS AI • ${difficulty.toUpperCase()}` : "2 PLAYERS LOCAL"}</span>
          </div>

          <button
            className="nav-btn"
            aria-label={soundOn ? "Mute Sound" : "Enable Sound"}
            onClick={handleToggleSound}
            title={soundOn ? "Mute Sound" : "Enable Sound"}
          >
            {soundOn ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          <button
            className="nav-btn"
            aria-label="Toggle Fullscreen"
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>

          <button
            className="nav-btn"
            aria-label="How to play"
            onClick={() => {
              playButtonClick();
              setRulesOpen(true);
            }}
            title="Game Rules"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>

          <button
            className="nav-btn"
            aria-label="Game Menu"
            onClick={() => {
              playMenuToggleSound(true);
              setMenuOpen(true);
            }}
            title="Menu & Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <button
            className="nav-btn danger-hover"
            aria-label="Quit Match"
            onClick={() => {
              playButtonClick();
              setQuitConfirmOpen(true);
            }}
            title="Quit Match"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Game Arena */}
      <main className="main-content">
        <section className="arena-card">
          {/* Arena Header Bar */}
          <div className="arena-header">
            <div className="match-info-meta">
              <div className="meta-chip">
                <span>⏱</span>
                <b>{formattedTime}</b>
              </div>
              <div className="meta-chip">
                <span>Moves:</span>
                <b>{moveLogs.length}</b>
              </div>
            </div>

            <div className="match-info-meta">
              <div className="meta-chip">
                <span style={{ color: currentTheme.p2Color }}>●</span>
                <span>{currentTheme.p2Name}:</span>
                <b>{redCount}</b>
              </div>
              <div className="meta-chip">
                <span style={{ color: currentTheme.p1Color }}>●</span>
                <span>{currentTheme.p1Name}:</span>
                <b>{greenCount}</b>
              </div>
            </div>
          </div>

          {/* 5x5 SVG Board Stage */}
          <div
            className={`board-stage ${boardRumble ? "rumble" : ""}`}
            style={{ background: currentTheme.boardBg }}
          >
            <div className="corner-accent corner-tl" />
            <div className="corner-accent corner-tr" />
            <div className="corner-accent corner-bl" />
            <div className="corner-accent corner-br" />

            {/* Floating Toast Notification on Invalid Touch */}
            {moveToast && (
              <div
                className="move-toast"
                style={{
                  left: `${(moveToast.x / 600) * 100}%`,
                  top: `${(moveToast.y / 600) * 100}%`,
                }}
              >
                {moveToast.text}
              </div>
            )}

            <svg
              className="svg-board"
              viewBox="0 0 600 600"
              role="region"
              aria-label="12 Beads 5x5 Board"
            >
              <defs>
                {/* Dynamic Theme Gradients for Player 1 & Player 2 Beads */}
                <linearGradient id="p1BeadGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={currentTheme.p1Gradient[0]} />
                  <stop offset="50%" stopColor={currentTheme.p1Gradient[1]} />
                  <stop offset="100%" stopColor={currentTheme.p1Gradient[2]} />
                </linearGradient>

                <linearGradient id="p2BeadGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={currentTheme.p2Gradient[0]} />
                  <stop offset="50%" stopColor={currentTheme.p2Gradient[1]} />
                  <stop offset="100%" stopColor={currentTheme.p2Gradient[2]} />
                </linearGradient>
              </defs>

              {/* Board Plate */}
              <rect
                x="20"
                y="20"
                width="560"
                height="560"
                rx="20"
                fill={currentTheme.boardPlate}
                className="board-bg-plate"
              />

              {/* Connecting Carved Grooves & Board Lines */}
              {edges.map(([a, b]) => (
                <g key={`edge-${a}-${b}`}>
                  <line
                    x1={points[a].x}
                    y1={points[a].y}
                    x2={points[b].x}
                    y2={points[b].y}
                    stroke={currentTheme.grooveColor}
                    className="board-path-groove"
                  />
                  <line
                    x1={points[a].x}
                    y1={points[a].y}
                    x2={points[b].x}
                    y2={points[b].y}
                    stroke={currentTheme.pathColor}
                    className="board-path"
                  />
                </g>
              ))}

              {/* Last Move Trace Path Line */}
              {lastMoveTrace && (
                <g>
                  <circle
                    cx={points[lastMoveTrace.from].x}
                    cy={points[lastMoveTrace.from].y}
                    r="12"
                    className="last-move-socket"
                  />
                  <line
                    x1={points[lastMoveTrace.from].x}
                    y1={points[lastMoveTrace.from].y}
                    x2={points[lastMoveTrace.to].x}
                    y2={points[lastMoveTrace.to].y}
                    className="last-move-line"
                  />
                </g>
              )}

              {/* Coordinate Labels: Columns A-E and Rows 1-5 */}
              {["A", "B", "C", "D", "E"].map((col, idx) => (
                <text key={`col-top-${col}`} x={60 + idx * 120} y={38} className="axis-coord">
                  {col}
                </text>
              ))}
              {["1", "2", "3", "4", "5"].map((row, idx) => (
                <text key={`row-left-${row}`} x={38} y={60 + idx * 120} className="axis-coord">
                  {row}
                </text>
              ))}

              {/* Board Nodes & Beads - Pure Touch / Click Interaction */}
              {points.map(({ i, x, y }) => {
                const isSelected = selected === i;
                const isBeingAnimated =
                  animatedFlight && animatedFlight.startX === x && animatedFlight.startY === y;
                const isBeingCaptured = capturedExits.find((c) => c.point === i);
                const hasBead = cells[i] !== null && !isBeingAnimated;

                return (
                  <g
                    key={`point-${i}`}
                    className={`bead-group ${isSelected ? "lifted" : ""} ${thinking ? "locked" : ""}`}
                    onClick={() => handlePointTap(i)}
                  >
                    {/* Node socket */}
                    <circle
                      cx={x}
                      cy={y}
                      r="16"
                      fill={currentTheme.nodeSocketFill}
                      stroke={currentTheme.nodeSocketStroke}
                      className="node-socket"
                    />

                    {/* Touch & Click Hitbox (Large for easy mobile tapping) */}
                    <circle cx={x} cy={y} r="48" className="tap-hitbox" />

                    {/* Subtle aura around selected bead (NO destination dots!) */}
                    {isSelected && (
                      <circle cx={x} cy={y} r="32" className="selected-aura" />
                    )}

                    {/* Bead sitting on node */}
                    {hasBead && (
                      <>
                        <ellipse cx={x + 3} cy={y + 5} rx="23" ry="17" className="bead-shadow" />
                        <circle
                          cx={x}
                          cy={y}
                          r="25"
                          className={`bead-body ${cells[i]}`}
                        />
                        <ellipse cx={x - 8} cy={y - 9} rx="7" ry="4" className="bead-glare" />
                      </>
                    )}

                    {/* Captured Bead Exit Animation */}
                    {isBeingCaptured && (
                      <g className="captured-bead-exit">
                        <circle
                          cx={x}
                          cy={y}
                          r="25"
                          className={`bead-body ${isBeingCaptured.side}`}
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Realistic Flight Bead (Sliding or Parabolic Jump Arc) */}
              {animatedFlight && (
                <g pointerEvents="none">
                  {/* Ground shadow beneath jumping bead */}
                  <ellipse
                    cx={animatedFlight.currentX + (animatedFlight.isJump ? 6 : 3)}
                    cy={
                      animatedFlight.targetY !== animatedFlight.startY
                        ? animatedFlight.currentY + animatedFlight.arcAltitude + 6
                        : animatedFlight.startY + 6
                    }
                    rx={24 + (animatedFlight.isJump ? animatedFlight.arcAltitude * 0.2 : 0)}
                    ry={16 + (animatedFlight.isJump ? animatedFlight.arcAltitude * 0.15 : 0)}
                    fill={animatedFlight.isJump ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.55)"}
                    filter={`blur(${animatedFlight.isJump ? "5px" : "3px"})`}
                  />
                  {/* Leaping/Sliding Bead */}
                  <circle
                    cx={animatedFlight.currentX}
                    cy={animatedFlight.currentY}
                    r={25 * animatedFlight.scale}
                    className={`bead-body ${animatedFlight.side}`}
                  />
                  <ellipse
                    cx={animatedFlight.currentX - 8 * animatedFlight.scale}
                    cy={animatedFlight.currentY - 9 * animatedFlight.scale}
                    rx={7 * animatedFlight.scale}
                    ry={4 * animatedFlight.scale}
                    className="bead-glare"
                  />
                </g>
              )}

              {/* Dynamic Capture Shockwave Ripples */}
              {shockwaves.map((sw) => (
                <circle
                  key={`sw-${sw.id}`}
                  cx={sw.x}
                  cy={sw.y}
                  r="18"
                  className="shockwave-ring"
                />
              ))}
            </svg>
          </div>

          {/* Arena Guidance Footer */}
          <div className="arena-footer">
            <div className="guidance-text">
              <span className="guidance-icon">✦</span>
              <span>{message}</span>
            </div>
            {comboBanner && (
              <div
                className="status-pill"
                style={{ borderColor: currentTheme.accentGold, color: currentTheme.accentGold }}
              >
                <b>{comboBanner}</b>
              </div>
            )}
          </div>
        </section>

        {/* Right HUD Sidebar */}
        <aside className="hud-sidebar">
          {/* Current Turn Card */}
          <div className="hud-card">
            <div className="hud-card-title">
              <span>CURRENT TURN</span>
              <span>● ACTIVE</span>
            </div>

            <div className="turn-banner">
              <div className={`player-avatar ${turn} active-turn`}>
                <span style={{ fontSize: "18px" }}>♟</span>
              </div>
              <div className="turn-details">
                <span className="turn-player-name">
                  {turn === "green"
                    ? mode === "computer"
                      ? `You (${currentTheme.p1Name})`
                      : `Player 1 (${currentTheme.p1Name})`
                    : mode === "computer"
                    ? `Computer (${currentTheme.p2Name})`
                    : `Player 2 (${currentTheme.p2Name})`}
                </span>
                <span className="turn-status-sub">
                  {thinking ? "Calculating..." : chain !== null ? "Combo Jump Required" : "Tap Empty Space to Move"}
                </span>
              </div>
            </div>
          </div>

          {/* Beads Strength Gauge & Trays */}
          <div className="hud-card">
            <div className="hud-card-title">
              <span>BEADS IN PLAY</span>
              <span>12 MAX EACH</span>
            </div>

            <div className="strength-gauge">
              <div className="strength-ratio-bar">
                <div className="ratio-red" style={{ width: `${redPercentage}%` }} />
                <div className="ratio-green" style={{ width: `${100 - redPercentage}%` }} />
              </div>
            </div>

            <div className="bead-trays-container">
              {/* Red / Player 2 Tray */}
              <div className={`bead-tray-side ${turn === "red" ? "active-player" : ""}`}>
                <div className="tray-label red">
                  <span>{currentTheme.p2Name.toUpperCase()}</span>
                  <b>{redCount}/12</b>
                </div>
                <div className="bead-slots-grid">
                  {Array.from({ length: 12 }, (_, i) => (
                    <div
                      key={`slot-red-${i}`}
                      className={`bead-slot ${i >= redCount ? "empty-captured" : ""}`}
                    >
                      {i < redCount && <div className="bead-token-mini red" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Green / Player 1 Tray */}
              <div className={`bead-tray-side ${turn === "green" ? "active-player" : ""}`}>
                <div className="tray-label green">
                  <span>{currentTheme.p1Name.toUpperCase()}</span>
                  <b>{greenCount}/12</b>
                </div>
                <div className="bead-slots-grid">
                  {Array.from({ length: 12 }, (_, i) => (
                    <div
                      key={`slot-green-${i}`}
                      className={`bead-slot ${i >= greenCount ? "empty-captured" : ""}`}
                    >
                      {i < greenCount && <div className="bead-token-mini green" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Move History / Activity Feed */}
          <div className="hud-card">
            <div className="hud-card-title">
              <span>MOVE LOG</span>
              <span>{moveLogs.length} MOVES</span>
            </div>

            <div className="move-log-box">
              {moveLogs.length === 0 ? (
                <div style={{ fontSize: "11px", color: "var(--text-dim)", textAlign: "center", padding: "10px" }}>
                  Tap a bead, then tap an empty space.
                </div>
              ) : (
                moveLogs.map((log) => (
                  <div key={log.id} className={`log-item ${log.isCapture ? "capture" : ""}`}>
                    <span className={`log-side-tag ${log.side}`}>
                      {log.side === "green" ? currentTheme.p1Name.split(" ")[0].toUpperCase() : currentTheme.p2Name.split(" ")[0].toUpperCase()}
                    </span>
                    <span>{log.text}</span>
                    <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{log.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick HUD Actions */}
          <div className="hud-card">
            <div className="hud-card-title">
              <span>CONTROLS</span>
            </div>

            <div className="quick-actions-grid">
              <button
                className="hud-btn"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || thinking || animatedFlight !== null}
                title="Undo last move"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7v6h6" />
                  <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                </svg>
                <span>Undo</span>
              </button>

              <button
                className="hud-btn"
                onClick={() => resetGame()}
                title="Restart match"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>Restart</span>
              </button>

              <button
                className="hud-btn"
                onClick={() => {
                  playButtonClick();
                  setStatsOpen(true);
                }}
                title="View Statistics"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>Stats</span>
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile Sticky Bottom Bar (Ergonomic Thumb Access) */}
      <nav className="mobile-bottom-bar" aria-label="Mobile Controls">
        <button
          className="mobile-bar-btn"
          onClick={handleUndo}
          disabled={undoStack.length === 0 || thinking || animatedFlight !== null}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          <span>Undo</span>
        </button>

        <button className="mobile-bar-btn" onClick={() => resetGame()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>Restart</span>
        </button>

        <button className="mobile-bar-btn" onClick={handleToggleSound}>
          {soundOn ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
          <span>Sound</span>
        </button>

        <button
          className="mobile-bar-btn"
          onClick={() => {
            playMenuToggleSound(true);
            setMenuOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span>Menu</span>
        </button>

        <button
          className="mobile-bar-btn"
          onClick={() => {
            playButtonClick();
            setQuitConfirmOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Quit</span>
        </button>
      </nav>

      {/* PAUSE / IN-GAME SETTINGS MENU MODAL */}
      {menuOpen && (
        <div className="modal-overlay" onClick={() => setMenuOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => {
                playMenuToggleSound(false);
                setMenuOpen(false);
              }}
            >
              ✕
            </button>

            <div className="modal-header-block">
              <div className="modal-badge">12</div>
              <span className="modal-kicker">GAME MENU</span>
              <h2 className="modal-title">Settings & <em>Modes</em></h2>
              <p className="modal-desc">Authentic Bara Tehni rules. Tap-to-move • Web & APK ready.</p>
            </div>

            <div className="menu-options-list">
              {/* Game Mode Selector */}
              <div className="setting-row">
                <span className="setting-label">Game Mode</span>
                <div className="segmented-pill-group">
                  <button
                    className={`pill-choice-btn ${mode === "computer" ? "active" : ""}`}
                    onClick={() => resetGame("computer", difficulty)}
                  >
                    VS Computer
                  </button>
                  <button
                    className={`pill-choice-btn ${mode === "two" ? "active" : ""}`}
                    onClick={() => resetGame("two", difficulty)}
                  >
                    2 Players Local
                  </button>
                </div>
              </div>

              {/* AI Difficulty Selector */}
              {mode === "computer" && (
                <div className="setting-row">
                  <span className="setting-label">AI Difficulty</span>
                  <div className="segmented-pill-group">
                    {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                      <button
                        key={d}
                        className={`pill-choice-btn ${difficulty === d ? "active" : ""}`}
                        onClick={() => {
                          playButtonClick();
                          setDifficulty(d);
                        }}
                      >
                        {d === "easy" ? "Casual" : d === "medium" ? "Normal" : "Master"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bead & Board 4 Unique Themes Selector */}
              <div className="setting-row">
                <span className="setting-label">Theme Edition</span>
                <div className="segmented-pill-group">
                  {(
                    [
                      { id: "classic", label: "Jade & Ruby" },
                      { id: "royal", label: "Gold & Sapphire" },
                      { id: "cyber", label: "Cyber Neon" },
                      { id: "marble", label: "Pearl & Onyx" },
                    ] as const
                  ).map((th) => (
                    <button
                      key={th.id}
                      className={`pill-choice-btn ${theme === th.id ? "active" : ""}`}
                      onClick={() => {
                        playButtonClick();
                        setTheme(th.id);
                      }}
                    >
                      {th.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume Slider */}
              <div className="setting-row">
                <span className="setting-label">Sound Effects Volume</span>
                <div className="volume-control-box">
                  <button
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                    onClick={handleToggleSound}
                  >
                    {soundOn ? "🔊" : "🔇"}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundOn ? volume : 0}
                    disabled={!soundOn}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="volume-slider"
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", width: "32px", textAlign: "right" }}>
                    {soundOn ? `${Math.round(volume * 100)}%` : "Off"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <button
                className="btn-primary"
                onClick={() => {
                  playButtonClick();
                  setMenuOpen(false);
                }}
              >
                RESUME MATCH
              </button>

              <button
                className="btn-secondary"
                onClick={() => resetGame()}
              >
                NEW MATCH
              </button>

              <button
                className="btn-danger"
                onClick={() => {
                  setMenuOpen(false);
                  setQuitConfirmOpen(true);
                }}
              >
                QUIT CURRENT MATCH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOW TO PLAY / RULES MODAL */}
      {rulesOpen && (
        <div className="modal-overlay" onClick={() => setRulesOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setRulesOpen(false)}>
              ✕
            </button>

            <div className="modal-header-block">
              <span className="modal-kicker">TRADITIONAL STRATEGY</span>
              <h2 className="modal-title">How to <em>Play</em></h2>
              <p className="modal-desc">Bara Tehni (12 Beads) is a classic two-player strategy game.</p>
            </div>

            <div className="rule-steps-list">
              <div className="rule-step-item">
                <span className="rule-num">01</span>
                <div className="rule-desc-block">
                  <strong>Select & Tap to Move</strong>
                  <p>
                    Touch or click one of your beads to select it, then touch or click any connected empty space to
                    move.
                  </p>
                </div>
              </div>

              <div className="rule-step-item">
                <span className="rule-num">02</span>
                <div className="rule-desc-block">
                  <strong>Jumping & Capturing</strong>
                  <p>
                    Jump over an adjacent opponent bead into the vacant space directly behind it. The jumped bead is
                    captured and removed from the board.
                  </p>
                </div>
              </div>

              <div className="rule-step-item">
                <span className="rule-num">03</span>
                <div className="rule-desc-block">
                  <strong>Multi-Jump Combos</strong>
                  <p>
                    If the same bead can make another consecutive jump capture from its landing spot, you must continue
                    capturing!
                  </p>
                </div>
              </div>

              <div className="rule-step-item">
                <span className="rule-num">04</span>
                <div className="rule-desc-block">
                  <strong>Winning the Game</strong>
                  <p>
                    You win by capturing all 12 of your opponent&apos;s beads, or by trapping them so they have no legal
                    moves remaining.
                  </p>
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={() => setRulesOpen(false)}>
              GOT IT, LET&apos;S PLAY!
            </button>
          </div>
        </div>
      )}

      {/* QUIT CONFIRMATION MODAL */}
      {quitConfirmOpen && (
        <div className="modal-overlay" onClick={() => setQuitConfirmOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-block">
              <div className="modal-badge" style={{ borderColor: "#ef4444", color: "#ef4444" }}>
                ✕
              </div>
              <span className="modal-kicker" style={{ color: "#ef4444" }}>
                FORFEIT MATCH
              </span>
              <h2 className="modal-title">Quit <em>Match?</em></h2>
              <p className="modal-desc">
                Quitting now will forfeit the current game to your opponent and record a loss. Are you sure you want to
                leave?
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button className="btn-danger" onClick={handleQuitConfirm}>
                YES, FORFEIT & QUIT
              </button>
              <button className="btn-secondary" onClick={() => setQuitConfirmOpen(false)}>
                KEEP PLAYING
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATISTICS MODAL */}
      {statsOpen && (
        <div className="modal-overlay" onClick={() => setStatsOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setStatsOpen(false)}>
              ✕
            </button>

            <div className="modal-header-block">
              <span className="modal-kicker">LOCAL RECORDS</span>
              <h2 className="modal-title">Player <em>Statistics</em></h2>
              <p className="modal-desc">Saved directly to your device. Plays 100% offline.</p>
            </div>

            <div className="stats-grid">
              <div className="stat-box">
                <small>Total Matches</small>
                <b>{stats.gamesPlayed}</b>
              </div>
              <div className="stat-box">
                <small>{currentTheme.p1Name} Wins</small>
                <b>{stats.greenWins}</b>
              </div>
              <div className="stat-box">
                <small>{currentTheme.p2Name} Wins</small>
                <b>{stats.redWins}</b>
              </div>
              <div className="stat-box">
                <small>Current Streak</small>
                <b>{stats.winStreak}</b>
              </div>
              <div className="stat-box">
                <small>Best Streak</small>
                <b>{stats.bestStreak}</b>
              </div>
              <div className="stat-box">
                <small>Total Captures</small>
                <b>{stats.totalCaptures}</b>
              </div>
            </div>

            <button className="btn-primary" onClick={() => setStatsOpen(false)}>
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* MATCH COMPLETE / VICTORY MODAL */}
      {winner && (
        <div className="modal-overlay">
          <div className="modal-sheet">
            <div className="modal-header-block">
              <div className="modal-badge">✦</div>
              <span className="modal-kicker">MATCH CONCLUDED</span>
              <h2 className="modal-title">
                {winner === "green"
                  ? mode === "computer"
                    ? `Victory! You (${currentTheme.p1Name}) Won!`
                    : `${currentTheme.p1Name} Wins!`
                  : mode === "computer"
                  ? `Computer (${currentTheme.p2Name}) Wins!`
                  : `${currentTheme.p2Name} Wins!`}
              </h2>
              <p className="modal-desc">{winReason}</p>
            </div>

            <div className="victory-podium">
              <div className="podium-side">
                <span style={{ color: currentTheme.p2Color }}>{currentTheme.p2Name.toUpperCase()}</span>
                <b>{redCount}</b>
              </div>
              <div className="podium-side">
                <span style={{ color: currentTheme.p1Color }}>{currentTheme.p1Name.toUpperCase()}</span>
                <b>{greenCount}</b>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button className="btn-primary" onClick={() => resetGame()}>
                PLAY REMATCH
              </button>
              <button className="btn-secondary" onClick={handleShareSummary}>
                {copyFeedback ? "SUMMARY COPIED TO CLIPBOARD! ✓" : "SHARE MATCH RECAP"}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setWinner(null);
                  setMenuOpen(true);
                }}
              >
                CHANGE MODE / SETTINGS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
