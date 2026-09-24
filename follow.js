/* ------------------------------------------------------------------
   The follow moment.

   The site promises "nothing here asks you to sign up" and that has to
   stay true, so this never appears on arrival and never blocks a toy.
   It shows up after someone has already done something, says one line,
   and can be dismissed for good.

   Two places earn it:
   - You left a mark on the shared wall. Shown once, ever.
   - You tapped the locked tile, which is somebody explicitly asking
     what comes next. Shown every time, because they asked.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var HANDLE = "wadesellers";
  var URL = "https://instagram.com/" + HANDLE;
  var SHOWN = "pte.followShown";
  var DISMISSED = "pte.followDismissed";

  function build(line, float) {
    var el = document.createElement("div");
    el.className = "follow" + (float ? " float" : "");
    el.innerHTML =
      '<p class="fline"></p>' +
      '<a class="fgo" target="_blank" rel="noopener"></a>' +
      '<button class="fx" type="button" aria-label="No thanks">&times;</button>';
    el.querySelector(".fline").textContent = line;
    var a = el.querySelector(".fgo");
    a.href = URL;
    a.textContent = "@" + HANDLE;
    el.querySelector(".fx").addEventListener("click", function () {
      // "no thanks" means no thanks, on every future visit too
      window.ARCADE.lsSet(DISMISSED, "1");
      el.remove();
    });
    return el;
  }

  function show(host, line, float) {
    if (!host) return null;
    if (window.ARCADE.lsGet(DISMISSED, "") === "1") return null;
    var old = host.querySelector(".follow");
    if (old) old.remove();
    var el = build(line, float);
    host.appendChild(el);
    return el;
  }

  window.ARCADE.follow = {
    handle: HANDLE,
    url: URL,
    show: show,

    // For the earned-once case: only the first time, ever, on this device.
    showOnce: function (host, line, float) {
      if (window.ARCADE.lsGet(SHOWN, "") === "1") return null;
      var el = show(host, line, float);
      if (el) window.ARCADE.lsSet(SHOWN, "1");
      return el;
    }
  };
})();
