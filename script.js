const body = document.body;
const menuScreen = document.getElementById("menu-screen");
const gameScreen = document.getElementById("game-screen");
const gameCanvas = document.getElementById("game");
const gameCtx = gameCanvas.getContext("2d");
const auxCanvas = document.getElementById("aux-canvas");
const auxCtx = auxCanvas.getContext("2d");

const gameEyebrow = document.getElementById("game-eyebrow");
const gameTitle = document.getElementById("game-title");
const gameDescription = document.getElementById("game-description");
const statLabels = [...document.querySelectorAll(".stat-label")];
const statValues = [...document.querySelectorAll(".stat-value")];
const controlsList = document.getElementById("controls-list");

const restartButton = document.getElementById("restart-button");
const restartLabel = restartButton.querySelector(".button-label");
const restartSubtitle = restartButton.querySelector(".button-subtitle");
const pauseButton = document.getElementById("pause-button");
const soundButton = document.getElementById("sound-button");
const trackButton = document.getElementById("track-button");
const menuButton = document.getElementById("menu-button");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayActionButton = document.getElementById("overlay-action");

const auxTitle = document.getElementById("aux-title");
const auxEyebrow = document.getElementById("aux-eyebrow");
const auxHighlight = document.getElementById("aux-highlight");
const auxDescription = document.getElementById("aux-description");
const gameSelectButtons = [...document.querySelectorAll("[data-game-select]")];

const ui = {
  setHeader({ eyebrow, title, description }) {
    gameEyebrow.textContent = eyebrow;
    gameTitle.textContent = title;
    gameDescription.textContent = description;
    document.title = `${title} | Arcade Select`;
  },
  setStats(stats) {
    statLabels.forEach((labelElement, index) => {
      const stat = stats[index] || { label: "--", value: "--" };
      labelElement.textContent = stat.label;
      statValues[index].textContent = stat.value;
    });
  },
  setControls(items) {
    controlsList.replaceChildren(
      ...items.map((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = item;
        return listItem;
      })
    );
  },
  setButtons({
    restartText = "Jogar novamente",
    restartSubtext = "insert coin",
    pauseText = "Pausar",
    soundText = "Som ligado",
    trackText = "Trilha: Classica",
    showTrack = false,
  }) {
    restartLabel.textContent = restartText;
    restartSubtitle.textContent = restartSubtext;
    pauseButton.textContent = pauseText;
    soundButton.textContent = soundText;
    trackButton.textContent = trackText;
    trackButton.classList.toggle("control-hidden", !showTrack);
  },
  setOverlay({ title = "", text = "", hidden = true, showAction = false, actionText = "Jogar novamente" }) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.toggle("is-hidden", hidden);
    overlayActionButton.textContent = actionText;
    overlayActionButton.classList.toggle("button-hidden", !showAction);
  },
  setAuxPanel({ title, showCanvas, eyebrow, highlight, description }) {
    auxTitle.textContent = title;
    auxCanvas.classList.toggle("control-hidden", !showCanvas);
    auxEyebrow.textContent = eyebrow;
    auxHighlight.textContent = highlight;
    auxDescription.textContent = description;
  },
  setCanvasSize(width, height) {
    gameCanvas.width = width;
    gameCanvas.height = height;
  },
  setAuxCanvasSize(width, height) {
    auxCanvas.width = width;
    auxCanvas.height = height;
  },
  clearAuxCanvas() {
    auxCtx.clearRect(0, 0, auxCanvas.width, auxCanvas.height);
  },
};

let activeGame = null;

function setActiveScreen(view) {
  const showingMenu = view === "menu";
  menuScreen.hidden = !showingMenu;
  gameScreen.hidden = showingMenu;
  menuScreen.classList.toggle("screen-hidden", !showingMenu);
  gameScreen.classList.toggle("screen-hidden", showingMenu);
}

function showMenu() {
  if (activeGame) {
    activeGame.deactivate();
    activeGame = null;
  }

  body.dataset.view = "menu";
  body.dataset.game = "tetris";
  document.title = "Arcade Select";
  setActiveScreen("menu");
}

function selectGame(gameId) {
  const nextGame = games[gameId];
  if (!nextGame) {
    return;
  }

  if (activeGame) {
    activeGame.deactivate();
  }

  activeGame = nextGame;
  body.dataset.view = "game";
  body.dataset.game = gameId;
  setActiveScreen("game");
  activeGame.activate();
}

function createAudioHelpers(storageKeyPrefix) {
  let audioContext = null;
  let audioEnabled = localStorage.getItem(`${storageKeyPrefix}-sound-enabled`) !== "false";

  function ensureAudioContext() {
    if (!audioEnabled) {
      return null;
    }

    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  }

  function playTone({
    type = "square",
    frequency = 440,
    duration = 0.08,
    volume = 0.05,
    slideTo = frequency,
    when = 0,
  }) {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }

    const startTime = context.currentTime + when;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(0.001, slideTo), startTime + duration);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  function toggleSound() {
    audioEnabled = !audioEnabled;
    localStorage.setItem(`${storageKeyPrefix}-sound-enabled`, String(audioEnabled));
    return audioEnabled;
  }

  function getAudioEnabled() {
    return audioEnabled;
  }

  return {
    playTone,
    toggleSound,
    getAudioEnabled,
  };
}

function createTetrisGame() {
  const columns = 10;
  const rows = 20;
  const dropIntervalStart = 700;
  const minDropInterval = 120;
  const lineClearDuration = 180;
  const nextBlockSize = 32;

  const colors = {
    I: "#47c6ff",
    J: "#5b6cff",
    L: "#ff9f43",
    O: "#f4d35e",
    S: "#4cd97b",
    T: "#b576ff",
    Z: "#ff6b81",
  };

  const tetrominoes = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  };

  const musicPatterns = {
    classic: [
      { lead: 659.25, harmony: 783.99, bass: 164.81, duration: 0.12, gap: 170 },
      { lead: 493.88, harmony: 659.25, bass: 123.47, duration: 0.12, gap: 170 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.12, gap: 170 },
      { lead: 587.33, harmony: 698.46, bass: 146.83, duration: 0.12, gap: 170 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.12, gap: 170 },
      { lead: 493.88, harmony: 587.33, bass: 123.47, duration: 0.12, gap: 170 },
      { lead: 440, harmony: 523.25, bass: 110, duration: 0.12, gap: 170 },
      { lead: 440, harmony: 523.25, bass: 110, duration: 0.12, gap: 170 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.12, gap: 170 },
      { lead: 659.25, harmony: 783.99, bass: 164.81, duration: 0.12, gap: 170 },
      { lead: 587.33, harmony: 698.46, bass: 146.83, duration: 0.12, gap: 170 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.12, gap: 170 },
      { lead: 493.88, harmony: 587.33, bass: 123.47, duration: 0.12, gap: 170 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.12, gap: 170 },
      { lead: 587.33, harmony: 698.46, bass: 146.83, duration: 0.12, gap: 170 },
      { lead: 659.25, harmony: 783.99, bass: 164.81, duration: 0.16, gap: 210 },
    ],
    arcade: [
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.1, gap: 150 },
      { lead: 659.25, harmony: 783.99, bass: 164.81, duration: 0.1, gap: 150 },
      { lead: 783.99, harmony: 987.77, bass: 196, duration: 0.1, gap: 150 },
      { lead: 659.25, harmony: 783.99, bass: 164.81, duration: 0.1, gap: 150 },
      { lead: 587.33, harmony: 698.46, bass: 146.83, duration: 0.1, gap: 150 },
      { lead: 659.25, harmony: 783.99, bass: 164.81, duration: 0.1, gap: 150 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.1, gap: 150 },
      { lead: 392, harmony: 523.25, bass: 98, duration: 0.14, gap: 190 },
      { lead: 440, harmony: 554.37, bass: 110, duration: 0.1, gap: 150 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.1, gap: 150 },
      { lead: 659.25, harmony: 783.99, bass: 164.81, duration: 0.1, gap: 150 },
      { lead: 523.25, harmony: 659.25, bass: 130.81, duration: 0.1, gap: 150 },
      { lead: 440, harmony: 554.37, bass: 110, duration: 0.1, gap: 150 },
      { lead: 392, harmony: 493.88, bass: 98, duration: 0.1, gap: 150 },
      { lead: 349.23, harmony: 440, bass: 87.31, duration: 0.1, gap: 150 },
      { lead: 392, harmony: 523.25, bass: 98, duration: 0.16, gap: 210 },
    ],
  };

  const audio = createAudioHelpers("tetris");

  let board;
  let currentPiece;
  let nextPiece;
  let score;
  let linesCleared;
  let level;
  let highScore = Number(localStorage.getItem("tetris-high-score")) || 0;
  let dropInterval;
  let dropAccumulator;
  let lastTime = 0;
  let animationFrameId = null;
  let lineClearTimeoutId = null;
  let musicTimeoutId = null;
  let musicStep = 0;
  let isRunning = false;
  let isPaused = false;
  let gameOver = false;
  let isClearingLines = false;
  let clearingRows = [];
  let clearingSince = 0;
  let selectedTrack = localStorage.getItem("tetris-music-track") || "classic";

  function createBoard() {
    return Array.from({ length: rows }, () => Array(columns).fill(0));
  }

  function updateScoreboard() {
    ui.setStats([
      { label: "Pontos", value: score },
      { label: "Linhas", value: linesCleared },
      { label: "Nivel", value: level },
      { label: "Recorde", value: highScore },
    ]);
  }

  function updateButtons() {
    ui.setButtons({
      restartText: isRunning || isPaused || gameOver ? "Jogar novamente" : "Iniciar partida",
      restartSubtext: isRunning || isPaused || gameOver ? "insert coin" : "press start",
      pauseText: isPaused ? "Continuar" : "Pausar",
      soundText: audio.getAudioEnabled() ? "Som + trilha" : "Som desligado",
      trackText: `Trilha: ${selectedTrack === "classic" ? "Classica" : "Arcade"}`,
      showTrack: true,
    });
  }

  function playSound(effect) {
    switch (effect) {
      case "start":
        audio.playTone({ frequency: 330, slideTo: 392, duration: 0.09, volume: 0.045, when: 0 });
        audio.playTone({ frequency: 392, slideTo: 523, duration: 0.12, volume: 0.04, when: 0.08 });
        break;
      case "move":
        audio.playTone({ frequency: 220, slideTo: 246, duration: 0.05, volume: 0.025 });
        break;
      case "rotate":
        audio.playTone({ frequency: 440, slideTo: 587, duration: 0.07, volume: 0.03 });
        break;
      case "drop":
        audio.playTone({ frequency: 180, slideTo: 80, duration: 0.09, volume: 0.04 });
        break;
      case "lock":
        audio.playTone({ frequency: 140, slideTo: 120, duration: 0.06, volume: 0.03 });
        break;
      case "line":
        audio.playTone({ frequency: 523, slideTo: 659, duration: 0.09, volume: 0.045, when: 0 });
        audio.playTone({ frequency: 659, slideTo: 784, duration: 0.1, volume: 0.04, when: 0.08 });
        break;
      case "pause":
        audio.playTone({ frequency: 392, slideTo: 294, duration: 0.08, volume: 0.035 });
        break;
      case "resume":
        audio.playTone({ frequency: 294, slideTo: 392, duration: 0.08, volume: 0.035 });
        break;
      case "gameOver":
        audio.playTone({ frequency: 220, slideTo: 146, duration: 0.16, volume: 0.045, when: 0 });
        audio.playTone({ frequency: 146, slideTo: 110, duration: 0.22, volume: 0.04, when: 0.14 });
        break;
      default:
        break;
    }
  }

  function stopMusicLoop() {
    if (musicTimeoutId) {
      clearTimeout(musicTimeoutId);
      musicTimeoutId = null;
    }
  }

  function scheduleMusicLoop() {
    if (!audio.getAudioEnabled() || !isRunning || isPaused || gameOver) {
      stopMusicLoop();
      return;
    }

    const pattern = musicPatterns[selectedTrack] || musicPatterns.classic;
    const note = pattern[musicStep % pattern.length];
    const duration = note.duration || 0.14;

    audio.playTone({ type: "square", frequency: note.lead, slideTo: note.lead, duration, volume: 0.022 });
    audio.playTone({
      type: "triangle",
      frequency: note.harmony,
      slideTo: note.harmony,
      duration: Math.max(0.08, duration - 0.03),
      volume: 0.012,
      when: 0.03,
    });
    if (musicStep % 2 === 0) {
      audio.playTone({ type: "triangle", frequency: note.bass, slideTo: note.bass, duration: duration + 0.05, volume: 0.02 });
    }

    musicStep += 1;
    musicTimeoutId = window.setTimeout(scheduleMusicLoop, note.gap || 190);
  }

  function startMusicLoop() {
    stopMusicLoop();
    musicStep = 0;
    scheduleMusicLoop();
  }

  function randomPieceType() {
    const pieces = Object.keys(tetrominoes);
    return pieces[Math.floor(Math.random() * pieces.length)];
  }

  function createPiece(type = randomPieceType()) {
    const shape = tetrominoes[type].map((row) => [...row]);
    return {
      type,
      shape,
      x: Math.floor(columns / 2) - Math.ceil(shape[0].length / 2),
      y: -1,
    };
  }

  function clearTimers() {
    stopMusicLoop();
    if (lineClearTimeoutId) {
      clearTimeout(lineClearTimeoutId);
      lineClearTimeoutId = null;
    }
  }

  function setOverlay(title, text, hidden, showAction = false, actionText = "Jogar novamente") {
    ui.setOverlay({ title, text, hidden, showAction, actionText });
  }

  function drawCell(context, x, y, color, size) {
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size, size);
    context.fillStyle = "rgba(255, 255, 255, 0.15)";
    context.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
    context.strokeStyle = "rgba(0, 0, 0, 0.25)";
    context.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
  }

  function drawBoard() {
    const blockSize = gameCanvas.width / columns;

    gameCtx.fillStyle = "#0f1220";
    gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        if (board[y][x]) {
          drawCell(gameCtx, x, y, board[y][x], blockSize);
        } else {
          gameCtx.strokeStyle = "rgba(255, 255, 255, 0.06)";
          gameCtx.strokeRect(x * blockSize + 0.5, y * blockSize + 0.5, blockSize - 1, blockSize - 1);
        }
      }
    }

    if (isClearingLines && clearingRows.length > 0) {
      const elapsed = performance.now() - clearingSince;
      const pulse = 0.45 + 0.35 * Math.sin(elapsed / 22);
      gameCtx.fillStyle = `rgba(249, 248, 113, ${Math.max(0.18, pulse)})`;

      clearingRows.forEach((rowIndex) => {
        gameCtx.fillRect(0, rowIndex * blockSize, gameCanvas.width, blockSize);
      });
    }
  }

  function drawPiece(piece, context, size, offsetX = 0, offsetY = 0) {
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }

        const drawX = x + offsetX;
        const drawY = y + offsetY;
        if (drawY >= 0) {
          drawCell(context, drawX, drawY, colors[piece.type], size);
        }
      });
    });
  }

  function drawGhostPiece() {
    if (!currentPiece) {
      return;
    }

    const blockSize = gameCanvas.width / columns;
    const ghost = {
      ...currentPiece,
      shape: currentPiece.shape.map((row) => [...row]),
    };

    while (!collides(board, ghost)) {
      ghost.y += 1;
    }
    ghost.y -= 1;

    ghost.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }

        const drawX = (ghost.x + x) * blockSize;
        const drawY = (ghost.y + y) * blockSize;
        if (ghost.y + y >= 0) {
          gameCtx.fillStyle = "rgba(255, 255, 255, 0.16)";
          gameCtx.fillRect(drawX + 4, drawY + 4, blockSize - 8, blockSize - 8);
        }
      });
    });
  }

  function drawNextPiece() {
    auxCtx.fillStyle = "#0f1220";
    auxCtx.fillRect(0, 0, auxCanvas.width, auxCanvas.height);

    const shapeWidth = nextPiece.shape[0].length;
    const shapeHeight = nextPiece.shape.length;
    const offsetX = Math.floor((auxCanvas.width / nextBlockSize - shapeWidth) / 2);
    const offsetY = Math.floor((auxCanvas.height / nextBlockSize - shapeHeight) / 2);

    drawPiece(nextPiece, auxCtx, nextBlockSize, offsetX, offsetY);
  }

  function draw() {
    drawBoard();
    if (currentPiece && !isClearingLines) {
      drawGhostPiece();
      drawPiece(currentPiece, gameCtx, gameCanvas.width / columns, currentPiece.x, currentPiece.y);
    }
    drawNextPiece();
  }

  function collides(grid, piece) {
    return piece.shape.some((row, y) =>
      row.some((value, x) => {
        if (!value) {
          return false;
        }

        const boardX = piece.x + x;
        const boardY = piece.y + y;

        if (boardX < 0 || boardX >= columns || boardY >= rows) {
          return true;
        }

        if (boardY < 0) {
          return false;
        }

        return Boolean(grid[boardY][boardX]);
      })
    );
  }

  function mergePiece() {
    currentPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }

        const boardY = currentPiece.y + y;
        if (boardY >= 0) {
          board[boardY][currentPiece.x + x] = colors[currentPiece.type];
        }
      });
    });
  }

  function getCompletedRows() {
    const completedRows = [];

    for (let y = rows - 1; y >= 0; y -= 1) {
      if (board[y].every(Boolean)) {
        completedRows.push(y);
      }
    }

    return completedRows;
  }

  function clearRows(rowIndexes) {
    const sortedRows = [...rowIndexes].sort((first, second) => second - first);

    sortedRows.forEach((rowIndex) => {
      board.splice(rowIndex, 1);
      board.unshift(Array(columns).fill(0));
    });

    const cleared = sortedRows.length;
    const lineScores = { 1: 100, 2: 300, 3: 500, 4: 800 };

    linesCleared += cleared;
    score += (lineScores[cleared] || 0) * level;
    level = Math.floor(linesCleared / 10) + 1;
    dropInterval = Math.max(minDropInterval, dropIntervalStart - (level - 1) * 55);

    if (score > highScore) {
      highScore = score;
      localStorage.setItem("tetris-high-score", String(highScore));
    }

    updateScoreboard();
  }

  function finishLineClear() {
    lineClearTimeoutId = null;
    clearRows(clearingRows);
    isClearingLines = false;
    clearingRows = [];
    clearingSince = 0;
    spawnNextPiece();
    draw();
  }

  function startLineClear(rowIndexes) {
    isClearingLines = true;
    clearingRows = [...rowIndexes];
    clearingSince = performance.now();
    playSound("line");
    lineClearTimeoutId = window.setTimeout(finishLineClear, lineClearDuration);
  }

  function spawnNextPiece() {
    currentPiece = nextPiece;
    currentPiece.x = Math.floor(columns / 2) - Math.ceil(currentPiece.shape[0].length / 2);
    currentPiece.y = -1;
    nextPiece = createPiece();

    if (collides(board, currentPiece)) {
      endGame();
    }
  }

  function lockPiece() {
    mergePiece();
    playSound("lock");
    currentPiece = null;

    const completedRows = getCompletedRows();
    if (completedRows.length > 0) {
      startLineClear(completedRows);
      return;
    }

    spawnNextPiece();
  }

  function movePiece(offsetX, offsetY) {
    if (!currentPiece) {
      return false;
    }

    currentPiece.x += offsetX;
    currentPiece.y += offsetY;

    if (collides(board, currentPiece)) {
      currentPiece.x -= offsetX;
      currentPiece.y -= offsetY;

      if (offsetY > 0) {
        lockPiece();
      }

      return false;
    }

    return true;
  }

  function rotateMatrix(matrix) {
    return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
  }

  function rotatePiece() {
    if (!currentPiece) {
      return false;
    }

    const rotated = rotateMatrix(currentPiece.shape);
    const previousShape = currentPiece.shape;
    const previousX = currentPiece.x;
    const kickOffsets = [0, -1, 1, -2, 2];

    currentPiece.shape = rotated;

    for (const offset of kickOffsets) {
      currentPiece.x = previousX + offset;
      if (!collides(board, currentPiece)) {
        return true;
      }
    }

    currentPiece.x = previousX;
    currentPiece.shape = previousShape;
    return false;
  }

  function hardDrop() {
    if (!currentPiece || isClearingLines) {
      return;
    }

    while (movePiece(0, 1)) {
      score += 2;
    }
    playSound("drop");

    if (score > highScore) {
      highScore = score;
      localStorage.setItem("tetris-high-score", String(highScore));
    }

    updateScoreboard();
  }

  function softDrop() {
    if (!currentPiece || isClearingLines) {
      return;
    }

    if (movePiece(0, 1)) {
      score += 1;
      playSound("move");
      if (score > highScore) {
        highScore = score;
        localStorage.setItem("tetris-high-score", String(highScore));
      }
      updateScoreboard();
    }
  }

  function endGame() {
    isRunning = false;
    isPaused = false;
    gameOver = true;
    clearTimers();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    updateButtons();
    playSound("gameOver");
    setOverlay("Fim de jogo", "Pressione o botao neon para jogar novamente.", false, true);
    draw();
  }

  function update(time = 0) {
    if (!isRunning) {
      return;
    }

    const delta = time - lastTime;
    lastTime = time;
    dropAccumulator += delta;

    if (!isClearingLines && currentPiece && dropAccumulator >= dropInterval) {
      dropAccumulator = 0;
      movePiece(0, 1);
    }

    draw();
    animationFrameId = requestAnimationFrame(update);
  }

  function startGame() {
    if (isRunning || gameOver) {
      return;
    }

    isRunning = true;
    isPaused = false;
    lastTime = performance.now();
    dropAccumulator = 0;
    updateButtons();
    setOverlay("", "", true);
    playSound("start");
    startMusicLoop();

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(update);
  }

  function reset() {
    clearTimers();
    board = createBoard();
    score = 0;
    linesCleared = 0;
    level = 1;
    dropInterval = dropIntervalStart;
    dropAccumulator = 0;
    lastTime = 0;
    isRunning = false;
    isPaused = false;
    gameOver = false;
    isClearingLines = false;
    clearingRows = [];
    clearingSince = 0;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    currentPiece = createPiece();
    nextPiece = createPiece();
    updateScoreboard();
    updateButtons();
    setOverlay("Pronto para jogar?", "Clique em iniciar ou use uma seta/espaco para comecar.", false, true, "Iniciar partida");
    draw();
  }

  function togglePause() {
    if (gameOver || (!currentPiece && !isClearingLines)) {
      return;
    }

    if (isPaused) {
      isPaused = false;
      isRunning = true;
      lastTime = performance.now();
      dropAccumulator = 0;
      updateButtons();
      setOverlay("", "", true);
      playSound("resume");
      startMusicLoop();
      animationFrameId = requestAnimationFrame(update);
      return;
    }

    isPaused = true;
    isRunning = false;
    stopMusicLoop();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    updateButtons();
    setOverlay("Pausado", "Pressione P ou o botao para continuar.", false);
    playSound("pause");
  }

  function toggleSound() {
    const enabled = audio.toggleSound();
    updateButtons();

    if (enabled) {
      if (isRunning && !isPaused && !gameOver) {
        startMusicLoop();
      }
      audio.playTone({ frequency: 523, slideTo: 659, duration: 0.08, volume: 0.035 });
      return;
    }

    stopMusicLoop();
  }

  function toggleTrack() {
    selectedTrack = selectedTrack === "classic" ? "arcade" : "classic";
    localStorage.setItem("tetris-music-track", selectedTrack);
    updateButtons();

    if (audio.getAudioEnabled() && isRunning && !isPaused && !gameOver) {
      startMusicLoop();
    }

    if (audio.getAudioEnabled()) {
      audio.playTone({
        frequency: selectedTrack === "classic" ? 659.25 : 523.25,
        slideTo: 783.99,
        duration: 0.08,
        volume: 0.03,
      });
    }
  }

  function activate() {
    highScore = Number(localStorage.getItem("tetris-high-score")) || 0;
    selectedTrack = localStorage.getItem("tetris-music-track") || "classic";
    ui.setHeader({
      eyebrow: "Arcade 1989",
      title: "Tetris",
      description: "Empilhe pecas, complete linhas e evite que o tabuleiro chegue ao topo.",
    });
    ui.setControls([
      "Setas esquerda e direita movem a peca",
      "Seta para cima gira a peca",
      "Seta para baixo acelera a descida",
      "Espaco derruba a peca instantaneamente",
      "Tecla P pausa a partida",
      "Esc volta ao menu principal",
    ]);
    ui.setAuxPanel({
      title: "Proxima peca",
      showCanvas: true,
      eyebrow: "Luzes de neon",
      highlight: "Modo retro ativado",
      description: "Planeje a proxima jogada para sobreviver aos niveis mais rapidos.",
    });
    ui.setCanvasSize(320, 640);
    ui.setAuxCanvasSize(160, 160);
    reset();
  }

  function deactivate() {
    isRunning = false;
    isPaused = false;
    clearTimers();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function handleKeydown(event) {
    const key = event.key;

    if (key.toLowerCase() === "p") {
      event.preventDefault();
      togglePause();
      return;
    }

    if (!isRunning && !gameOver && !isPaused) {
      const startKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "];
      if (startKeys.includes(key)) {
        startGame();
      }
    }

    if (gameOver || isPaused || isClearingLines) {
      return;
    }

    switch (key) {
      case "ArrowLeft":
        event.preventDefault();
        if (movePiece(-1, 0)) {
          playSound("move");
        }
        break;
      case "ArrowRight":
        event.preventDefault();
        if (movePiece(1, 0)) {
          playSound("move");
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        softDrop();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (rotatePiece()) {
          playSound("rotate");
        }
        break;
      case " ":
        event.preventDefault();
        hardDrop();
        break;
      default:
        return;
    }

    draw();
  }

  return {
    id: "tetris",
    activate,
    deactivate,
    reset,
    start: startGame,
    togglePause,
    toggleSound,
    toggleTrack,
    handleKeydown,
  };
}

function createSnakeGame() {
  const gridSize = 20;
  const boardSize = 360;
  const cellSize = boardSize / gridSize;
  const audio = createAudioHelpers("snake");

  let snake = [];
  let direction = { x: 1, y: 0 };
  let queuedDirection = { x: 1, y: 0 };
  let food = { x: 0, y: 0 };
  let score = 0;
  let foodsEaten = 0;
  let speedLevel = 1;
  let highScore = Number(localStorage.getItem("snake-high-score")) || 0;
  let stepInterval = 160;
  let accumulator = 0;
  let lastTime = 0;
  let animationFrameId = null;
  let isRunning = false;
  let isPaused = false;
  let gameOver = false;

  function updateScoreboard() {
    ui.setStats([
      { label: "Pontos", value: score },
      { label: "Tamanho", value: snake.length },
      { label: "Velocidade", value: `${speedLevel}x` },
      { label: "Recorde", value: highScore },
    ]);
  }

  function updateButtons() {
    ui.setButtons({
      restartText: isRunning || isPaused || gameOver ? "Nova corrida" : "Iniciar corrida",
      restartSubtext: isRunning || isPaused || gameOver ? "press start" : "go go go",
      pauseText: isPaused ? "Continuar" : "Pausar",
      soundText: audio.getAudioEnabled() ? "Som ligado" : "Som desligado",
      showTrack: false,
    });
  }

  function setOverlay(title, text, hidden, showAction = false, actionText = "Jogar novamente") {
    ui.setOverlay({ title, text, hidden, showAction, actionText });
  }

  function playSound(effect) {
    switch (effect) {
      case "start":
        audio.playTone({ type: "triangle", frequency: 220, slideTo: 330, duration: 0.1, volume: 0.04 });
        audio.playTone({ type: "square", frequency: 330, slideTo: 440, duration: 0.08, volume: 0.03, when: 0.07 });
        break;
      case "turn":
        audio.playTone({ type: "square", frequency: 280, slideTo: 300, duration: 0.04, volume: 0.02 });
        break;
      case "eat":
        audio.playTone({ type: "triangle", frequency: 440, slideTo: 660, duration: 0.08, volume: 0.04 });
        audio.playTone({ type: "square", frequency: 660, slideTo: 880, duration: 0.06, volume: 0.03, when: 0.05 });
        break;
      case "pause":
        audio.playTone({ type: "triangle", frequency: 300, slideTo: 220, duration: 0.07, volume: 0.03 });
        break;
      case "resume":
        audio.playTone({ type: "triangle", frequency: 220, slideTo: 300, duration: 0.07, volume: 0.03 });
        break;
      case "gameOver":
        audio.playTone({ type: "sawtooth", frequency: 200, slideTo: 120, duration: 0.18, volume: 0.04 });
        audio.playTone({ type: "triangle", frequency: 120, slideTo: 80, duration: 0.16, volume: 0.03, when: 0.12 });
        break;
      default:
        break;
    }
  }

  function spawnFood() {
    const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
    const freeCells = [];

    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const key = `${x},${y}`;
        if (!occupied.has(key)) {
          freeCells.push({ x, y });
        }
      }
    }

    food = freeCells[Math.floor(Math.random() * freeCells.length)] || { x: 0, y: 0 };
  }

  function drawGrid() {
    gameCtx.fillStyle = "#07150f";
    gameCtx.fillRect(0, 0, boardSize, boardSize);

    gameCtx.strokeStyle = "rgba(110, 255, 184, 0.08)";
    for (let i = 0; i <= gridSize; i += 1) {
      const offset = i * cellSize + 0.5;
      gameCtx.beginPath();
      gameCtx.moveTo(offset, 0);
      gameCtx.lineTo(offset, boardSize);
      gameCtx.stroke();

      gameCtx.beginPath();
      gameCtx.moveTo(0, offset);
      gameCtx.lineTo(boardSize, offset);
      gameCtx.stroke();
    }
  }

  function drawFood() {
    const centerX = food.x * cellSize + cellSize / 2;
    const centerY = food.y * cellSize + cellSize / 2;
    const radius = cellSize * 0.34;

    const glow = gameCtx.createRadialGradient(centerX, centerY, 2, centerX, centerY, cellSize * 0.55);
    glow.addColorStop(0, "rgba(245, 255, 116, 0.95)");
    glow.addColorStop(1, "rgba(245, 255, 116, 0)");
    gameCtx.fillStyle = glow;
    gameCtx.fillRect(food.x * cellSize - 8, food.y * cellSize - 8, cellSize + 16, cellSize + 16);

    gameCtx.fillStyle = "#f5ff74";
    gameCtx.beginPath();
    gameCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    gameCtx.fill();
  }

  function drawSnake() {
    snake.forEach((segment, index) => {
      const isHead = index === 0;
      const x = segment.x * cellSize;
      const y = segment.y * cellSize;

      gameCtx.fillStyle = isHead ? "#c5ff5f" : "#37d67a";
      gameCtx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

      if (isHead) {
        gameCtx.fillStyle = "#062416";
        const eyeSize = 3;
        const leftEye = { x: x + cellSize * 0.3, y: y + cellSize * 0.3 };
        const rightEye = { x: x + cellSize * 0.6, y: y + cellSize * 0.3 };

        if (direction.y !== 0) {
          leftEye.y = direction.y < 0 ? y + cellSize * 0.3 : y + cellSize * 0.58;
          rightEye.y = leftEye.y;
        } else {
          leftEye.x = direction.x < 0 ? x + cellSize * 0.3 : x + cellSize * 0.58;
          rightEye.x = leftEye.x;
          rightEye.y = y + cellSize * 0.6;
        }

        gameCtx.fillRect(leftEye.x, leftEye.y, eyeSize, eyeSize);
        gameCtx.fillRect(rightEye.x, rightEye.y, eyeSize, eyeSize);
      }
    });
  }

  function draw() {
    drawGrid();
    drawFood();
    drawSnake();
  }

  function stopLoop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function calculateSpeedLevel() {
    speedLevel = 1 + Math.floor(foodsEaten / 3);
    stepInterval = Math.max(70, 160 - speedLevel * 10);
  }

  function endGame() {
    isRunning = false;
    isPaused = false;
    gameOver = true;
    stopLoop();
    playSound("gameOver");
    setOverlay("Fim de jogo", "A cobrinha bateu. Pressione o botao para tentar de novo.", false, true);
    draw();
  }

  function step() {
    direction = { ...queuedDirection };
    const nextHead = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };

    const hitWall =
      nextHead.x < 0 ||
      nextHead.x >= gridSize ||
      nextHead.y < 0 ||
      nextHead.y >= gridSize;

    const hitSelf = snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

    if (hitWall || hitSelf) {
      endGame();
      return;
    }

    snake.unshift(nextHead);

    if (nextHead.x === food.x && nextHead.y === food.y) {
      score += 10;
      foodsEaten += 1;
      calculateSpeedLevel();

      if (score > highScore) {
        highScore = score;
        localStorage.setItem("snake-high-score", String(highScore));
      }

      spawnFood();
      playSound("eat");
    } else {
      snake.pop();
    }

    updateScoreboard();
  }

  function update(time = 0) {
    if (!isRunning) {
      return;
    }

    const delta = time - lastTime;
    lastTime = time;
    accumulator += delta;

    while (accumulator >= stepInterval && isRunning) {
      accumulator -= stepInterval;
      step();
    }

    draw();
    if (isRunning) {
      animationFrameId = requestAnimationFrame(update);
    }
  }

  function startGame() {
    if (isRunning || gameOver) {
      return;
    }

    isRunning = true;
    isPaused = false;
    accumulator = 0;
    lastTime = performance.now();
    updateButtons();
    setOverlay("", "", true);
    playSound("start");
    animationFrameId = requestAnimationFrame(update);
  }

  function reset() {
    stopLoop();
    snake = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
    ];
    direction = { x: 1, y: 0 };
    queuedDirection = { x: 1, y: 0 };
    score = 0;
    foodsEaten = 0;
    speedLevel = 1;
    stepInterval = 160;
    accumulator = 0;
    lastTime = 0;
    isRunning = false;
    isPaused = false;
    gameOver = false;
    spawnFood();
    updateScoreboard();
    updateButtons();
    setOverlay("Pronto para jogar?", "Clique em iniciar ou use uma seta para mover a cobrinha.", false, true, "Iniciar corrida");
    draw();
  }

  function togglePause() {
    if (gameOver || (!isRunning && !isPaused)) {
      return;
    }

    if (isPaused) {
      isPaused = false;
      isRunning = true;
      accumulator = 0;
      lastTime = performance.now();
      updateButtons();
      setOverlay("", "", true);
      playSound("resume");
      animationFrameId = requestAnimationFrame(update);
      return;
    }

    isPaused = true;
    isRunning = false;
    stopLoop();
    updateButtons();
    setOverlay("Pausado", "Pressione P ou o botao para continuar.", false);
    playSound("pause");
  }

  function toggleSound() {
    const enabled = audio.toggleSound();
    updateButtons();

    if (enabled) {
      audio.playTone({ frequency: 520, slideTo: 620, duration: 0.07, volume: 0.03 });
    }
  }

  function toggleTrack() {}

  function queueDirection(nextDirection) {
    const reverseCurrent =
      snake.length > 1 &&
      nextDirection.x === -direction.x &&
      nextDirection.y === -direction.y;

    const reverseQueued =
      snake.length > 1 &&
      nextDirection.x === -queuedDirection.x &&
      nextDirection.y === -queuedDirection.y;

    if (reverseCurrent || reverseQueued) {
      return;
    }

    const changed = queuedDirection.x !== nextDirection.x || queuedDirection.y !== nextDirection.y;
    queuedDirection = nextDirection;

    if (!isRunning && !gameOver && !isPaused) {
      startGame();
      return;
    }

    if (changed) {
      playSound("turn");
    }
  }

  function activate() {
    highScore = Number(localStorage.getItem("snake-high-score")) || 0;
    ui.setHeader({
      eyebrow: "Arcade 1976",
      title: "Cobrinha",
      description: "Cresca, acelere e sobreviva sem bater nas paredes ou no proprio corpo.",
    });
    ui.setControls([
      "Setas mudam a direcao da cobrinha",
      "Nao e permitido dar meia volta instantanea",
      "Cada fruta aumenta sua pontuacao e o ritmo",
      "Tecla P pausa a partida",
      "Esc volta ao menu principal",
    ]);
    ui.setAuxPanel({
      title: "Objetivo",
      showCanvas: false,
      eyebrow: "Modo sobrevivencia",
      highlight: "Cada fruta deixa tudo mais rapido",
      description: "Colete frutas, cresca com controle e use os espacos livres antes que o tabuleiro feche.",
    });
    ui.clearAuxCanvas();
    ui.setCanvasSize(boardSize, boardSize);
    reset();
  }

  function deactivate() {
    isRunning = false;
    isPaused = false;
    stopLoop();
  }

  function handleKeydown(event) {
    const key = event.key;

    if (key.toLowerCase() === "p") {
      event.preventDefault();
      togglePause();
      return;
    }

    if (gameOver) {
      return;
    }

    switch (key) {
      case "ArrowLeft":
        event.preventDefault();
        queueDirection({ x: -1, y: 0 });
        break;
      case "ArrowRight":
        event.preventDefault();
        queueDirection({ x: 1, y: 0 });
        break;
      case "ArrowUp":
        event.preventDefault();
        queueDirection({ x: 0, y: -1 });
        break;
      case "ArrowDown":
        event.preventDefault();
        queueDirection({ x: 0, y: 1 });
        break;
      default:
        break;
    }
  }

  return {
    id: "snake",
    activate,
    deactivate,
    reset,
    start: startGame,
    togglePause,
    toggleSound,
    toggleTrack,
    handleKeydown,
  };
}

const games = {
  tetris: createTetrisGame(),
  snake: createSnakeGame(),
};

restartButton.addEventListener("click", () => {
  activeGame?.reset();
  activeGame?.start?.();
});

pauseButton.addEventListener("click", () => {
  activeGame?.togglePause();
});

soundButton.addEventListener("click", () => {
  activeGame?.toggleSound();
});

trackButton.addEventListener("click", () => {
  activeGame?.toggleTrack();
});

menuButton.addEventListener("click", () => {
  showMenu();
});

overlayActionButton.addEventListener("click", () => {
  activeGame?.reset();
  activeGame?.start?.();
});

gameSelectButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectGame(button.dataset.gameSelect);
  });
});

window.addEventListener("keydown", (event) => {
  if (body.dataset.view === "game" && event.key === "Escape") {
    event.preventDefault();
    showMenu();
    return;
  }

  if (body.dataset.view !== "game" || !activeGame) {
    return;
  }

  activeGame.handleKeydown(event);
});

showMenu();
