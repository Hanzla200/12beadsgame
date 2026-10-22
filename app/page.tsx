"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Side = "red" | "green";
type Cell = Side | null;
type Move = { source: number; destination: number; captured: number | null };
type Mode = "two" | "computer";
type MoveFeedback = Move & { side: Side; phase: "selecting" | "moving" };

function makeGraph() {
  const graph = Array.from({ length: 25 }, () => new Set<number>());
  const connect = (a: number, b: number) => { graph[a].add(b); graph[b].add(a); };
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
    const p = row * 5 + col;
    if (col < 4) connect(p, p + 1);
    if (row < 4) connect(p, p + 5);
    if (row < 4 && col < 4) {
      if ((row + col) % 2 === 0) connect(p, p + 6);
      else connect(p + 1, p + 5);
    }
  }
  return graph;
}
const graph = makeGraph();
const other = (side: Side): Side => side === "red" ? "green" : "red";
function initialBoard(): Cell[] {
  const board: Cell[] = Array(25).fill(null);
  [...Array.from({ length: 10 }, (_, i) => i), 10, 11].forEach((i) => board[i] = "red");
  [...Array.from({ length: 10 }, (_, i) => i + 15), 13, 14].forEach((i) => board[i] = "green");
  return board;
}
function legalSteps(board: Cell[], source: number): Move[] {
  const side = board[source];
  if (!side) return [];
  const row = Math.floor(source / 5), col = source % 5;
  const moves: Move[] = [];
  for (const neighbor of graph[source]) {
    if (!board[neighbor]) { moves.push({ source, destination: neighbor, captured: null }); continue; }
    if (board[neighbor] === side) continue;
    const nr = Math.floor(neighbor / 5), nc = neighbor % 5;
    const lr = nr * 2 - row, lc = nc * 2 - col;
    if (lr < 0 || lr > 4 || lc < 0 || lc > 4) continue;
    const landing = lr * 5 + lc;
    if (graph[neighbor].has(landing) && !board[landing]) moves.push({ source, destination: landing, captured: neighbor });
  }
  return moves;
}
const count = (board: Cell[], side: Side) => board.filter((cell) => cell === side).length;
const hasMoves = (board: Cell[], side: Side) => board.some((cell, i) => cell === side && legalSteps(board, i).length > 0);
function legalActions(board: Cell[], side: Side, forcedSource?: number): Move[][] {
  const actions: Move[][] = [];
  const sources = forcedSource === undefined ? board.map((cell, i) => cell === side ? i : -1).filter((i) => i >= 0) : [forcedSource];
  for (const source of sources) for (const move of legalSteps(board, source)) {
    const after = applyMove(board, move, side);
    if (move.captured === null) actions.push([move]);
    else extendCaptures(after, move.destination, side, [move], actions);
  }
  return actions;
}
function extendCaptures(board: Cell[], source: number, side: Side, prefix: Move[], output: Move[][]) {
  const captures = legalSteps(board, source).filter((move) => move.captured !== null);
  if (!captures.length) { output.push(prefix); return; }
  for (const move of captures) extendCaptures(applyMove(board, move, side), move.destination, side, [...prefix, move], output);
}
function applyMove(board: Cell[], move: Move, side: Side): Cell[] {
  const next = [...board]; next[move.source] = null; next[move.destination] = side;
  if (move.captured !== null) next[move.captured] = null;
  return next;
}
function applyAction(board: Cell[], action: Move[], side: Side): Cell[] {
  return action.reduce((position, move) => applyMove(position, move, side), board);
}
function evaluate(board: Cell[], side: Side): number {
  const enemy = other(side), ownCount = count(board, side), enemyCount = count(board, enemy);
  const materialWeight = 150 + Math.max(0, 12 - ownCount - enemyCount) * 12;
  let score = (ownCount - enemyCount) * materialWeight;
  const ownSteps: Move[] = [], enemySteps: Move[] = [];
  board.forEach((owner, source) => {
    if (!owner) return;
    const target = owner === side ? ownSteps : enemySteps;
    target.push(...legalSteps(board, source));
  });
  score += (ownSteps.length - enemySteps.length) * 4;
  const ownVictims = new Set(ownSteps.filter((move) => move.captured !== null).map((move) => move.captured));
  const enemyVictims = new Set(enemySteps.filter((move) => move.captured !== null).map((move) => move.captured));
  score += (ownVictims.size - enemyVictims.size) * 12;
  board.forEach((owner, point) => {
    if (!owner) return;
    const row = Math.floor(point / 5), col = point % 5;
    const sign = owner === side ? 1 : -1;
    score += sign * (4 - Math.abs(row - 2) - Math.abs(col - 2)) * 5;
    const friends = [...graph[point]].filter((neighbor) => board[neighbor] === owner).length;
    score += sign * friends * 2;
    if (owner === side && enemyVictims.has(point)) score -= 24;
    if (owner === enemy && ownVictims.has(point)) score += 24;
  });
  return score;
}
function chooseCpuAction(board: Cell[], side: Side): Move[] {
  const MATE = 1_000_000, deadline = Date.now() + 900, table = new Map<string, { depth: number; score: number; flag: string; action: Move[] | null }>();
  let nodes = 0;
  class SearchTimeout extends Error {}
  const checkTime = () => { nodes++; if ((nodes & 127) === 0 && Date.now() >= deadline) throw new SearchTimeout(); };
  const keyFor = (position: Cell[], turn: Side) => turn + position.map((cell) => cell === null ? "." : cell === "red" ? "r" : "g").join("");
  const ordered = (position: Cell[], turn: Side, actions: Move[][], preferred?: Move[] | null) => actions.slice().sort((a, b) => {
    if (preferred && JSON.stringify(a) === JSON.stringify(preferred)) return -1;
    if (preferred && JSON.stringify(b) === JSON.stringify(preferred)) return 1;
    const capturesA = a.filter((move) => move.captured !== null).length, capturesB = b.filter((move) => move.captured !== null).length;
    if (capturesA !== capturesB) return capturesB - capturesA;
    const center = (action: Move[]) => action.reduce((total, move) => total + Math.abs(Math.floor(move.destination / 5) - 2) + Math.abs(move.destination % 5 - 2), 0);
    return center(a) - center(b);
  });
  function quiescence(position: Cell[], turn: Side, alpha: number, beta: number, remaining: number, ply: number, path: Set<string>): number {
    checkTime();
    const key = keyFor(position, turn);
    if (path.has(key)) return 0;
    const available = legalActions(position, turn);
    if (!available.length) return -MATE + ply;
    const stand = evaluate(position, turn);
    if (remaining <= 0 || stand >= beta) return remaining <= 0 ? stand : beta;
    alpha = Math.max(alpha, stand);
    const captures = available.filter((action) => action[0].captured !== null);
    if (!captures.length) return stand;
    const nextPath = new Set(path); nextPath.add(key);
    for (const action of ordered(position, turn, captures)) {
      const score = -quiescence(applyAction(position, action, turn), other(turn), -beta, -alpha, remaining - 1, ply + 1, nextPath);
      if (score >= beta) return beta;
      alpha = Math.max(alpha, score);
    }
    return alpha;
  }
  function search(position: Cell[], turn: Side, depth: number, alpha: number, beta: number, ply: number, path: Set<string>): number {
    checkTime();
    const key = keyFor(position, turn);
    if (path.has(key)) return 0;
    const originalAlpha = alpha, originalBeta = beta, entry = table.get(key);
    const preferred: Move[] | null = entry?.action ?? null;
    if (entry && entry.depth >= depth) {
      if (entry.flag === "exact") return entry.score;
      if (entry.flag === "lower") alpha = Math.max(alpha, entry.score);
      else beta = Math.min(beta, entry.score);
      if (alpha >= beta) return entry.score;
    }
    const actions = legalActions(position, turn);
    if (!actions.length) return -MATE + ply;
    if (depth <= 0) return quiescence(position, turn, alpha, beta, 4, ply, path);
    let best = -Infinity, bestAction: Move[] | null = null;
    const childPath = new Set(path); childPath.add(key);
    for (const action of ordered(position, turn, actions, preferred)) {
      const score = -search(applyAction(position, action, turn), other(turn), depth - 1, -beta, -alpha, ply + 1, childPath);
      if (score > best) { best = score; bestAction = action; }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    table.set(key, { depth, score: best, flag: best <= originalAlpha ? "upper" : best >= originalBeta ? "lower" : "exact", action: bestAction });
    return best;
  }
  const actions = legalActions(board, side);
  if (!actions.length) return [];
  let bestAction = ordered(board, side, actions)[0];
  for (let depth = 1; depth <= 14; depth++) {
    try {
      let alpha = -Infinity, bestScore = -Infinity, iterationBest = bestAction;
      for (const action of ordered(board, side, actions, bestAction)) {
        checkTime();
        const score = -search(applyAction(board, action, side), other(side), depth - 1, -Infinity, -alpha, 1, new Set([keyFor(board, side)]));
        if (score > bestScore) { bestScore = score; iterationBest = action; }
        alpha = Math.max(alpha, bestScore);
      }
      bestAction = iterationBest;
      if (Math.abs(bestScore) >= MATE - 100) break;
    } catch (error) {
      if (!(error instanceof SearchTimeout)) throw error;
      break;
    }
  }
  return bestAction;
}

function Icon({ type }: { type: "help" | "refresh" | "exit" | "sound" | "mute" }) {
  if (type === "help") return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 4 1.8c-1 .8-1.7 1.2-1.7 2.7M12 17h.01" /></svg>;
  if (type === "refresh") return <svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M5.6 9A7 7 0 0 1 18 6.5L20 12M4 12l2 5.5A7 7 0 0 0 18.4 15" /></svg>;
  if (type === "sound") return <svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4ZM17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" /></svg>;
  if (type === "mute") return <svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4M17 10l4 4M21 10l-4 4" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></svg>;
}

export default function Home() {
  const [cells, setCells] = useState<Cell[]>(initialBoard);
  const [turn, setTurn] = useState<Side>("red");
  const [selected, setSelected] = useState<number | null>(null);
  const [chain, setChain] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("two");
  const [menu, setMenu] = useState(true);
  const [help, setHelp] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [winReason, setWinReason] = useState("");
  const [message, setMessage] = useState("Choose a game mode to begin.");
  const [thinking, setThinking] = useState(false);
  const [moveFeedback, setMoveFeedback] = useState<MoveFeedback | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const audioContext = useRef<AudioContext | null>(null);
  const legal = useMemo(() => selected === null ? [] : chain === selected ? legalSteps(cells, selected).filter((m) => m.captured !== null) : legalSteps(cells, selected), [cells, selected, chain]);
  const destinations = new Set(legal.map((m) => m.destination));
  const points = Array.from({ length: 25 }, (_, i) => ({ i, x: 48 + i % 5 * 126, y: 48 + Math.floor(i / 5) * 126 }));
  const edges = graph.flatMap((neighbors, i) => [...neighbors].filter((n) => n > i).map((n) => [i, n] as const));

  function reset(nextMode: Mode) {
    const firstTurn: Side = Math.random() < .5 ? "red" : "green";
    setMode(nextMode); setCells(initialBoard()); setTurn(firstTurn);
    setSelected(null); setChain(null); setWinner(null); setWinReason(""); setThinking(false); setMoveFeedback(null); setMenu(false);
    setMessage(nextMode === "computer" ? firstTurn === "green" ? "Your turn" : "Computer's turn" : firstTurn === "red" ? "Red's turn" : "Green's turn");
  }
  function finish(board: Cell[], moving: Side) {
    const next = other(moving);
    setSelected(null); setChain(null);
    if (count(board, next) === 0 || !hasMoves(board, next)) {
      setWinReason(count(board, next) === 0 ? "The opponent has no beads left." : "The opponent has no legal moves.");
      setWinner(moving); setMessage((moving === "red" ? "Red" : "Green") + " wins!"); return;
    }
    setTurn(next);
    setMessage(mode === "computer" ? next === "green" ? "Your turn" : "Computer's turn" : next === "red" ? "Red's turn" : "Green's turn");
  }
  function playSound(kind: "select" | "move" | "capture" | "win") {
    if (!soundOn || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = audioContext.current ?? new AudioContextClass();
    audioContext.current = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator(), gain = context.createGain();
    const notes = { select: [440, .045], move: [620, .07], capture: [210, .13], win: [780, .18] } as const;
    const [frequency, duration] = notes[kind];
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.type = kind === "capture" ? "square" : "sine";
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(kind === "capture" ? .075 : .045, context.currentTime + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration + .02);
  }
  function cpuMove(board: Cell[]) {
    const action = chooseCpuAction(board, "red");
    if (!action.length) { setThinking(false); finish(board, "green"); return; }
    let position = board;
    const showMove = (index: number) => {
      const move = action[index];
      setSelected(move.source); setMoveFeedback({ ...move, side: "red", phase: "selecting" });
      setMessage(index === 0 ? "Computer selected a red bead" : "Computer continues its capture");
      window.setTimeout(() => {
        position = applyMove(position, move, "red");
        setCells(position); setSelected(move.destination); setMoveFeedback({ ...move, side: "red", phase: "moving" });
        setMessage(move.captured !== null ? "Computer captured a green bead" : "Computer moved its red bead");
        playSound(move.captured !== null ? "capture" : "move");
        window.setTimeout(() => {
          if (index + 1 < action.length) showMove(index + 1);
          else { setMoveFeedback(null); setThinking(false); finish(position, "red"); }
        }, 440);
      }, 460);
    };
    showMove(0);
  }
  useEffect(() => {
    if (mode !== "computer" || turn !== "red" || menu || winner || thinking) return;
    const timer = window.setTimeout(() => {
      setThinking(true);
      setMessage("Computer is thinking…");
      cpuMove(cells);
    }, 100);
    return () => window.clearTimeout(timer);
    // cpuMove deliberately reads the current render's board when this turn begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, turn, menu, winner, cells, thinking]);
  function tap(point: number) {
    if (winner || thinking || (mode === "computer" && turn === "red")) return;
    if (selected === null) {
      if (cells[point] === turn) {
        setSelected(point);
        playSound("select");
        setMessage(legalSteps(cells, point).length ? chain !== null ? "Capture again with this bead" : "Choose a connected point" : "This bead has no legal moves");
      }
      return;
    }
    if (point === selected) {
      if (chain !== null) { setMessage("Capture again with this bead"); return; }
      setSelected(null); setMessage(mode === "computer" ? "Your turn" : (turn === "red" ? "Red" : "Green") + "'s turn"); return;
    }
    if (cells[point] === turn && chain === null) {
      setSelected(point); playSound("select"); setMessage(legalSteps(cells, point).length ? "Choose a connected point" : "This bead has no legal moves"); return;
    }
    if (!destinations.has(point)) { setMessage("That point is not a legal move"); return; }
    const move = legal.find((item) => item.destination === point)!;
    const next = [...cells]; next[move.source] = null; next[point] = turn;
    if (move.captured !== null) next[move.captured] = null;
    setCells(next);
    setMoveFeedback({ ...move, side: turn, phase: "moving" });
    playSound(move.captured !== null ? "capture" : "move");
    if (move.captured !== null && legalSteps(next, point).some((item) => item.captured !== null)) {
      setChain(point); setSelected(point); setMessage("Capture again with this bead");
    } else { window.setTimeout(() => setMoveFeedback(null), 500); finish(next, turn); }
  }

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><i /><i /><i /><i /></span><span>12<span className="brand-light">BEADS</span></span></a>
      <div className="top-actions"><span className="mode-pill"><i />{mode === "computer" ? "VS COMPUTER" : "TWO PLAYERS"}</span><button className="icon-button" aria-label={soundOn ? "Mute sounds" : "Enable sounds"} aria-pressed={soundOn} onClick={() => setSoundOn((on) => !on)}><Icon type={soundOn ? "sound" : "mute"} /></button><button className="icon-button desktop-only" aria-label="How to play" onClick={() => setHelp(true)}><Icon type="help" /></button><button className="icon-button" aria-label="New game" onClick={() => reset(mode)}><Icon type="refresh" /></button><button className="icon-button desktop-only" aria-label="Game modes" onClick={() => setMenu(true)}><Icon type="exit" /></button></div>
    </header>
    <section className="game-layout">
      <div className="play-column">
        <div className="intro-row"><div><div className="eyebrow"><i /> THE CLASSIC STRATEGY GAME</div><h1>12 <em>Beads</em></h1></div><div className="round-label">✳ &nbsp;BARA TEHNI <span>/</span> ROUND 01</div></div>
        <div className="board-card"><div className="board-topline"><span>GAME BOARD</span><span className="board-coords">5 × 5 <b>·</b> 25 POINTS</span></div>
          <div className="board-wrap"><svg className="game-board" viewBox="0 0 600 600" role="group" aria-label="12 Beads game board">
            <defs><radialGradient id="boardGlow"><stop stopColor="#233632" /><stop offset="1" stopColor="#121d20" /></radialGradient><linearGradient id="redBead" x2="1" y2="1"><stop stopColor="#ff9b7a" /><stop offset=".5" stopColor="#ed6654" /><stop offset="1" stopColor="#a83635" /></linearGradient><linearGradient id="greenBead" x2="1" y2="1"><stop stopColor="#c3ed9a" /><stop offset=".5" stopColor="#80c878" /><stop offset="1" stopColor="#3a815f" /></linearGradient></defs>
            <rect x="8" y="8" width="584" height="584" rx="28" fill="url(#boardGlow)" />
            {edges.map(([a, b]) => <line key={a + "-" + b} x1={points[a].x} y1={points[a].y} x2={points[b].x} y2={points[b].y} className="board-line" />)}
            {points.map(({ i, x, y }) => <g key={i} className={"point " + (moveFeedback?.source === i ? "move-source " : "") + (moveFeedback?.destination === i ? "move-destination " : "")} onClick={() => tap(i)} role="button" aria-label={cells[i] ? cells[i] + " bead at point " + (i + 1) : "Empty point " + (i + 1)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(i); } }}>
              <circle cx={x} cy={y} r="47" className="tap-target" />
              {moveFeedback?.source === i && <circle cx={x} cy={y} r="38" className="move-ring source-ring" />}
              {moveFeedback?.destination === i && <circle cx={x} cy={y} r="40" className="move-ring destination-move-ring" />}
              {selected === i && <circle cx={x} cy={y} r="34" className="selection-ring" />}
              <circle cx={x} cy={y} r="25" className={cells[i] ? "bead " + cells[i] : "board-node"} />{cells[i] && <ellipse cx={x - 7} cy={y - 9} rx="6" ry="4" className="bead-shine" />}
            </g>)}
          </svg><div className="board-stamp"><span>12</span><small>BEADS</small></div></div>
          <div className="board-footer"><i /> Select a bead, then move along a connected line</div>
        </div>
      </div>
      <aside className="sidebar">
        <div className="turn-card"><div className="card-kicker">CURRENT TURN <i /></div><div className="turn-player"><span className={"player-token " + turn} /><strong>{mode === "computer" && turn === "red" ? "Computer" : turn === "red" ? "Red" : "Green"}<small>{mode === "computer" && turn === "green" ? "YOU" : mode === "computer" ? "OPPONENT" : "PLAYER"}</small></strong><span className="turn-arrow">↗</span></div><div className="turn-message">{message}</div></div>
        <div className="score-card"><div className="card-kicker">BEADS IN PLAY</div><div className="score-row">{(["red", "green"] as Side[]).map((side) => <div key={side} className={"score-side " + (turn === side ? "active" : "")}><div className="score-caption"><i className={"mini-token " + side} />{side.toUpperCase()}</div><div className="score-value">{count(cells, side)}<small> / 12</small></div><div className={"score-track " + (side === "green" ? "green-track" : "")}><i style={{ width: count(cells, side) / 12 * 100 + "%" }} /></div></div>)}</div></div>
        <div className="objective-card"><span className="objective-icon">✦</span><div><div className="card-kicker">{mode === "computer" ? "YOUR SIDE" : "YOUR OBJECTIVE"}</div><p>{mode === "computer" ? "You play green. The computer plays red." : "Capture every opponent bead, or leave them with no legal moves."}</p></div></div>
        <button className="rules-button" onClick={() => setHelp(true)}><span className="rules-icon">?</span><span><b>How to play</b><small>Learn the rules of Bara Tehni</small></span><span className="rules-arrow">↗</span></button>
        <div className="quick-tip"><span>✳</span><p><b>Quick tip</b><br />A jump capture must continue as long as the same bead can capture again.</p></div>
        <div className="sidebar-bottom"><i /> READY TO PLAY <span>·</span> EST. TRADITION</div>
      </aside>
    </section>
    <footer className="page-footer"><span>12 BEADS <b>·</b> BARA TEHNI</span><span>THINK AHEAD. STAY CONNECTED.</span></footer>
    {(menu || help || winner) && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true">
      <button className="modal-close" aria-label="Close" onClick={() => { setMenu(false); setHelp(false); }}><Icon type="exit" /></button>
      {menu ? <><div className="modal-emblem">12</div><div className="eyebrow centered">A GAME OF PATIENCE & POSITION</div><h2>Choose your <em>game</em></h2><p className="modal-copy">A timeless strategy game. Make every move count.</p><button className="mode-choice primary-choice" onClick={() => reset("two")}><span className="choice-symbol">♟♟</span><span><b>Two players</b><small>Play together on one board</small></span><span className="choice-arrow">↗</span></button><button className="mode-choice" onClick={() => reset("computer")}><span className="choice-symbol">♟</span><span><b>Play the computer</b><small>You play green against red</small></span><span className="choice-arrow">↗</span></button></> :
        help ? <><div className="eyebrow centered">THE ESSENTIALS</div><h2>How to <em>play</em></h2><p className="modal-copy">Take turns moving your beads along the lines.</p><div className="rule-list"><div><i>01</i><p><b>Move along a line</b><span>Move a bead to a connected empty point.</span></p></div><div><i>02</i><p><b>Jump to capture</b><span>Jump over an opponent into the empty point beyond.</span></p></div><div><i>03</i><p><b>Continue captures</b><span>Keep jumping with the same bead when possible.</span></p></div><div><i>04</i><p><b>Win the game</b><span>Capture every bead or leave no legal moves.</span></p></div></div><button className="modal-primary" onClick={() => setHelp(false)}>GOT IT　→</button></> :
        <><div className="modal-emblem">✦</div><div className="eyebrow centered">MATCH COMPLETE</div><h2>{winner === "red" ? "Red" : "Green"} <em>wins!</em></h2><p className="modal-copy">{winReason}</p><div className="match-summary"><div><span className="summary-token red" />RED <b>{count(cells, "red")}</b></div><div><span className="summary-token green" />GREEN <b>{count(cells, "green")}</b></div></div><div className="next-game-label">WHAT WOULD YOU LIKE TO PLAY NEXT?</div><button className="mode-choice primary-choice" onClick={() => reset(mode)}><span className="choice-symbol">↻</span><span><b>Rematch</b><small>{mode === "computer" ? "Play the computer again" : "Play another two-player game"}</small></span><span className="choice-arrow">↗</span></button><button className="mode-choice" onClick={() => reset("two")}><span className="choice-symbol">♟♟</span><span><b>Two players</b><small>Play together on one board</small></span><span className="choice-arrow">↗</span></button><button className="mode-choice" onClick={() => reset("computer")}><span className="choice-symbol">♟</span><span><b>Play the computer</b><small>You play green against red</small></span><span className="choice-arrow">↗</span></button></>}
    </section></div>}
  </main>;
}
