(() => {
  const audio = document.querySelector('#backgroundMusic');
  const toggle = document.querySelector('#backgroundMusicToggle');
  const electionContent = document.querySelector('#electionContent');
  const handoffKey = 'oracle-registration-music';
  const votingPage = new URL('vote.html', location.href);
  let musicOff = false;
  let enteringVotingPage = false;
  let pageActive = true;
  audio.volume = 0.125;

  if (electionContent) {
    try {
      const saved = sessionStorage.getItem(handoffKey);
      sessionStorage.removeItem(handoffKey);
      if (saved) {
        const { time, off } = JSON.parse(saved);
        if (Number.isFinite(time) && time >= 0) audio.currentTime = time;
        musicOff = off === true;
      }
    } catch {
      // Registration audio can still start from the beginning.
    }
  }

  function tryPlay() {
    if (pageActive && !document.hidden && !toggle.hidden && !musicOff && audio.paused) {
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
  audio.addEventListener('playing', () => {
    if (!pageActive || document.hidden || toggle.hidden || musicOff) audio.pause();
  });
  audio.addEventListener('pause', updateLabel);
  toggle.addEventListener('click', () => {
    if (toggle.hidden) return;
    musicOff = !audio.paused;
    if (musicOff) audio.pause();
    else tryPlay();
  });
  document.addEventListener('click', (event) => {
    if (!toggle.contains(event.target)) tryPlay();
    if (electionContent || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    enteringVotingPage = link.origin === votingPage.origin && link.pathname === votingPage.pathname;
  });

  if (electionContent) {
    new MutationObserver(() => syncAvailability()).observe(electionContent, { childList: true });
  }
  window.addEventListener('pagehide', () => {
    pageActive = false;
    if (enteringVotingPage) {
      try {
        sessionStorage.setItem(handoffKey, JSON.stringify({ time: audio.currentTime, off: musicOff }));
      } catch {
        // Navigation still works when browser storage is unavailable.
      }
      enteringVotingPage = false;
    }
    audio.pause();
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    syncAvailability(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else syncAvailability(true);
  });
  syncAvailability();
})();
