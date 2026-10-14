// Apply the saved appearance before first paint to avoid a flash of the wrong colors or sizes.
// Mirrors applyAppearance() in src/lib/theme.ts.
(function () {
  try {
    var a = {};
    try {
      a = JSON.parse(localStorage.getItem('fw-appearance') || '{}') || {};
    } catch (e) {
      a = {};
    }
    var t = a.theme || localStorage.getItem('fw-theme');
    var root = document.documentElement;
    var dark = t === 'dark' || ((!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    var ok = {
      accent: ['lime', 'steel', 'slate'],
      text: ['large', 'xl'],
      contrast: ['high'],
      corners: ['square'],
      motion: ['reduce'],
    };
    for (var k in ok) {
      if (ok[k].indexOf(a[k]) !== -1) root.setAttribute('data-' + k, a[k]);
    }
  } catch (e) {
    /* storage blocked: follow the system setting via CSS */
  }
})();
