const STARTUP_STEPS = [
  'Preparing your workspace',
  'Starting the local API',
  'Opening your studio',
];

function createStartupHtml() {
  const steps = STARTUP_STEPS.map((step, index) => `<li data-step="${index}"><span class="step-icon"></span><span>${step}</span></li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LocalFlow</title>
  <style>
    :root { color-scheme: dark; font-family: "Segoe UI", sans-serif; background: #10131a; color: #f2f5fb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(ellipse at 50% -20%, #233653 0, #151b27 48%, #10131a 82%); }
    main { width: 100%; padding: 34px 38px 30px; }
    header { display: flex; align-items: center; gap: 13px; margin-bottom: 27px; }
    .brand-mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: #fff; font-weight: 750; letter-spacing: -1px; background: #3478f6; box-shadow: 0 5px 20px #3478f644; }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: -.35px; }
    .caption { margin-top: 3px; color: #8290a5; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; }
    h1 { margin: 0 0 8px; font-size: 20px; letter-spacing: -.4px; }
    #detail { min-height: 20px; margin: 0; color: #9eabc0; font-size: 13px; line-height: 1.5; }
    .progress { height: 3px; margin: 23px 0 18px; overflow: hidden; border-radius: 3px; background: #283140; }
    .progress span { display: block; width: 32%; height: 100%; border-radius: inherit; background: #4b8cff; animation: travel 1.5s ease-in-out infinite; }
    @keyframes travel { from { transform: translateX(-110%); } to { transform: translateX(420%); } }
    ol { display: grid; gap: 11px; margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: center; gap: 11px; min-height: 23px; color: #69778c; font-size: 13px; transition: color .2s ease; }
    .step-icon { display: grid; place-items: center; width: 19px; height: 19px; flex: 0 0 19px; border: 1px solid #3a4555; border-radius: 50%; color: transparent; font-size: 11px; }
    li.active { color: #e8eef8; }
    li.active .step-icon { border: 2px solid #3478f6; border-right-color: #62748e; animation: rotate .9s linear infinite; }
    li.complete { color: #9eb5d9; }
    li.complete .step-icon { border-color: #3478f6; background: #3478f6; color: white; }
    @keyframes rotate { to { transform: rotate(360deg); } }
    footer { margin-top: 25px; color: #68778c; font-size: 11px; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 2.5s !important; } }
  </style>
</head>
<body>
  <main>
    <header><div class="brand-mark">Lf</div><div><div class="brand">LocalFlow</div><div class="caption">Your local creative studio</div></div></header>
    <h1 id="title">Preparing your workspace</h1>
    <p id="detail" role="status" aria-live="polite">Checking your local projects and media…</p>
    <div class="progress" aria-hidden="true"><span></span></div>
    <ol>${steps}</ol>
    <footer>Your projects and media stay on this computer.</footer>
  </main>
  <script>
    window.setStartupState = ({ step, title, detail }) => {
      document.getElementById('title').textContent = title;
      document.getElementById('detail').textContent = detail;
      document.querySelectorAll('[data-step]').forEach((item) => {
        const index = Number(item.dataset.step);
        item.classList.toggle('active', index === step);
        item.classList.toggle('complete', index < step);
        item.querySelector('.step-icon').textContent = index < step ? '✓' : '';
      });
    };
  </script>
</body>
</html>`;
}

function createStartupUpdateScript(step, title, detail) {
  const payload = JSON.stringify({ step, title, detail }).replace(/</g, '\\u003c');
  return `window.setStartupState(${payload})`;
}

module.exports = { STARTUP_STEPS, createStartupHtml, createStartupUpdateScript };
