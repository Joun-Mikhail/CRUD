// Applies the saved theme before first paint (external file: the CSP forbids inline scripts).
(function () {
  var theme = 'system'
  try {
    theme = localStorage.getItem('sn.theme') || 'system'
  } catch (e) {
    /* storage unavailable: keep system */
  }
  var dark =
    theme === 'dark' ||
    (theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
})()
