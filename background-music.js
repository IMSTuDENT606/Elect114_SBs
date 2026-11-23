(() => {
  const audio = document.querySelector('#backgroundMusic');
  const toggle = document.querySelector('#backgroundMusicToggle');
  const electionContent = document.querySelector('#electionContent');
  let musicOff = false;
  audio.volume = 0.25;

  function tryPlay() {
    if (!toggle.hidden && !musicOff && audio.paused) {
      void audio.play().catch(updateLabel);
    }
  }

  function syncAvailability(retry = false) {
    const wasHidden = toggle.hidden;
    toggle.hidden = Boolean(electionContent && !electionContent.querySelector('.election-register #loginForm'));
    if (toggle.hidden) audio.pause();
    else if (wasHidden || retry) tryPlay();
  }

  function updateLabel() {
    toggle.textContent = audio.paused ? '♪ เปิดเพลง' : '♪ ปิดเพลง';
  }

  audio.addEventListener('play', updateLabel);
  audio.addEventListener('pause', updateLabel);
  toggle.addEventListener('click', () => {
    if (toggle.hidden) return;
    musicOff = !audio.paused;
    if (musicOff) audio.pause();
    else tryPlay();
  });
  document.addEventListener('click', (event) => {
    if (!toggle.contains(event.target)) tryPlay();
  });

  if (electionContent) {
    new MutationObserver(() => syncAvailability()).observe(electionContent, { childList: true });
  }
  window.addEventListener('pagehide', () => audio.pause());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) syncAvailability(true);
  });
  syncAvailability();
})();
