/* bricks: the game boy theme's minigame, a brick breaker on the console's own 160×144 screen in its four greens.
   js/site.js loads this the first time the PLAY cartridge on the homepage is opened, then calls jqBricks.start().
   left/right move the paddle and A serves. START pauses, as on the real console; B pauses too, and B again quits.
   SELECT turns the sound off and on. on a keyboard: the arrows, X or space for A, Z or Backspace for B,
   Enter, Escape or P for START, and M for SELECT */
(function () {
  var root = document.documentElement;
  var W = 160, H = 144;
  var TOP = 12;                                   // the play field starts under the score line
  var COLS = 16, BRICK_W = 10, BRICK_H = 5, BRICKS_Y = 22;
  var PADDLE_W = 24, PADDLE_H = 3, PADDLE_Y = 134, PADDLE_SPEED = 120;
  var BALL = 3;

  // the stages, 16 bricks across: 1 takes one hit, 2 takes two. after the last one they come around again, faster
  var STAGES = [
    [
      '...11111..11111.',
      '......1...1...1.',
      '......1...1...1.',
      '......1...1...1.',
      '..1...1...1.1.1.',
      '..1...1...1..11.',
      '...1111...111111'
    ],
    [
      '2222222222222222',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111'
    ],
    [
      '.......22.......',
      '......2112......',
      '.....211112.....',
      '....21111112....',
      '...2111111112...',
      '....21111112....',
      '.....211112.....',
      '......2112......',
      '.......22.......'
    ]
  ];

  var KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    x: 'a', X: 'a', ' ': 'a', z: 'b', Z: 'b', Backspace: 'b',
    Enter: 'start', Escape: 'start', p: 'start', P: 'start', m: 'select', M: 'select'
  };

  var canvas = null, ctx, card, colors, raf = 0, last = 0, clock = 0;
  var mode, resumeTo, timer;   // mode: title, serve, play, pause, clear, over
  var stage = 0, score = 0, lives, hi = 0, record = false, bricks, paddle, ball, speed;
  var held = { left: false, right: false };
  var pointers = {};           // pointer id → the control it's holding down
  var swallow = false;         // a console press the game handled: keep its click from reaching the site
  var audio = null, muted = false;
  var glyphs = {};             // rendered text, by size, color and string

  try {
    hi = parseInt(localStorage.getItem('bricks-hi'), 10) || 0;
    muted = localStorage.getItem('bricks-sound') === 'off';
  } catch (e) {}

  function start(el) {
    if (canvas) return;
    card = el;
    colors = [0, 1, 2, 3].map(function (i) { return getComputedStyle(root).getPropertyValue('--gb-' + i).trim(); });

    canvas = document.createElement('canvas');
    canvas.className = 'gb-game-screen';
    canvas.width = W;
    canvas.height = H;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Bricks, a brick breaker game. Left and right move the paddle, A serves, B quits.');
    ctx = canvas.getContext('2d');

    var lcd = document.querySelector('.body-wrapper');
    lcd.after(canvas);
    lcd.inert = true;
    root.classList.add('gb-game');

    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
    } catch (e) {}

    mode = 'title';
    clock = 0;
    var go = function () {
      if (!canvas) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    if (document.fonts) document.fonts.load('8px "Press Start 2P"').then(go, go); else go();
  }

  function quit() {
    if (!canvas) return;
    cancelAnimationFrame(raf);
    save();
    canvas.remove();
    canvas = null;
    held.left = held.right = false;
    pointers = {};
    Array.prototype.forEach.call(document.querySelectorAll('.console .is-pressed'), function (el) {
      el.classList.remove('is-pressed');
    });
    document.querySelector('.body-wrapper').inert = false;
    root.classList.remove('gb-game');
    if (root.getAttribute('data-theme') === 'gameboy' && card) {
      card.classList.add('is-selected');
      card.focus({ preventScroll: true });
    }
  }

  function save() {
    if (score <= hi) return;
    hi = score;
    record = true;
    try { localStorage.setItem('bricks-hi', String(hi)); } catch (e) {}
  }

  // ---- the game ----

  function newGame() {
    stage = 0;
    score = 0;
    lives = 3;
    record = false;
    loadStage();
    beep(1047, 80);
  }

  function loadStage() {
    bricks = [];
    STAGES[stage % STAGES.length].forEach(function (row, r) {
      for (var c = 0; c < COLS; c++) {
        var hp = parseInt(row[c], 10);
        if (hp) bricks.push({ x: c * BRICK_W, y: BRICKS_Y + r * BRICK_H, hp: hp, max: hp });
      }
    });
    paddle = (W - PADDLE_W) / 2;
    speed = Math.min(72 + 8 * stage, 140);
    ball = { x: 0, y: 0, vx: 0, vy: 0 };
    mode = 'serve';
  }

  function serve() {
    var a = (Math.PI / 180) * (20 + Math.random() * 20) * (Math.random() < 0.5 ? -1 : 1);
    ball.vx = speed * Math.sin(a);
    ball.vy = -speed * Math.cos(a);
    mode = 'play';
  }

  function update(dt) {
    var dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    if (mode === 'serve' || mode === 'play') {
      paddle = Math.max(0, Math.min(W - PADDLE_W, paddle + dir * PADDLE_SPEED * dt));
    }
    if (mode === 'serve') {
      ball.x = paddle + (PADDLE_W - BALL) / 2;
      ball.y = PADDLE_Y - BALL;
    }
    if (mode === 'play') {
      // a pixel at most per step, so the ball can't pass through a brick between frames
      var steps = Math.ceil(speed * dt);
      for (var i = 0; i < steps && mode === 'play'; i++) step(dt / steps);
    }
    if (mode === 'clear' && (timer -= dt) <= 0) {
      stage++;
      loadStage();
    }
  }

  // across, then down: whichever move runs into something turns back on that axis
  function step(h) {
    ball.x += ball.vx * h;
    if (ball.x < 0 || ball.x > W - BALL) {
      ball.x = Math.max(0, Math.min(W - BALL, ball.x));
      ball.vx = -ball.vx;
      beep(200, 20);
    } else if (hit()) {
      ball.x -= ball.vx * h;
      ball.vx = -ball.vx;
    }

    ball.y += ball.vy * h;
    if (ball.y < TOP) {
      ball.y = TOP;
      ball.vy = Math.abs(ball.vy);
      beep(200, 20);
    } else if (ball.vy > 0 && ball.y + BALL >= PADDLE_Y && ball.y + BALL <= PADDLE_Y + PADDLE_H &&
               ball.x + BALL > paddle && ball.x < paddle + PADDLE_W) {
      bounce();
    } else if (hit()) {
      ball.y -= ball.vy * h;
      ball.vy = -ball.vy;
    } else if (ball.y > H) {
      miss();
    }
  }

  // where the ball lands on the paddle sets its angle: nearly straight up in the middle, 60° off at the ends
  function bounce() {
    var t = (ball.x + BALL / 2 - (paddle + PADDLE_W / 2)) / (PADDLE_W / 2 + 1);
    var a = Math.max(-1, Math.min(1, t)) * Math.PI / 3;
    if (Math.abs(a) < 0.15) a = a < 0 ? -0.15 : 0.15;
    ball.vx = speed * Math.sin(a);
    ball.vy = -speed * Math.cos(a);
    ball.y = PADDLE_Y - BALL;
    beep(400, 40);
  }

  function hit() {
    var struck = false;
    for (var i = bricks.length - 1; i >= 0; i--) {
      var b = bricks[i];
      if (ball.x < b.x + BRICK_W - 1 && ball.x + BALL > b.x && ball.y < b.y + BRICK_H - 1 && ball.y + BALL > b.y) {
        struck = true;
        if (--b.hp === 0) {
          bricks.splice(i, 1);
          score += 10 * b.max;
        }
      }
    }
    if (!struck) return false;

    // each hit speeds the ball up a little
    var k = Math.min(speed + 0.6, 150) / speed;
    speed *= k;
    ball.vx *= k;
    ball.vy *= k;
    beep(800, 40);

    if (!bricks.length) {
      mode = 'clear';
      timer = 1.8;
      [523, 659, 784, 1047].forEach(function (f, n) { beep(f, 90, 0, n * 100); });
    }
    return true;
  }

  function miss() {
    lives--;
    beep(300, 400, 80);
    if (lives > 0) {
      mode = 'serve';
    } else {
      mode = 'over';
      save();
    }
  }

  // ---- input ----

  function press(name) {
    if (name === 'select') {
      muted = !muted;
      try { localStorage.setItem('bricks-sound', muted ? 'off' : 'on'); } catch (e) {}
      return beep(660, 60);
    }
    switch (mode) {
      case 'title':
      case 'over':
        if (name === 'a' || name === 'start') newGame();
        else if (name === 'b') quit();
        break;
      case 'serve':
      case 'play':
      case 'clear':
        if (name === 'a' && mode === 'serve') serve();
        else if (name === 'start' || name === 'b') { resumeTo = mode; mode = 'pause'; }
        break;
      case 'pause':
        if (name === 'a' || name === 'start') mode = resumeTo;
        else if (name === 'b') quit();
        break;
    }
  }

  function down(name, repeat) {
    if (name === 'left' || name === 'right') held[name] = true;
    else if (!repeat && name !== 'up' && name !== 'down') press(name);
  }

  function up(name) {
    if (name === 'left' || name === 'right') held[name] = false;
  }

  function control(name) {
    if (held.hasOwnProperty(name) || name === 'up' || name === 'down') return document.querySelector('.dpad-btn[data-dir="' + name + '"]');
    if (name === 'a' || name === 'b') return document.querySelector('.gb-btn[data-btn="' + name + '"]');
    return document.querySelector('.gb-pill[data-action="' + (name === 'start' ? 'shutdown' : 'reboot') + '"]');
  }

  function controlAt(target) {
    var el = target && target.closest && target.closest('.dpad-btn, .gb-btn, .gb-pill');
    if (!el) return null;
    return el.getAttribute('data-dir') || el.getAttribute('data-btn') ||
      (el.getAttribute('data-action') === 'shutdown' ? 'start' : 'select');
  }

  // the game listens first (capture, on window) and keeps the keys and console presses it uses from reaching
  // the site's card navigation, reboot and power
  window.addEventListener('keydown', function (e) {
    if (!canvas || e.altKey || e.ctrlKey || e.metaKey) return;
    var name = KEYS[e.key];
    if (!name) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    control(name).classList.add('is-pressed');
    down(name, e.repeat);
  }, true);

  window.addEventListener('keyup', function (e) {
    var name = KEYS[e.key];
    if (!name || !canvas) return;
    e.stopImmediatePropagation();
    control(name).classList.remove('is-pressed');
    up(name);
  }, true);

  window.addEventListener('pointerdown', function (e) {
    var name = canvas && controlAt(e.target);
    if (!name) return;
    swallow = true;
    pointers[e.pointerId] = name;
    down(name, false);
  }, true);

  function lift(e) {
    var name = pointers[e.pointerId];
    if (!name) return;
    delete pointers[e.pointerId];
    up(name);
  }

  window.addEventListener('pointerup', lift, true);
  window.addEventListener('pointercancel', lift, true);

  // including the click that ends the press that quit the game
  window.addEventListener('click', function (e) {
    if ((canvas || swallow) && controlAt(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    swallow = false;
  }, true);

  // a long press on the d-pad would otherwise open the context menu on some phones
  window.addEventListener('contextmenu', function (e) {
    if (canvas && controlAt(e.target)) e.preventDefault();
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (canvas && document.hidden && (mode === 'serve' || mode === 'play')) press('start');
  });

  // ---- the loop and the screen ----

  function frame(now) {
    if (!canvas) return;
    // the theme changed or the power went off mid-game
    if (root.getAttribute('data-theme') !== 'gameboy' || root.classList.contains('powering-off')) return quit();
    var dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    clock += dt;
    if (mode !== 'pause') update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function draw() {
    var ink = colors[0], mid = colors[1];
    ctx.clearRect(0, 0, W, H);

    if (mode === 'title') return drawTitle();

    text(digits(score), 2, 2, ink);
    text('ST' + (stage + 1), W / 2, 2, ink, 8, 'center');
    ctx.fillStyle = ink;
    for (var i = 0; i < lives - 1; i++) ctx.fillRect(W - 6 - i * 6, 4, 4, 4);
    ctx.fillStyle = mid;
    ctx.fillRect(0, TOP - 2, W, 1);

    bricks.forEach(function (b) {
      ctx.fillStyle = b.hp > 1 ? ink : mid;
      ctx.fillRect(b.x, b.y, BRICK_W - 1, BRICK_H - 1);
    });

    ctx.fillStyle = ink;
    ctx.fillRect(Math.round(paddle), PADDLE_Y, PADDLE_W, PADDLE_H);
    if (mode !== 'over') ctx.fillRect(Math.round(ball.x), Math.round(ball.y), BALL, BALL);

    if (mode === 'serve' && blinkOn()) text('PRESS A', W / 2, 112, ink, 8, 'center');
    if (mode === 'clear') box(['STAGE ' + (stage + 1), 'CLEAR!']);
    if (mode === 'pause') box(['PAUSE', '', 'A  RESUME', 'B  QUIT', 'SEL SOUND ' + (muted ? 'OFF' : 'ON')]);
    if (mode === 'over') box(['GAME OVER', '', digits(score), record ? 'NEW HI!' : 'HI ' + digits(hi), '', 'A  AGAIN', 'B  QUIT']);
  }

  function drawTitle() {
    var ink = colors[0], mid = colors[1];
    for (var c = 0; c < COLS; c++) {
      ctx.fillStyle = c % 2 ? ink : mid;
      ctx.fillRect(c * BRICK_W, 16, BRICK_W - 1, BRICK_H - 1);
      ctx.fillStyle = c % 2 ? mid : ink;
      ctx.fillRect(c * BRICK_W, 21, BRICK_W - 1, BRICK_H - 1);
    }
    text('BRICKS', W / 2, 42, ink, 16, 'center');
    ctx.fillStyle = ink;
    ctx.fillRect(68, 82, PADDLE_W, PADDLE_H);
    ctx.fillRect(84, 74, BALL, BALL);
    if (blinkOn()) text('PRESS A', W / 2, 98, ink, 8, 'center');
    text('HI ' + digits(hi), W / 2, 116, mid, 8, 'center');
    text('B  BACK', W / 2, 130, mid, 8, 'center');
  }

  // a message box in the middle of the screen, one line of text per entry
  function box(lines) {
    var h = lines.length * 11 + 9, y = Math.round((H - h) / 2);
    ctx.fillStyle = colors[0];
    ctx.fillRect(14, y, W - 28, h);
    ctx.fillStyle = colors[3];
    ctx.fillRect(16, y + 2, W - 32, h - 4);
    lines.forEach(function (line, n) {
      if (line) text(line, W / 2, y + 6 + n * 11, colors[0], 8, 'center');
    });
  }

  function blinkOn() {
    return Math.floor(clock * 2) % 2 === 0;
  }

  function digits(n) {
    return ('00000' + n).slice(-5);
  }

  // the font comes out antialiased on a canvas; each pixel is snapped on or off so the text keeps to the four shades
  function text(str, x, y, color, size, align) {
    size = size || 8;
    var key = size + color + str;
    var img = glyphs[key];
    if (!img) {
      img = document.createElement('canvas');
      var g = img.getContext('2d');
      var font = size + 'px "Press Start 2P", monospace';
      g.font = font;
      img.width = Math.max(1, Math.ceil(g.measureText(str).width));
      img.height = size;
      g.font = font;
      g.textBaseline = 'top';
      g.fillStyle = color;
      g.fillText(str, 0, 0);
      var data = g.getImageData(0, 0, img.width, img.height);
      for (var i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i] > 100 ? 255 : 0;
      g.putImageData(data, 0, 0);
      glyphs[key] = img;
    }
    var left = align === 'center' ? Math.round(x - img.width / 2) : align === 'right' ? x - img.width : x;
    ctx.drawImage(img, left, y);
  }

  // ---- sound: one square-wave blip at a time, quiet, like the console's first channel ----

  function beep(freq, ms, slideTo, delayMs) {
    if (!audio || muted) return;
    var t = audio.currentTime + (delayMs || 0) / 1000, end = t + ms / 1000;
    var osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, end);
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(end);
  }

  window.jqBricks = { start: start };
})();
