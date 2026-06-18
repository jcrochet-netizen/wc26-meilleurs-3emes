/* ============================================================
   WC26 — Loader « script externe unique » (version FRANCE)
   ------------------------------------------------------------
   Injecte le widget des meilleurs 3èmes DANS la page hôte (DOM
   indexable par Google, contrairement à une iframe).

   Utilisation dans un bloc HTML personnalisé WordPress :
     <div id="wc26-mount"></div>
     <script src="https://jcrochet-netizen.github.io/wc26-meilleurs-3emes/wc26-fr.js"></script>

   Le widget chargé est le fichier français ; il lit data.json en
   direct (auto-update). Pour une autre langue, dupliquer ce
   fichier en changeant WIDGET_URL vers widget-en/es/pt/it.html.
   ============================================================ */
(function () {
  "use strict";
  var WIDGET_URL =
    "https://jcrochet-netizen.github.io/wc26-meilleurs-3emes/widget-meilleurs-3emes-wc2026.html";
  var self = document.currentScript; // capturé au parse (null dans le callback async)

  function run() {
    var mount = document.getElementById("wc26-mount");
    if (!mount) {
      // Pas de div dédié → on en crée un juste après le <script>.
      mount = document.createElement("div");
      mount.id = "wc26-mount";
      if (self && self.parentNode) self.parentNode.insertBefore(mount, self.nextSibling);
      else document.body.appendChild(mount);
    }

    fetch(WIDGET_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        mount.innerHTML = html; // injecte structure + styles (indexable)
        // Les <script> posés via innerHTML ne s'exécutent pas : on les recrée.
        var scripts = mount.querySelectorAll("script");
        for (var i = 0; i < scripts.length; i++) {
          var old = scripts[i];
          var s = document.createElement("script");
          if (old.src) s.src = old.src;
          else s.textContent = old.textContent;
          document.body.appendChild(s);
        }
      })
      .catch(function (e) {
        mount.innerHTML =
          '<p style="font:14px sans-serif;color:#6a7686">Classement temporairement indisponible.</p>';
        if (window.console) console.error("WC26 loader:", e);
      });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", run);
  else run();
})();
