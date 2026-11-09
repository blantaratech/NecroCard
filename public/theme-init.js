(function () {
  var pref = null;
  try { pref = window.localStorage.getItem("necrocard.theme"); } catch (e) { pref = null; }
  if (pref !== "dark" && pref !== "light" && pref !== "system") pref = "dark";
  var resolved = pref;
  if (pref === "system") {
    resolved = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light" : "dark";
  }
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-preference", pref);
})();
