// Runs before the page paints so night mode does not flash white. Same rule as src/lib/theme.jsx:
// a saved choice wins, otherwise follow the device setting.
(function () {
  try {
    var saved = localStorage.getItem('aag-theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
