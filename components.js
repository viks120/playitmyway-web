/* ==========================================================================
   Play It My Way — shared page furniture
   Linked by game pages AFTER their own script:
     <script src="../../components.js"></script>

   Provides two floating toggles: the site-wide sound button (bottom-right)
   and the full-screen button (top-right, every game — sound or silent).
   Full screen also hides the page furniture — title block, "how to play"
   and the trust footer — so only the game itself is left on screen.
   Pages with audio keep their own audio code and simply bail out early
   while muted:
       function playSound(type) { if (window.pimwMuted) return; ... }

   Nothing is stored: mute and full-screen are both per-page and reset on
   load, deliberately — faking persistence without storage means a state
   that survives some navigations and not others, which is worse than none.
   ========================================================================== */
(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  // ---- sound toggle: only on pages that actually make sound -------------
  function buildSoundBtn() {
    // silent pages set this before including the script, so they get the
    // full-screen button below without a dead sound control alongside it
    if (window.pimwNoSoundToggle) return;
    if (document.getElementById("pimwSoundBtn")) return;

    window.pimwMuted = false;

    var btn = document.createElement("button");
    btn.id = "pimwSoundBtn";
    btn.className = "pimw-sound-btn";
    btn.type = "button";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Sound on. Tap to turn sound off.");
    btn.title = "Sound on";
    btn.innerHTML = '<span aria-hidden="true">🔊</span>';

    btn.addEventListener("click", function () {
      window.pimwMuted = !window.pimwMuted;
      var off = window.pimwMuted;
      btn.innerHTML = '<span aria-hidden="true">' + (off ? "🔇" : "🔊") + "</span>";
      btn.setAttribute("aria-pressed", off ? "true" : "false");
      btn.setAttribute("aria-label", off
        ? "Sound off. Tap to turn sound on."
        : "Sound on. Tap to turn sound off.");
      btn.title = off ? "Sound off" : "Sound on";
      btn.classList.toggle("is-off", off);

      // Some games hold a looping or scheduled node; give them a hook
      // without requiring one.
      if (typeof window.pimwOnMuteChange === "function") {
        try { window.pimwOnMuteChange(off); } catch (e) { /* never break the game */ }
      }
    });

    document.body.appendChild(btn);
  }

  // ---- full-screen toggle: every page this script reaches ---------------
  // Fullscreens the whole page (<html>) rather than the game element alone.
  // Counter-intuitive but necessary: in element fullscreen the browser paints
  // ONLY that element's subtree, so fixed-position controls living on <body>
  // — including this button — would vanish, stranding the player with no
  // visible way out. Fullscreening <html> keeps every control reachable, and
  // components.css then hides the non-game furniture via .pimw-fs, which gets
  // the same "just the game" result without the trap.
  function fsEnabled() {
    var d = document;
    return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled || d.mozFullScreenEnabled || d.msFullscreenEnabled);
  }

  function fsElement() {
    var d = document;
    return d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement || null;
  }

  function requestFs(el) {
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (!fn) return;
    // rejects if the gesture requirement isn't met or the browser refuses;
    // either way there is nothing useful to do but stay as we are
    var p = fn.call(el);
    if (p && p.catch) p.catch(function () {});
  }

  function exitFs() {
    var d = document;
    var fn = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
    if (!fn) return;
    var p = fn.call(d);
    if (p && p.catch) p.catch(function () {});
  }

  function buildFullscreenBtn() {
    if (!fsEnabled()) return;   // unsupported browser, or blocked by context — no dead button
    if (document.getElementById("pimwFsBtn")) return;

    var btn = document.createElement("button");
    btn.id = "pimwFsBtn";
    btn.className = "pimw-fs-btn";
    btn.type = "button";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Play in full screen");
    btn.title = "Full screen";
    btn.innerHTML = '<span aria-hidden="true">⛶</span>';

    function sync() {
      var on = !!fsElement();
      // drives the furniture-hiding rules in components.css. A class, not the
      // :fullscreen pseudo-class: its prefixed forms can't share a selector
      // list (one unknown selector voids the whole rule), and we already know
      // the state here.
      document.documentElement.classList.toggle("pimw-fs", on);
      btn.innerHTML = '<span aria-hidden="true">' + (on ? "✕" : "⛶") + "</span>";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Exit full screen" : "Play in full screen");
      btn.title = on ? "Exit full screen" : "Full screen";
      btn.classList.toggle("is-on", on);
    }

    btn.addEventListener("click", function () {
      if (fsElement()) exitFs();
      else requestFs(document.documentElement);
    });

    // Fires on entry AND exit, including exits the button had no part in —
    // the Esc key, an Android back-gesture, iOS's swipe-down — so the icon
    // never lies about which state the page is actually in.
    ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
      .forEach(function (evt) { document.addEventListener(evt, sync); });

    document.body.appendChild(btn);
  }

  onReady(function () {
    buildSoundBtn();
    buildFullscreenBtn();
  });
})();
