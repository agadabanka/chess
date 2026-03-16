/**
 * Chess — TypeScript IL game spec using @engine SDK.
 *
 * This is the chess.json spec rewritten as executable JavaScript using the
 * engine SDK. All game logic (spawning, input, move validation, rendering)
 * is expressed as system functions instead of config blobs.
 *
 * To run:  game.start(canvas)
 * To bundle:  bundleGame(thisFileSource) → standalone JS
 */

import { defineGame } from '@engine/core';
import { buildBoardMap, isLegalMove } from '@engine/board';
import { consumeAction, moveCursor } from '@engine/input';
import {
  clearCanvas, drawBorder, drawCheckerboard,
  drawEntitiesAsText, drawHighlight, drawHUD, drawGameOver,
} from '@engine/render';

// --- Game Definition ---

const BOARD_WIDTH = 8;
const BOARD_HEIGHT = 8;
const CELL_SIZE = 60;

const game = defineGame({
  display: {
    type: 'grid',
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    cellSize: CELL_SIZE,
    background: '#2a1f1a',
  },
  input: {
    up:      { keys: ['ArrowUp', 'w'] },
    down:    { keys: ['ArrowDown', 's'] },
    left:    { keys: ['ArrowLeft', 'a'] },
    right:   { keys: ['ArrowRight', 'd'] },
    select:  { keys: [' ', 'Enter'] },
    restart: { keys: ['r', 'R'] },
  },
});

// --- Components ---

game.component('Position', { x: 0, y: 0 });
game.component('ChessPiece', { type: '', color: '', hasMoved: false, displayChar: '' });
game.component('Selected', {});
game.component('Cursor', {});

// --- Resources ---

game.resource('state', {
  score: 0,
  level: 1,
  gameOver: false,
  currentTurn: 'white',
  moveCount: 0,
});

// --- Move Rules ---

const MOVE_RULES = {
  pawn: [
    { type: 'forward', distance: 1 },
    { type: 'forward', distance: 2, firstMoveOnly: true },
    { type: 'forwardDiagonal', captureOnly: true },
  ],
  knight: [
    { type: 'leap', offsets: [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]] },
  ],
  bishop: [
    { type: 'slide', directions: [[1,1],[1,-1],[-1,1],[-1,-1]] },
  ],
  rook: [
    { type: 'slide', directions: [[1,0],[-1,0],[0,1],[0,-1]] },
  ],
  queen: [
    { type: 'slide', directions: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] },
  ],
  king: [
    { type: 'step', directions: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] },
    { type: 'castle' },
  ],
};

const BOARD_GAME_CFG = {
  colorField: 'color',
  typeField: 'type',
  boardWidth: BOARD_WIDTH,
  boardHeight: BOARD_HEIGHT,
  forwardDirection: { white: -1, black: 1 },
  pawnStartRows: { white: 6, black: 1 },
  kingType: 'king',
  rookType: 'rook',
};

const PIECE_VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 1000 };

// --- Piece Setup ---

const BACK_ROW = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
const WHITE_CHARS = { rook: '♖', knight: '♘', bishop: '♗', queen: '♕', king: '♔', pawn: '♙' };
const BLACK_CHARS = { rook: '♜', knight: '♞', bishop: '♝', queen: '♛', king: '♚', pawn: '♟' };

// Spawn system — creates all 32 pieces + cursor on first tick
game.system('spawn', function spawnSystem(world, _dt) {
  // Only spawn once
  if (world.getResource('_spawned')) return;
  world.setResource('_spawned', true);

  // White back row (y=7)
  for (let x = 0; x < 8; x++) {
    const type = BACK_ROW[x];
    const eid = world.createEntity();
    world.addComponent(eid, 'Position', { x, y: 7 });
    world.addComponent(eid, 'ChessPiece', {
      type, color: 'white', hasMoved: false, displayChar: WHITE_CHARS[type],
    });
  }

  // White pawns (y=6)
  for (let x = 0; x < 8; x++) {
    const eid = world.createEntity();
    world.addComponent(eid, 'Position', { x, y: 6 });
    world.addComponent(eid, 'ChessPiece', {
      type: 'pawn', color: 'white', hasMoved: false, displayChar: '♙',
    });
  }

  // Black back row (y=0)
  for (let x = 0; x < 8; x++) {
    const type = BACK_ROW[x];
    const eid = world.createEntity();
    world.addComponent(eid, 'Position', { x, y: 0 });
    world.addComponent(eid, 'ChessPiece', {
      type, color: 'black', hasMoved: false, displayChar: BLACK_CHARS[type],
    });
  }

  // Black pawns (y=1)
  for (let x = 0; x < 8; x++) {
    const eid = world.createEntity();
    world.addComponent(eid, 'Position', { x, y: 1 });
    world.addComponent(eid, 'ChessPiece', {
      type: 'pawn', color: 'black', hasMoved: false, displayChar: '♟',
    });
  }

  // Cursor
  const cursor = world.createEntity();
  world.addComponent(cursor, 'Position', { x: 4, y: 4 });
  world.addComponent(cursor, 'Cursor', {});
});

// --- Input System ---

game.system('input', function inputSystem(world, _dt) {
  const state = world.getResource('state');
  if (state && state.gameOver) return;

  const input = world.getResource('input');
  const cursors = world.query('Position', 'Cursor');
  if (cursors.length === 0) return;
  const cursorEid = cursors[0];

  // Cursor movement
  if (consumeAction(input, 'up'))    moveCursor(world, cursorEid, 0, -1, BOARD_WIDTH, BOARD_HEIGHT);
  if (consumeAction(input, 'down'))  moveCursor(world, cursorEid, 0,  1, BOARD_WIDTH, BOARD_HEIGHT);
  if (consumeAction(input, 'left'))  moveCursor(world, cursorEid, -1, 0, BOARD_WIDTH, BOARD_HEIGHT);
  if (consumeAction(input, 'right')) moveCursor(world, cursorEid,  1, 0, BOARD_WIDTH, BOARD_HEIGHT);

  // Select or move
  if (consumeAction(input, 'select')) {
    const cursorPos = world.getComponent(cursorEid, 'Position');
    handleSelectOrMove(world, cursorPos, state);
  }
});

function handleSelectOrMove(world, cursorPos, state) {
  const selectedEntities = world.query('Position', 'ChessPiece', 'Selected');

  if (selectedEntities.length > 0) {
    // A piece is selected — try to move it
    const selEid = selectedEntities[0];
    const selPos = world.getComponent(selEid, 'Position');
    const selPiece = world.getComponent(selEid, 'ChessPiece');

    // Deselect if clicking same square
    if (selPos.x === cursorPos.x && selPos.y === cursorPos.y) {
      world.removeComponent(selEid, 'Selected');
      return;
    }

    // Check target square
    const allPieces = world.query('Position', 'ChessPiece');
    let targetEid = null;
    for (const pid of allPieces) {
      if (pid === selEid) continue;
      const ppos = world.getComponent(pid, 'Position');
      if (ppos.x === cursorPos.x && ppos.y === cursorPos.y) {
        targetEid = pid;
        break;
      }
    }

    // Switch selection if clicking own piece
    if (targetEid !== null) {
      const targetPiece = world.getComponent(targetEid, 'ChessPiece');
      if (targetPiece.color === selPiece.color) {
        world.removeComponent(selEid, 'Selected');
        world.addComponent(targetEid, 'Selected', {});
        return;
      }
    }

    // Validate move
    const board = buildBoardMap(world, 'ChessPiece');
    if (!isLegalMove(selPiece, selPos.x, selPos.y, cursorPos.x, cursorPos.y, board, MOVE_RULES, BOARD_GAME_CFG)) {
      return; // Illegal move
    }

    // Handle castling (king moves 2 squares)
    if (selPiece.type === 'king' && Math.abs(cursorPos.x - selPos.x) === 2) {
      const dx = cursorPos.x - selPos.x;
      const rookX = dx > 0 ? 7 : 0;
      const rookNewX = dx > 0 ? cursorPos.x - 1 : cursorPos.x + 1;
      for (const pid of allPieces) {
        const ppos = world.getComponent(pid, 'Position');
        const pp = world.getComponent(pid, 'ChessPiece');
        if (pp.type === 'rook' && pp.color === selPiece.color && ppos.x === rookX && ppos.y === selPos.y) {
          ppos.x = rookNewX;
          pp.hasMoved = true;
          break;
        }
      }
    }

    // Capture enemy piece
    if (targetEid !== null) {
      const targetPiece = world.getComponent(targetEid, 'ChessPiece');
      world.emit('pieceCaptured', {
        type: targetPiece.type,
        color: targetPiece.color,
        value: PIECE_VALUES[targetPiece.type] || 1,
      });
      world.destroyEntity(targetEid);
      if (targetPiece.type === 'king') {
        state.gameOver = true;
        world.emit('checkmate');
      }
    }

    // Move piece
    selPos.x = cursorPos.x;
    selPos.y = cursorPos.y;
    selPiece.hasMoved = true;
    world.removeComponent(selEid, 'Selected');

    // Switch turns
    const turns = ['white', 'black'];
    const currentIdx = turns.indexOf(state.currentTurn);
    state.currentTurn = turns[(currentIdx + 1) % turns.length];
    state.moveCount = (state.moveCount || 0) + 1;
    world.emit('moveMade', { nextTurn: state.currentTurn });

  } else {
    // No piece selected — try to select one
    const allPieces = world.query('Position', 'ChessPiece');
    for (const pid of allPieces) {
      const ppos = world.getComponent(pid, 'Position');
      const piece = world.getComponent(pid, 'ChessPiece');
      if (ppos.x === cursorPos.x && ppos.y === cursorPos.y) {
        if (state.currentTurn && piece.color !== state.currentTurn) continue;
        world.addComponent(pid, 'Selected', {});
        break;
      }
    }
  }
}

// --- Scoring System ---

game.system('scoring', function scoringSystem(world, _dt) {
  const events = world.getEvents('pieceCaptured');
  if (events.length === 0) return;

  const state = world.getResource('state');
  if (!state) return;

  for (const ev of events) {
    const value = ev.data.value || 1;
    // Award to capturing side (opposite of captured piece's color)
    const capturingColor = ev.data.color === 'white' ? 'black' : 'white';
    state[`score_${capturingColor}`] = (state[`score_${capturingColor}`] || 0) + value;
    state.score += value;
  }
});

// --- Render System ---

game.system('render', function renderSystem(world, _dt) {
  const renderer = world.getResource('renderer');
  if (!renderer) return;

  const { ctx, cellSize, offsetX, offsetY } = renderer;
  const state = world.getResource('state');
  const W = BOARD_WIDTH * cellSize;
  const H = BOARD_HEIGHT * cellSize;

  // Clear
  clearCanvas(ctx, '#2a1f1a');
  drawBorder(ctx, offsetX, offsetY, W, H);

  // Checkerboard
  drawCheckerboard(ctx, offsetX, offsetY, cellSize, BOARD_WIDTH, BOARD_HEIGHT, '#f0d9b5', '#b58863');

  // Pieces
  drawEntitiesAsText(ctx, world, offsetX, offsetY, cellSize, {
    queryComponents: ['Position', 'ChessPiece'],
    component: 'ChessPiece',
    displayField: 'displayChar',
    colorField: 'color',
    fontScale: 0.75,
    fontFamily: 'serif',
    colorMap: { white: '#fff', black: '#000' },
  });

  // Cursor highlight
  drawHighlight(ctx, world, offsetX, offsetY, cellSize, {
    queryComponents: ['Position', 'Cursor'],
    color: '#ffff00',
    lineWidth: 3,
  });

  // Selected piece highlight
  drawHighlight(ctx, world, offsetX, offsetY, cellSize, {
    queryComponents: ['Position', 'ChessPiece', 'Selected'],
    color: '#00ff00',
    lineWidth: 3,
  });

  // HUD
  drawHUD(ctx, state, offsetX, W, offsetY, {
    fields: ['currentTurn', 'moveCount', 'score'],
    fontSize: 18,
    labels: { currentTurn: 'Turn', moveCount: 'Moves' },
  });

  // Game over overlay
  if (state && state.gameOver) {
    drawGameOver(ctx, offsetX, offsetY, W, H, {
      title: 'CHECKMATE!',
      titleColor: '#ff4444',
      subtitle: 'Press R to restart',
    });
  }
});

export default game;
