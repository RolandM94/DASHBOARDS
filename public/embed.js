/**
 * Supercoolstuff Dashboard Embed SDK
 *
 * Usage:
 *   <script src="https://supercool-stuff.vercel.app/embed.js"></script>
 *   <div data-sc-dashboard="dashboard-uuid" data-sc-height="600"></div>
 *   <div data-sc-dashboard="another-uuid" data-sc-theme="dark"></div>
 */
(function () {
  "use strict";

  var BASE = "https://supercool-stuff.vercel.app";

  function init() {
    var els = document.querySelectorAll("[data-sc-dashboard]");
    if (!els.length) return;

    els.forEach(function (el) {
      var id = el.getAttribute("data-sc-dashboard");
      if (!id) return;

      var iframe = document.createElement("iframe");
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("allowtransparency", "true");
      iframe.style.border = "none";
      iframe.style.width = "100%";
      iframe.style.overflow = "hidden";

      var height = el.getAttribute("data-sc-height") || "500";
      iframe.style.height = height + "px";

      var src = BASE + "/embed/" + encodeURIComponent(id);
      var filter = el.getAttribute("data-sc-filter");
      if (filter) src += "?" + filter;
      iframe.src = src;

      // Replace the placeholder element with the iframe
      el.parentNode.replaceChild(iframe, el);

      // Listen for resize messages from the iframe
      window.addEventListener("message", function (event) {
        if (event.origin !== BASE) return;
        if (event.data && event.data.type === "resize" && event.data.height) {
          var targetIframes = document.querySelectorAll("iframe[src*='/embed/" + encodeURIComponent(id) + "']");
          targetIframes.forEach(function (f) {
            f.style.height = event.data.height + "px";
          });
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
