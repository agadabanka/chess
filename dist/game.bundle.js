// engine-ecs:../ecs/index.js
var World = class {
  constructor() {
    this.nextEntityId = 0;
    this.entities = /* @__PURE__ */ new Set();
    this.components = /* @__PURE__ */ new Map();
    this.systems = [];
    this.resources = /* @__PURE__ */ new Map();
    this.events = [];
    this.running = true;
  }
  // --- Entities ---
  createEntity() {
    const id = this.nextEntityId++;
    this.entities.add(id);
    return id;
  }
  destroyEntity(id) {
    this.entities.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
  }
  // --- Components ---
  registerComponent(name) {
    if (!this.components.has(name)) {
      this.components.set(name, /* @__PURE__ */ new Map());
    }
  }
  addComponent(entityId, name, data = {}) {
    if (!this.components.has(name)) {
      this.registerComponent(name);
    }
    this.components.get(name).set(entityId, data);
    return this;
  }
  getComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.get(entityId) : void 0;
  }
  hasComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.has(entityId) : false;
  }
  removeComponent(entityId, name) {
    const store = this.components.get(name);
    if (store) store.delete(entityId);
  }
  // --- Queries ---
  query(...componentNames) {
    const results = [];
    for (const entityId of this.entities) {
      let match = true;
      for (const name of componentNames) {
        if (!this.hasComponent(entityId, name)) {
          match = false;
          break;
        }
      }
      if (match) results.push(entityId);
    }
    return results;
  }
  // --- Resources (global singletons) ---
  setResource(name, data) {
    this.resources.set(name, data);
  }
  getResource(name) {
    return this.resources.get(name);
  }
  // --- Events ---
  emit(type, data = {}) {
    this.events.push({ type, data });
  }
  getEvents(type) {
    return this.events.filter((e) => e.type === type);
  }
  clearEvents() {
    this.events.length = 0;
  }
  // --- Systems ---
  addSystem(name, fn, priority = 0) {
    this.systems.push({ name, fn, priority });
    this.systems.sort((a, b) => a.priority - b.priority);
  }
  tick(dt) {
    for (const system of this.systems) {
      system.fn(this, dt);
    }
    this.clearEvents();
  }
};

// engine:@engine/core
function defineGame(config) {
  const components = {};
  const entities = [];
  const resources = {};
  const systems = [];
  const builder = {
    /** Register a component type with default values. */
    component(name, defaults = {}) {
      components[name] = defaults;
      return builder;
    },
    /** Spawn an entity with the given components. */
    spawn(name, componentData) {
      entities.push({ name, components: componentData });
      return builder;
    },
    /** Register a global resource. */
    resource(name, data) {
      resources[name] = data;
      return builder;
    },
    /** Add a system function. Systems run in registration order. */
    system(name, fn) {
      systems.push({ name, fn });
      return builder;
    },
    /** Compile into a running ECS World with canvas. */
    compile(canvas) {
      const world = new World();
      const display = config.display;
      if (display.type === "grid") {
        const grid = [];
        for (let r = 0; r < display.height; r++) {
          grid.push(new Array(display.width).fill(null));
        }
        world.setResource("_board", {
          cols: display.width,
          rows: display.height,
          grid
        });
      }
      for (const [name, data] of Object.entries(resources)) {
        world.setResource(name, JSON.parse(JSON.stringify(data)));
      }
      if (config.input) {
        const input = {};
        for (const action of Object.keys(config.input)) {
          input[action] = false;
        }
        world.setResource("input", input);
      }
      if (config.timing) {
        world.setResource("_tickRate", config.timing.tickRate);
      }
      if (canvas) {
        const cellSize = display.cellSize || 30;
        const ctx = canvas.getContext("2d");
        canvas.width = display.width * cellSize + 180;
        canvas.height = display.height * cellSize + 20;
        world.setResource("renderer", { ctx, cellSize, offsetX: 10, offsetY: 10 });
      }
      for (const name of Object.keys(components)) {
        world.registerComponent(name);
      }
      for (const entity of entities) {
        const eid = world.createEntity();
        for (const [compName, compData] of Object.entries(entity.components)) {
          world.addComponent(eid, compName, JSON.parse(JSON.stringify(compData)));
        }
      }
      for (let i = 0; i < systems.length; i++) {
        world.addSystem(systems[i].name, systems[i].fn, i);
      }
      world.setResource("_config", config);
      world.setResource("_components", components);
      return world;
    },
    /** Compile and start the game loop with keyboard wiring. */
    start(canvas) {
      const world = builder.compile(canvas);
      if (config.input) {
        const input = world.getResource("input");
        const keyToAction = {};
        for (const [action, keys] of Object.entries(config.input)) {
          const keyList = Array.isArray(keys) ? keys : keys.keys || [keys];
          for (const key of keyList) {
            keyToAction[key] = action;
          }
        }
        document.addEventListener("keydown", (e) => {
          const action = keyToAction[e.key];
          if (action) {
            e.preventDefault();
            if (action === "restart") {
              const board = world.getResource("_board");
              if (board) {
                for (let r = 0; r < board.rows; r++) board.grid[r].fill(null);
              }
              const state = world.getResource("state");
              if (state && resources.state) {
                Object.assign(state, JSON.parse(JSON.stringify(resources.state)));
              }
              return;
            }
            input[action] = true;
          }
        });
      }
      let last = performance.now();
      function loop(now) {
        const dt = now - last;
        last = now;
        world.tick(dt);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      return world;
    },
    /** Expose config for introspection. */
    getConfig() {
      return config;
    },
    getSystems() {
      return systems;
    },
    getResources() {
      return resources;
    },
    getComponents() {
      return components;
    },
    getEntities() {
      return entities;
    }
  };
  return builder;
}

// engine:@engine/board
function buildBoardMap(world, pieceComponent) {
  const map = /* @__PURE__ */ new Map();
  const allPieces = world.query("Position", pieceComponent);
  for (const eid of allPieces) {
    const pos = world.getComponent(eid, "Position");
    const piece = world.getComponent(eid, pieceComponent);
    map.set(`${pos.x},${pos.y}`, { eid, ...piece });
  }
  return map;
}
function inBounds(x, y, width, height) {
  return x >= 0 && x < width && y >= 0 && y < height;
}
function isPathClear(fx, fy, tx, ty, board) {
  const sx = Math.sign(tx - fx);
  const sy = Math.sign(ty - fy);
  let x = fx + sx;
  let y = fy + sy;
  while (x !== tx || y !== ty) {
    if (board.has(`${x},${y}`)) return false;
    x += sx;
    y += sy;
  }
  return true;
}
function isLegalMove(piece, fx, fy, tx, ty, board, moveRules, cfg) {
  const dx = tx - fx;
  const dy = ty - fy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const target = board.get(`${tx},${ty}`);
  const colorField = cfg.colorField || "color";
  const typeField = cfg.typeField || "type";
  const boardWidth = cfg.boardWidth || 8;
  const boardHeight = cfg.boardHeight || 8;
  if (target && target[colorField] === piece[colorField]) return false;
  if (!inBounds(tx, ty, boardWidth, boardHeight)) return false;
  const pieceType = piece[typeField];
  const rules = moveRules[pieceType];
  if (!rules) return true;
  const forwardDirs = cfg.forwardDirection || {};
  const forwardDir = forwardDirs[piece[colorField]] || -1;
  for (const rule of rules) {
    switch (rule.type) {
      case "slide": {
        for (const [sdx, sdy] of rule.directions) {
          if (sdx === 0 && sdy === 0) continue;
          if (sdx === 0) {
            if (dx !== 0 || dy === 0) continue;
            if (Math.sign(dy) !== sdy && sdy !== 0) continue;
          } else if (sdy === 0) {
            if (dy !== 0 || dx === 0) continue;
            if (Math.sign(dx) !== sdx && sdx !== 0) continue;
          } else {
            if (adx !== ady || adx === 0) continue;
            if (Math.sign(dx) !== sdx || Math.sign(dy) !== sdy) continue;
          }
          if (isPathClear(fx, fy, tx, ty, board)) return true;
        }
        break;
      }
      case "step": {
        for (const [sdx, sdy] of rule.directions) {
          if (dx === sdx && dy === sdy) return true;
        }
        break;
      }
      case "leap": {
        for (const [ldx, ldy] of rule.offsets) {
          if (dx === ldx && dy === ldy) return true;
        }
        break;
      }
      case "forward": {
        const dist = rule.distance || 1;
        if (dx === 0 && dy === forwardDir * dist && !target) {
          if (dist === 2) {
            const startRows = cfg.pawnStartRows || {};
            const startRow = startRows[piece[colorField]];
            if (startRow !== void 0 && fy !== startRow) continue;
            if (!rule.firstMoveOnly || !piece.hasMoved) {
              if (!board.has(`${fx},${fy + forwardDir}`)) return true;
            }
          } else {
            return true;
          }
        }
        break;
      }
      case "forwardDiagonal": {
        if (adx === 1 && dy === forwardDir && target && target[colorField] !== piece[colorField]) {
          return true;
        }
        break;
      }
      case "castle": {
        if (ady === 0 && adx === 2 && !piece.hasMoved) {
          const rookX = dx > 0 ? boardWidth - 1 : 0;
          const rookKey = `${rookX},${fy}`;
          const rookInfo = board.get(rookKey);
          const rookType = cfg.rookType || "rook";
          if (rookInfo && rookInfo[typeField] === rookType && rookInfo[colorField] === piece[colorField]) {
            const step = dx > 0 ? 1 : -1;
            for (let x = fx + step; x !== rookX; x += step) {
              if (board.has(`${x},${fy}`)) return false;
            }
            return true;
          }
        }
        break;
      }
    }
  }
  return false;
}

// engine:@engine/input
function moveCursor(world, cursorEid, dx, dy, width, height) {
  const pos = world.getComponent(cursorEid, "Position");
  if (!pos) return false;
  const nx = pos.x + dx;
  const ny = pos.y + dy;
  if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
    pos.x = nx;
    pos.y = ny;
    return true;
  }
  return false;
}
function consumeAction(input, action) {
  if (input[action]) {
    input[action] = false;
    return true;
  }
  return false;
}

// engine:@engine/render
function drawCheckerboard(ctx, offsetX, offsetY, cellSize, width, height, lightColor, darkColor) {
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? lightColor : darkColor;
      ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
  }
}
function drawEntitiesAsText(ctx, world, offsetX, offsetY, cellSize, opts = {}) {
  const {
    queryComponents = ["Position"],
    component,
    displayField = "displayChar",
    colorField = "color",
    fontScale = 0.7,
    fontFamily = "serif",
    colorMap = {}
  } = opts;
  const entities = world.query(...queryComponents);
  const compName = component || queryComponents[queryComponents.length - 1];
  ctx.font = `${Math.floor(cellSize * fontScale)}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const eid of entities) {
    const pos = world.getComponent(eid, "Position");
    const comp = world.getComponent(eid, compName);
    if (!comp) continue;
    const color = comp[colorField];
    ctx.fillStyle = colorMap[color] || color || "#fff";
    ctx.fillText(
      comp[displayField] || "?",
      offsetX + pos.x * cellSize + cellSize / 2,
      offsetY + pos.y * cellSize + cellSize / 2
    );
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
function drawHighlight(ctx, world, offsetX, offsetY, cellSize, opts = {}) {
  const {
    queryComponents = ["Position"],
    color = "#ffff00",
    lineWidth = 3
  } = opts;
  const entities = world.query(...queryComponents);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  for (const eid of entities) {
    const pos = world.getComponent(eid, "Position");
    ctx.strokeRect(
      offsetX + pos.x * cellSize + 1,
      offsetY + pos.y * cellSize + 1,
      cellSize - 2,
      cellSize - 2
    );
  }
}
function drawHUD(ctx, state, offsetX, gridWidth, offsetY, opts = {}) {
  const {
    fields = ["score"],
    fontSize = 18,
    labels = {},
    color = "#fff"
  } = opts;
  const hudX = offsetX + gridWidth + 15;
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  let y = offsetY + 30;
  for (const field of fields) {
    const label = labels[field] || field.charAt(0).toUpperCase() + field.slice(1);
    const value = state[field] !== void 0 ? state[field] : "\u2014";
    ctx.fillText(`${label}: ${value}`, hudX, y);
    y += fontSize + 8;
  }
}
function drawGameOver(ctx, offsetX, offsetY, W, H, opts = {}) {
  const {
    title = "GAME OVER",
    titleColor = "#ff4444",
    subtitle
  } = opts;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(offsetX, offsetY, W, H);
  ctx.fillStyle = titleColor;
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, offsetX + W / 2, offsetY + H / 2 - 20);
  if (subtitle) {
    ctx.fillStyle = "#fff";
    ctx.font = "18px monospace";
    ctx.fillText(subtitle, offsetX + W / 2, offsetY + H / 2 + 20);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
function clearCanvas(ctx, bgColor = "#111") {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function drawBorder(ctx, offsetX, offsetY, W, H, color = "#444") {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, W, H);
}

// ../../../virtual/game.js
var BOARD_WIDTH = 8;
var BOARD_HEIGHT = 8;
var CELL_SIZE = 60;
var game = defineGame({
  display: {
    type: "grid",
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    cellSize: CELL_SIZE,
    background: "#2a1f1a"
  },
  input: {
    up: { keys: ["ArrowUp", "w"] },
    down: { keys: ["ArrowDown", "s"] },
    left: { keys: ["ArrowLeft", "a"] },
    right: { keys: ["ArrowRight", "d"] },
    select: { keys: [" ", "Enter"] },
    restart: { keys: ["r", "R"] }
  }
});
game.component("Position", { x: 0, y: 0 });
game.component("ChessPiece", { type: "", color: "", hasMoved: false, displayChar: "" });
game.component("Selected", {});
game.component("Cursor", {});
game.resource("state", {
  score: 0,
  level: 1,
  gameOver: false,
  currentTurn: "white",
  moveCount: 0
});
var MOVE_RULES = {
  pawn: [
    { type: "forward", distance: 1 },
    { type: "forward", distance: 2, firstMoveOnly: true },
    { type: "forwardDiagonal", captureOnly: true }
  ],
  knight: [
    { type: "leap", offsets: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] }
  ],
  bishop: [
    { type: "slide", directions: [[1, 1], [1, -1], [-1, 1], [-1, -1]] }
  ],
  rook: [
    { type: "slide", directions: [[1, 0], [-1, 0], [0, 1], [0, -1]] }
  ],
  queen: [
    { type: "slide", directions: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] }
  ],
  king: [
    { type: "step", directions: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] },
    { type: "castle" }
  ]
};
var BOARD_GAME_CFG = {
  colorField: "color",
  typeField: "type",
  boardWidth: BOARD_WIDTH,
  boardHeight: BOARD_HEIGHT,
  forwardDirection: { white: -1, black: 1 },
  pawnStartRows: { white: 6, black: 1 },
  kingType: "king",
  rookType: "rook"
};
var PIECE_VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 1e3 };
var BACK_ROW = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
var WHITE_CHARS = { rook: "\u2656", knight: "\u2658", bishop: "\u2657", queen: "\u2655", king: "\u2654", pawn: "\u2659" };
var BLACK_CHARS = { rook: "\u265C", knight: "\u265E", bishop: "\u265D", queen: "\u265B", king: "\u265A", pawn: "\u265F" };
game.system("spawn", function spawnSystem(world, _dt) {
  if (world.getResource("_spawned")) return;
  world.setResource("_spawned", true);
  for (let x = 0; x < 8; x++) {
    const type = BACK_ROW[x];
    const eid = world.createEntity();
    world.addComponent(eid, "Position", { x, y: 7 });
    world.addComponent(eid, "ChessPiece", {
      type,
      color: "white",
      hasMoved: false,
      displayChar: WHITE_CHARS[type]
    });
  }
  for (let x = 0; x < 8; x++) {
    const eid = world.createEntity();
    world.addComponent(eid, "Position", { x, y: 6 });
    world.addComponent(eid, "ChessPiece", {
      type: "pawn",
      color: "white",
      hasMoved: false,
      displayChar: "\u2659"
    });
  }
  for (let x = 0; x < 8; x++) {
    const type = BACK_ROW[x];
    const eid = world.createEntity();
    world.addComponent(eid, "Position", { x, y: 0 });
    world.addComponent(eid, "ChessPiece", {
      type,
      color: "black",
      hasMoved: false,
      displayChar: BLACK_CHARS[type]
    });
  }
  for (let x = 0; x < 8; x++) {
    const eid = world.createEntity();
    world.addComponent(eid, "Position", { x, y: 1 });
    world.addComponent(eid, "ChessPiece", {
      type: "pawn",
      color: "black",
      hasMoved: false,
      displayChar: "\u265F"
    });
  }
  const cursor = world.createEntity();
  world.addComponent(cursor, "Position", { x: 4, y: 4 });
  world.addComponent(cursor, "Cursor", {});
});
game.system("input", function inputSystem(world, _dt) {
  const state = world.getResource("state");
  if (state && state.gameOver) return;
  const input = world.getResource("input");
  const cursors = world.query("Position", "Cursor");
  if (cursors.length === 0) return;
  const cursorEid = cursors[0];
  if (consumeAction(input, "up")) moveCursor(world, cursorEid, 0, -1, BOARD_WIDTH, BOARD_HEIGHT);
  if (consumeAction(input, "down")) moveCursor(world, cursorEid, 0, 1, BOARD_WIDTH, BOARD_HEIGHT);
  if (consumeAction(input, "left")) moveCursor(world, cursorEid, -1, 0, BOARD_WIDTH, BOARD_HEIGHT);
  if (consumeAction(input, "right")) moveCursor(world, cursorEid, 1, 0, BOARD_WIDTH, BOARD_HEIGHT);
  if (consumeAction(input, "select")) {
    const cursorPos = world.getComponent(cursorEid, "Position");
    handleSelectOrMove(world, cursorPos, state);
  }
});
function handleSelectOrMove(world, cursorPos, state) {
  const selectedEntities = world.query("Position", "ChessPiece", "Selected");
  if (selectedEntities.length > 0) {
    const selEid = selectedEntities[0];
    const selPos = world.getComponent(selEid, "Position");
    const selPiece = world.getComponent(selEid, "ChessPiece");
    if (selPos.x === cursorPos.x && selPos.y === cursorPos.y) {
      world.removeComponent(selEid, "Selected");
      return;
    }
    const allPieces = world.query("Position", "ChessPiece");
    let targetEid = null;
    for (const pid of allPieces) {
      if (pid === selEid) continue;
      const ppos = world.getComponent(pid, "Position");
      if (ppos.x === cursorPos.x && ppos.y === cursorPos.y) {
        targetEid = pid;
        break;
      }
    }
    if (targetEid !== null) {
      const targetPiece = world.getComponent(targetEid, "ChessPiece");
      if (targetPiece.color === selPiece.color) {
        world.removeComponent(selEid, "Selected");
        world.addComponent(targetEid, "Selected", {});
        return;
      }
    }
    const board = buildBoardMap(world, "ChessPiece");
    if (!isLegalMove(selPiece, selPos.x, selPos.y, cursorPos.x, cursorPos.y, board, MOVE_RULES, BOARD_GAME_CFG)) {
      return;
    }
    if (selPiece.type === "king" && Math.abs(cursorPos.x - selPos.x) === 2) {
      const dx = cursorPos.x - selPos.x;
      const rookX = dx > 0 ? 7 : 0;
      const rookNewX = dx > 0 ? cursorPos.x - 1 : cursorPos.x + 1;
      for (const pid of allPieces) {
        const ppos = world.getComponent(pid, "Position");
        const pp = world.getComponent(pid, "ChessPiece");
        if (pp.type === "rook" && pp.color === selPiece.color && ppos.x === rookX && ppos.y === selPos.y) {
          ppos.x = rookNewX;
          pp.hasMoved = true;
          break;
        }
      }
    }
    if (targetEid !== null) {
      const targetPiece = world.getComponent(targetEid, "ChessPiece");
      world.emit("pieceCaptured", {
        type: targetPiece.type,
        color: targetPiece.color,
        value: PIECE_VALUES[targetPiece.type] || 1
      });
      world.destroyEntity(targetEid);
      if (targetPiece.type === "king") {
        state.gameOver = true;
        world.emit("checkmate");
      }
    }
    selPos.x = cursorPos.x;
    selPos.y = cursorPos.y;
    selPiece.hasMoved = true;
    world.removeComponent(selEid, "Selected");
    const turns = ["white", "black"];
    const currentIdx = turns.indexOf(state.currentTurn);
    state.currentTurn = turns[(currentIdx + 1) % turns.length];
    state.moveCount = (state.moveCount || 0) + 1;
    world.emit("moveMade", { nextTurn: state.currentTurn });
  } else {
    const allPieces = world.query("Position", "ChessPiece");
    for (const pid of allPieces) {
      const ppos = world.getComponent(pid, "Position");
      const piece = world.getComponent(pid, "ChessPiece");
      if (ppos.x === cursorPos.x && ppos.y === cursorPos.y) {
        if (state.currentTurn && piece.color !== state.currentTurn) continue;
        world.addComponent(pid, "Selected", {});
        break;
      }
    }
  }
}
game.system("scoring", function scoringSystem(world, _dt) {
  const events = world.getEvents("pieceCaptured");
  if (events.length === 0) return;
  const state = world.getResource("state");
  if (!state) return;
  for (const ev of events) {
    const value = ev.data.value || 1;
    const capturingColor = ev.data.color === "white" ? "black" : "white";
    state[`score_${capturingColor}`] = (state[`score_${capturingColor}`] || 0) + value;
    state.score += value;
  }
});
game.system("render", function renderSystem(world, _dt) {
  const renderer = world.getResource("renderer");
  if (!renderer) return;
  const { ctx, cellSize, offsetX, offsetY } = renderer;
  const state = world.getResource("state");
  const W = BOARD_WIDTH * cellSize;
  const H = BOARD_HEIGHT * cellSize;
  clearCanvas(ctx, "#2a1f1a");
  drawBorder(ctx, offsetX, offsetY, W, H);
  drawCheckerboard(ctx, offsetX, offsetY, cellSize, BOARD_WIDTH, BOARD_HEIGHT, "#f0d9b5", "#b58863");
  drawEntitiesAsText(ctx, world, offsetX, offsetY, cellSize, {
    queryComponents: ["Position", "ChessPiece"],
    component: "ChessPiece",
    displayField: "displayChar",
    colorField: "color",
    fontScale: 0.75,
    fontFamily: "serif",
    colorMap: { white: "#fff", black: "#000" }
  });
  drawHighlight(ctx, world, offsetX, offsetY, cellSize, {
    queryComponents: ["Position", "Cursor"],
    color: "#ffff00",
    lineWidth: 3
  });
  drawHighlight(ctx, world, offsetX, offsetY, cellSize, {
    queryComponents: ["Position", "ChessPiece", "Selected"],
    color: "#00ff00",
    lineWidth: 3
  });
  drawHUD(ctx, state, offsetX, W, offsetY, {
    fields: ["currentTurn", "moveCount", "score"],
    fontSize: 18,
    labels: { currentTurn: "Turn", moveCount: "Moves" }
  });
  if (state && state.gameOver) {
    drawGameOver(ctx, offsetX, offsetY, W, H, {
      title: "CHECKMATE!",
      titleColor: "#ff4444",
      subtitle: "Press R to restart"
    });
  }
});
var game_default = game;
export {
  game_default as default
};
