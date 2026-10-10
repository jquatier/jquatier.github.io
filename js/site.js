---
---
/* jacobquatier.com: the boot and shutdown logs, the status bar, and card navigation.
   two small inline scripts stay in the page because they have to run before first paint:
   the saved theme in _includes/head.html and the `booting` flag at the top of index.html */
(function () {
  var root = document.documentElement;

  console.log(
    '%c$ whoami%c\njacob quatier · software engineer · portland, or\n\n' +
    'inspecting the site? nice. say hi: jacobquatier@gmail.com\nsource: https://github.com/jquatier/jquatier.github.io',
    'color:#5EEAD4;font-family:monospace;font-size:14px;font-weight:bold',
    'color:#8B93A7;font-family:monospace;font-size:12px'
  );

  /* reveal each .boot-line after its data-delay, stamped with a kernel-style uptime; done() runs after the last */
  function playLog(box, done) {
    var lines = box.querySelectorAll('.boot-line');
    var t0 = performance.now();
    var at = 0;
    lines.forEach(function (line, i) {
      at += Number(line.getAttribute('data-delay'));
      setTimeout(function () {
        var s = ((performance.now() - t0) / 1000 + Math.random() * 0.0009).toFixed(6);
        line.querySelector('.boot-ts').textContent = '[' + new Array(13 - s.length).join(' ') + s + ']';
        line.classList.add('is-on');
        if (i === lines.length - 1) done();
      }, at);
    });
  }

  function reboot() {
    try { sessionStorage.removeItem('booted'); } catch (e) {}
    location.href = '{{ site.baseurl }}/';
  }

  /* ---- latest-post pill (homepage): drop it once the post is 60 days old. the build leaves it out
     past then too, but the site only rebuilds on a push ---- */
  (function () {
    var pill = document.querySelector('.latest-post');
    if (pill && Date.now() / 1000 > Number(pill.getAttribute('data-expires'))) pill.remove();
  })();

  /* ---- boot sequence (homepage, once per session) ---- */
  (function () {
    var boot = document.querySelector('.boot:not(.shutdown)');
    if (!root.classList.contains('booting') || !boot) return;

    var status = boot.querySelector('.boot-status');
    var bar = boot.querySelector('.boot-bar');
    var pct = boot.querySelector('.boot-pct');
    var cells = 24;
    var raceMs = 620;   // 0 -> 87%
    var hangMs = 320;   // stall

    function draw(p) {
      var n = Math.round(p * cells);
      bar.textContent = new Array(n + 1).join('█') + new Array(cells - n + 1).join('░');
      pct.textContent = Math.round(p * 100) + '%';
    }

    function out() {
      boot.classList.add('boot-out');
      root.classList.remove('booting');
      try { sessionStorage.setItem('booted', '1'); } catch (e) {}
      setTimeout(function () { boot.remove(); }, 300);
    }

    function finish(elapsedMs) {
      status.innerHTML =
        '<span class="boot-tag">[</span><span class="boot-ok">  OK  </span><span class="boot-tag">]</span> ' +
        'compiled in ' + (elapsedMs / 1000).toFixed(2) + 's';
      setTimeout(out, 450);
    }

    // game boy: no log, just a moment of blank screen, the logo scrolling down to the center, a beat, then the game
    function gameboy() {
      var logo = boot.querySelector('.boot-logo');
      var done = false;
      function end() {
        if (done) return;
        done = true;
        out();
      }
      logo.addEventListener('animationend', function () { setTimeout(end, 900); }, { once: true });
      setTimeout(function () { logo.classList.add('is-on'); }, 300);
      // if the scroll never finishes (the theme changed mid-boot), don't leave the screen stuck on the logo
      setTimeout(end, 5000);
    }

    function race(start) {
      return function (now) {
        var t = Math.min((now - start) / raceMs, 1);
        draw(0.87 * (1 - Math.pow(1 - t, 2)));
        if (t < 1) return requestAnimationFrame(race(start));
        setTimeout(function () {
          draw(1);
          finish(performance.now() - start);
        }, hangMs);
      };
    }

    function start() {
      if (root.getAttribute('data-theme') === 'gameboy') return gameboy();
      playLog(boot, function () {
        requestAnimationFrame(function (now) { race(now)(now); });
      });
    }

    // background tabs throttle timers to ~1s ticks, which batches the first lines together;
    // hold the timeline until the tab is actually on screen
    if (document.visibilityState === 'visible' && !document.prerendering) {
      start();
    } else {
      var onVisible = function () {
        if (document.visibilityState !== 'visible' || document.prerendering) return;
        document.removeEventListener('visibilitychange', onVisible);
        document.removeEventListener('prerenderingchange', onVisible);
        start();
      };
      document.addEventListener('visibilitychange', onVisible);
      document.addEventListener('prerenderingchange', onVisible);
    }
  })();

  /* ---- status bar: themes, reboot, shutdown, the clock ---- */
  (function () {
    var DEFAULT = 'midnight';
    var bar = document.querySelector('.statusbar');
    var themes = bar.querySelectorAll('.panel-btn[data-theme]');
    var menu = bar.querySelector('.sb-menu');
    var menuName = bar.querySelector('.sb-menu-name');

    function render() {
      var current = root.getAttribute('data-theme') || DEFAULT;
      themes.forEach(function (btn) {
        var on = btn.getAttribute('data-theme') === current;
        btn.setAttribute('aria-pressed', String(on));
        if (on) menuName.textContent = btn.querySelector('.sb-name').textContent;
      });
    }

    /* phone: the themes fold into one menu that opens above the bar */
    function setOpen(open) {
      bar.classList.toggle('is-open', open);
      menu.setAttribute('aria-expanded', String(open));
    }

    menu.addEventListener('click', function () {
      setOpen(!bar.classList.contains('is-open'));
    });

    document.addEventListener('click', function (e) {
      if (!bar.contains(e.target)) setOpen(false);
    });

    // close it once focus moves on to anything that isn't the menu or its themes
    document.addEventListener('focusin', function (e) {
      if (e.target !== menu && !e.target.closest('.sb-themes')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bar.classList.contains('is-open')) {
        setOpen(false);
        menu.focus();
      }
    });

    /* one theme at a time; clicking the active one goes back to default */
    themes.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-theme');
        var next = name === DEFAULT || root.getAttribute('data-theme') === name ? null : name;
        // picked from the open menu: the list is about to hide, so hand focus back to the menu button
        if (bar.classList.contains('is-open')) {
          setOpen(false);
          menu.focus();
        }
        if (next) root.setAttribute('data-theme', next); else root.removeAttribute('data-theme');
        if (next && window.themeFont) window.themeFont(next);
        try {
          if (next) localStorage.setItem('theme', next); else localStorage.removeItem('theme');
        } catch (e) {}
        if (next === 'apple2') {
          root.classList.add('crt-power');
          setTimeout(function () { root.classList.remove('crt-power'); }, 600);
        }
        render();
        fit();
      });
    });

    /* the era themes set wider type than the default, so the full bar can outgrow a tablet-width window
       as well as a phone; whenever it doesn't fit, fold it into the compact layout */
    function fit() {
      bar.classList.remove('is-compact');
      if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add('is-compact');
      // back to the full bar: drop the menu's open state so it doesn't reappear on the next fold
      if (getComputedStyle(menu).display === 'none') setOpen(false);
    }

    if (window.ResizeObserver) new ResizeObserver(fit).observe(bar);
    else window.addEventListener('resize', fit);
    if (document.fonts) document.fonts.addEventListener('loadingdone', fit);

    /* the bar and the game boy's SELECT/START both carry these */
    function each(action, fn) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-action="' + action + '"]'), function (btn) {
        btn.addEventListener('click', fn);
      });
    }

    each('reboot', reboot);

    /* shutdown: collapse the page like a tube, log the teardown, halt */
    var halt = document.querySelector('.boot.shutdown');

    function halted() {
      halt.classList.add('is-halted');
      window.addEventListener('keydown', reboot, { once: true });
      halt.addEventListener('pointerdown', reboot, { once: true });
      setTimeout(function () { halt.classList.add('is-waiting'); }, 2500);
    }

    each('shutdown', function () {
      if (halt.classList.contains('is-open')) return;
      this.blur();
      root.classList.add('powering-off');

      // game boy: it's a power switch. the picture drops out and the screen goes unlit, no teardown log
      if (root.getAttribute('data-theme') === 'gameboy') {
        setTimeout(function () {
          halt.classList.add('is-open');
          halted();
        }, 200);
        return;
      }

      setTimeout(function () {
        halt.classList.add('is-open');
        playLog(halt, function () { setTimeout(halted, 900); });
      }, 420);
    });

    render();

    /* the time in portland, 24h, ticked over on the minute */
    var clock = bar.querySelector('.sb-time');
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      });
    } catch (e) { return; }

    function tick() {
      var now = new Date();
      clock.textContent = fmt.format(now);
      setTimeout(tick, 60000 - (now.getTime() % 60000) + 50);
    }
    tick();
  })();

  /* ---- card navigation: arrow keys on every theme, plus the d-pad and A/B in game boy mode.
     the selection is the focused card; .is-selected mirrors :focus-visible so a d-pad tap (which
     browsers don't count as keyboard focus) still draws the highlight ---- */
  (function () {
    var SELECTOR = '[data-nav-card]';
    var DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    var last = null;

    function cards() {
      return Array.prototype.filter.call(document.querySelectorAll(SELECTOR), function (el) {
        return el.getClientRects().length > 0;
      });
    }

    function center(r) { return r.left + r.width / 2; }

    function select(el) {
      Array.prototype.forEach.call(document.querySelectorAll('.is-selected'), function (n) {
        if (n !== el) n.classList.remove('is-selected');
      });
      el.classList.add('is-selected');
      last = el;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    /* up/down pick the card in the neighbouring row whose centre is closest; left/right walk reading
       order. both wrap, like a menu */
    function move(dir) {
      var list = cards();
      if (!list.length) return false;

      var cur = list.indexOf(document.activeElement);
      if (cur < 0) cur = list.indexOf(last);
      if (cur < 0) {
        select(list[dir === 'up' || dir === 'left' ? list.length - 1 : 0]);
        return true;
      }
      if (dir === 'left' || dir === 'right') {
        select(list[(cur + (dir === 'right' ? 1 : -1) + list.length) % list.length]);
        return true;
      }

      var rects = list.map(function (el) { return el.getBoundingClientRect(); });
      var rows = [];
      rects.forEach(function (r, i) {
        for (var k = 0; k < rows.length; k++) {
          if (Math.abs(rects[rows[k][0]].top - r.top) < 4) { rows[k].push(i); return; }
        }
        rows.push([i]);
      });
      rows.sort(function (a, b) { return rects[a[0]].top - rects[b[0]].top; });

      var ri = -1;
      rows.forEach(function (row, k) { if (row.indexOf(cur) >= 0) ri = k; });
      var target = rows[(ri + (dir === 'down' ? 1 : -1) + rows.length) % rows.length];
      var cx = center(rects[cur]);
      var best = target[0];
      target.forEach(function (i) {
        if (Math.abs(center(rects[i]) - cx) < Math.abs(center(rects[best]) - cx)) best = i;
      });
      select(list[best]);
      return true;
    }

    /* the highlight follows focus: once focus leaves a card, drop it */
    document.addEventListener('focusout', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('is-selected')) {
        e.target.classList.remove('is-selected');
      }
    });

    /* A: open the selected card (or pick the first one if nothing is selected yet) */
    function a() {
      var list = cards();
      var el = list.indexOf(document.activeElement) >= 0 ? document.activeElement : list.indexOf(last) >= 0 ? last : null;
      if (el) el.click(); else move('right');
    }

    /* B: back a page while it stays on this site, otherwise home */
    function b() {
      var home = '{{ site.baseurl }}/';
      var ref = null;
      try { ref = document.referrer && new URL(document.referrer); } catch (e) {}
      if (ref && ref.origin === location.origin && history.length > 1) history.back();
      else if (location.pathname !== home) location.href = home;
    }

    /* in game boy mode the keyboard reaches A and B too: x/Enter is A, z/Backspace is B */
    var KEYS = { x: 'a', X: 'a', Enter: 'a', z: 'b', Z: 'b', Backspace: 'b' };
    var ACTIONS = { a: a, b: b };

    function pad(dir) { return document.querySelector('.dpad-btn[data-dir="' + dir + '"]'); }
    function face(name) { return document.querySelector('.gb-btn[data-btn="' + name + '"]'); }

    function typing(t) {
      return t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    }

    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      if (root.classList.contains('powering-off') || typing(e.target)) return;
      var dir = DIRS[e.key];
      if (dir) {
        if (move(dir)) {
          e.preventDefault();
          var btn = pad(dir);
          if (btn) btn.classList.add('is-pressed');
        }
        return;
      }

      var name = root.getAttribute('data-theme') === 'gameboy' && KEYS[e.key];
      // Enter on a link or button already does the right thing
      if (!name || (e.key === 'Enter' && e.target.closest && e.target.closest('a, button'))) return;
      e.preventDefault();
      face(name).classList.add('is-pressed');
      if (!e.repeat) ACTIONS[name]();
    });

    document.addEventListener('keyup', function (e) {
      var dir = DIRS[e.key];
      var btn = dir ? pad(dir) : KEYS[e.key] && face(KEYS[e.key]);
      if (btn) btn.classList.remove('is-pressed');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.dpad-btn'), function (btn) {
      btn.addEventListener('click', function () { move(btn.getAttribute('data-dir')); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.gb-btn'), function (btn) {
      btn.addEventListener('click', function () { ACTIONS[btn.getAttribute('data-btn')](); });
    });
  })();
})();
