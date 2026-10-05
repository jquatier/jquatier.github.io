---
---
/* jacobquatier.com: the boot and shutdown logs, the control panel, and card navigation.
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

    function finish(elapsedMs) {
      status.innerHTML =
        '<span class="boot-tag">[</span><span class="boot-ok">  OK  </span><span class="boot-tag">]</span> ' +
        'compiled in ' + (elapsedMs / 1000).toFixed(2) + 's';
      setTimeout(function () {
        boot.classList.add('boot-out');
        root.classList.remove('booting');
        try { sessionStorage.setItem('booted', '1'); } catch (e) {}
        setTimeout(function () { boot.remove(); }, 300);
      }, 450);
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

  /* ---- control panel: themes, reboot, shutdown ---- */
  (function () {
    var themes = document.querySelectorAll('.panel-btn[data-theme]');

    function render() {
      var current = root.getAttribute('data-theme');
      themes.forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme') === current));
      });
    }

    /* one theme at a time; clicking the active one goes back to default */
    themes.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-theme');
        var next = root.getAttribute('data-theme') === name ? null : name;
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
      });
    });

    document.querySelector('[data-action="reboot"]').addEventListener('click', reboot);

    /* shutdown: collapse the page like a tube, log the teardown, halt */
    var shutdown = document.querySelector('[data-action="shutdown"]');
    var halt = document.querySelector('.boot.shutdown');

    shutdown.addEventListener('click', function () {
      if (halt.classList.contains('is-open')) return;
      shutdown.blur();
      root.classList.add('powering-off');

      setTimeout(function () {
        halt.classList.add('is-open');
        playLog(halt, function () {
          setTimeout(function () {
            halt.classList.add('is-halted');
            window.addEventListener('keydown', reboot, { once: true });
            halt.addEventListener('pointerdown', reboot, { once: true });
          }, 900);
          setTimeout(function () { halt.classList.add('is-waiting'); }, 3400);
        });
      }, 420);
    });

    render();
  })();

  /* ---- card navigation: arrow keys on every theme, plus the d-pad in game boy mode.
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

    function pad(dir) { return document.querySelector('.dpad-btn[data-dir="' + dir + '"]'); }

    document.addEventListener('keydown', function (e) {
      var dir = DIRS[e.key];
      if (!dir || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      if (root.classList.contains('powering-off')) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      if (move(dir)) {
        e.preventDefault();
        var btn = pad(dir);
        if (btn) btn.classList.add('is-pressed');
      }
    });

    document.addEventListener('keyup', function (e) {
      var dir = DIRS[e.key];
      var btn = dir && pad(dir);
      if (btn) btn.classList.remove('is-pressed');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.dpad-btn'), function (btn) {
      btn.addEventListener('click', function () { move(btn.getAttribute('data-dir')); });
    });
  })();
})();
