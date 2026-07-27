'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
];

const NEON_COLORS = [
  null,
  '#00fff9', // I - cyan neón
  '#faff00', // O - amarillo neón
  '#e100ff', // T - magenta neón
  '#39ff14', // S - verde neón
  '#ff2079', // Z - rosa neón
  '#00aaff', // J - azul neón
  '#ff9100', // L - naranja neón
  '#c0c0ff', // N - lila neón
];

const PASTEL_COLORS = [
  null,
  '#a8e6ef', // I
  '#fff3b0', // O
  '#e0bbe4', // T
  '#c1e8c1', // S
  '#f7c6c7', // Z
  '#bcd8f2', // J
  '#ffdcb0', // L
  '#d8d8e0', // N
];

const PIXEL_COLORS = [
  null,
  '#00b8b0', // I
  '#e6b800', // O
  '#9c3fb0', // T
  '#4a9e4a', // S
  '#c14444', // Z
  '#4a90d9', // J
  '#d97c1f', // L
  '#7a828c', // N
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let board, current, next, hold, holdUsed, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor = '#22222e';
let currentSkin = 'retro';
let initialized = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 8) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  holdUsed = false;
  drawHold();
  spawn();
}

function holdPiece() {
  if (holdUsed) return;
  const type = current.type;
  if (hold === null) {
    hold = type;
    spawn();
  } else {
    const swapped = hold;
    hold = type;
    current = makePiece(swapped);
    if (collide(current.shape, current.x, current.y)) {
      endGame();
    }
  }
  holdUsed = true;
  drawHold();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlockRetro(context, x, y, colorIndex, size, alpha, colors) {
  if (!colorIndex) return;
  const color = colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, colorIndex, size, alpha, colors) {
  if (!colorIndex) return;
  const color = colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = 14;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  context.globalAlpha = 1;
}

function drawBlockPastel(context, x, y, colorIndex, size, alpha, colors) {
  if (!colorIndex) return;
  const color = colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  const r = Math.min(6, s / 4);
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px, py, s, s, r);
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px, py, s, 4);
  context.globalAlpha = 1;
}

function drawBlockPixel(context, x, y, colorIndex, size, alpha, colors) {
  if (!colorIndex) return;
  const color = colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.fillRect(px, py, s, s);
  // textura de pixel art: cuadrícula de píxeles claros/oscuros alternados
  const cell = Math.max(2, Math.floor(size / 5));
  for (let oy = 0; oy < s; oy += cell) {
    for (let ox = 0; ox < s; ox += cell) {
      const light = ((ox / cell) + (oy / cell)) % 2 === 0;
      context.fillStyle = light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      const w = Math.min(cell, s - ox);
      const h = Math.min(cell, s - oy);
      context.fillRect(px + ox, py + oy, w, h);
    }
  }
  context.globalAlpha = 1;
}

const SKINS = {
  retro: { colors: COLORS, draw: drawBlockRetro },
  neon: { colors: NEON_COLORS, draw: drawBlockNeon },
  pastel: { colors: PASTEL_COLORS, draw: drawBlockPastel },
  pixel: { colors: PIXEL_COLORS, draw: drawBlockPixel },
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  const skin = SKINS[currentSkin] || SKINS.retro;
  skin.draw(context, x, y, colorIndex, size, alpha, skin.colors);
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 16;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  const NB = 16;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (hold === null) return;
  const shape = PIECES[hold];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const alpha = holdUsed ? 0.25 : 1;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB, alpha);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  hold = null;
  holdUsed = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  drawHold();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
  initialized = true;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSwitch.checked = theme === 'light';
  gridLineColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
});

function applySkin(skin) {
  currentSkin = SKINS[skin] ? skin : 'retro';
  document.documentElement.setAttribute('data-skin', currentSkin);
  if (skinSelect) skinSelect.value = currentSkin;
  if (initialized) {
    draw();
    drawNext();
    drawHold();
  }
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  localStorage.setItem(SKIN_KEY, currentSkin);
});

initTheme();
initSkin();

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
