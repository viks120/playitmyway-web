/* ==========================================================================
   Play It My Way — shared page furniture
   Linked by game pages AFTER their own script:
     <script src="../../components.js"></script>

   Provides the site-wide sound toggle. Pages keep their own audio code and
   simply bail out early while muted:
       function playSound(type) { if (window.pimwMuted) return; ... }

   Nothing is stored: mute is per-page and resets on load, deliberately —
   faking persistence without storage means a state that survives some
   navigations and not others, which is worse than none.
   ========================================================================== */
(function () {
  "use strict";

  // Pages without audio never call this file, but guard anyway so a stray
  // include can't put a dead control on a silent page.
  if (window.pimwNoSoundToggle) return;

  window.pimwMuted = false;

  function build() {
    if (document.getElementById("pimwSoundBtn")) return;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
