// Apply the saved appearance before first paint to avoid a flash of the wrong colors, fonts or sizes.
// Mirrors applyAppearance() in src/lib/theme.ts.
(function () {
  try {
    var a = {};
    try {
      a = JSON.parse(localStorage.getItem('fw-appearance') || '{}') || {};
    } catch (_) {
      a = {};
    }
    var t = a.theme || localStorage.getItem('fw-theme') || 'system';
    var root = document.documentElement;
    var darkThemes = { dark: 1, graphite: 1, forest: 1 };
    var lightThemes = { light: 1, grey: 1, green: 1, mono: 1 };
    var dark = darkThemes[t] === 1 || (lightThemes[t] !== 1 && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    var ok = {
      theme: ['grey', 'graphite', 'green', 'forest', 'mono'],
      accent: ['green', 'lime', 'steel', 'slate'],
      font: ['nunito', 'atkinson', 'lexend', 'serif', 'mono'],
      text: ['large', 'xl'],
      spacing: ['wide'],
      contrast: ['high'],
      corners: ['square'],
      motion: ['reduce'],
    };
    a.theme = t;
    for (var k in ok) {
      if (ok[k].indexOf(a[k]) !== -1) root.setAttribute('data-' + k, a[k]);
    }
    var toolbar = { light: '#ffffff', dark: '#0f110f', grey: '#eceeef', graphite: '#232526', green: '#e9f3eb', forest: '#0b1a10', mono: '#ffffff' }[t];
    if (toolbar) {
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < metas.length; i++) {
        metas[i].setAttribute('data-default', metas[i].getAttribute('content') || '');
        metas[i].setAttribute('content', toolbar);
      }
    }
  } catch (_) {
    /* storage blocked: follow the system setting via CSS */
  }
})();
