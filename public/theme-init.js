// Runs before the page paints so night mode (the light green theme) does not flash white. Same rule as
// src/lib/theme.jsx: only a saved choice turns it on; everyone else starts in the white day theme.
(function () {
  try {
    if (localStorage.getItem('aag-theme') === 'dark') document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'light';
  } catch (e) {}
})();
