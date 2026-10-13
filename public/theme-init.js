// Apply the saved theme before first paint to avoid a flash of the wrong colors.
(function () {
  try {
    var t = localStorage.getItem('fw-theme');
    var dark = t === 'dark' || ((!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    /* storage blocked: follow the system setting via CSS */
  }
})();
