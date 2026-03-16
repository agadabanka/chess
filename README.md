# Chess

Classic chess game with full piece movement, capture, castling, and turn-based play.

Built with [ECS Game Factory](https://github.com/agadabanka/game-factory) using the **TypeScript Intermediate Language** pipeline.

## Architecture

```
game.js (TypeScript IL)  →  esbuild-wasm  →  dist/game.bundle.js (standalone)
```

- `game.js` — The game spec written using the `@engine` SDK. Defines components, entities, resources, and systems as JavaScript functions.
- `dist/game.bundle.js` — Standalone bundle (24KB) with zero external dependencies. Includes the ECS runtime, board helpers, and render helpers inlined.
- `spec.json` — The original JSON spec (for backward compatibility with the JSON compiler path).

## How It Works

The TypeScript IL replaces the JSON config + 14 hard-coded system factories with:
- **`defineGame()`** — declares display, input, timing config
- **`game.component()`** — registers component types
- **`game.resource()`** — registers global state
- **`game.system(name, fn)`** — systems are plain functions, not config blobs

Move validation uses `@engine/board` helpers (`isLegalMove`, `buildBoardMap`).
Rendering uses `@engine/render` helpers (`drawCheckerboard`, `drawEntitiesAsText`, `drawHUD`).

## Controls

| Key | Action |
|-----|--------|
| Arrow keys / WASD | Move cursor |
| Space / Enter | Select piece / Move piece |
| R | Restart |

## Features

- All standard piece movements (pawn, knight, bishop, rook, queen, king)
- Castling (king + rook, both sides)
- Pawn double-move from starting position
- Diagonal pawn capture
- Turn-based play (white/black)
- Move counter and score tracking
- Checkmate detection (king capture)
