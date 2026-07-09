(function () {
  const overlay     = document.getElementById('nickname-overlay');
  const joinBtn     = document.getElementById('join-btn');
  const nickInput   = document.getElementById('nickname-input');
  const msgInput    = document.getElementById('msg-input');
  const sendBtn     = document.getElementById('send-btn');
  const messagesEl  = document.getElementById('messages');
  const streamFrame = document.getElementById('stream-frame');

  let myNick      = '';
  let lastTs      = 0;
  let sessionId   = Math.random().toString(36).slice(2);
  let isLive      = true;    // controlado desde el admin
  let noMsgCount  = 0;       // para polling adaptivo
  let pollTimer   = null;
  const viewerEl  = document.getElementById('viewer-count');

  // Intervalos de polling (ms)
  const POLL_ACTIVE  = 5000;   // con mensajes recientes
  const POLL_IDLE    = 15000;  // sin mensajes por 2 min
  const POLL_STANDBY = 60000;  // modo standby (admin pausó el evento)

  // ── Config (stream URL + modo live) ─────────────────────────────────
  let pendingStreamUrl = '';

  function loadConfig() {
    fetch('/api/config')
      .then(r => r.json())
      .then(({ streamUrl, live }) => {
        pendingStreamUrl = streamUrl || '';
        isLive = live !== false;
        if (!isLive) reschedulePolling();
      })
      .catch(() => {});
  }

  loadConfig();
  setInterval(loadConfig, 5 * 60 * 1000); // re-chequea modo cada 5 min

  // ── Scores ───────────────────────────────────────────────────────────
  fetchScores();
  setInterval(fetchScores, 2 * 60 * 1000); // cada 2 min (caché server 30s–5min)

  function fetchScores() {
    const mock = new URLSearchParams(location.search).get('mockscores');
    const url  = mock ? `/api/scores?mock=${mock}` : '/api/scores';
    fetch(url)
      .then(r => r.json())
      .then(renderScores)
      .catch(() => {});
  }

  function renderScores({ type, matches }) {
    const bar     = document.getElementById('score-bar');
    const ticker  = document.getElementById('sb-matches');
    const label   = document.getElementById('sb-label');
    if (!matches || !matches.length) { bar.classList.add('hidden'); return; }

    label.textContent = type === 'live' ? '🔴 EN VIVO' : '📅 HOY';
    ticker.innerHTML  = matches.map(m => renderMatch(m, type)).join('');
    bar.classList.remove('hidden');
  }

  function renderMatch(m, type) {
    const homeName  = m.home?.name  || m.home_team?.name  || '?';
    const awayName  = m.away?.name  || m.away_team?.name  || '?';
    const homeLogo  = m.home?.logo  || m.home_team?.logo  || '';
    const awayLogo  = m.away?.logo  || m.away_team?.logo  || '';
    const homeScore = m.home_score  ?? m.score?.home      ?? m.goals?.home;
    const awayScore = m.away_score  ?? m.score?.away      ?? m.goals?.away;
    const status    = (m.status || '').toUpperCase();
    const minute    = m.minute || m.elapsed || '';

    const isLive = ['LIVE','1H','2H','HT','ET','BT','P'].includes(status);
    const isFin  = ['FT','AET','PEN'].includes(status);

    const homeEl = `<span class="sb-team">${homeLogo ? `<img src="${homeLogo}" alt="">` : ''}${esc(homeName)}</span>`;
    const awayEl = `<span class="sb-team">${awayLogo ? `<img src="${awayLogo}" alt="">` : ''}${esc(awayName)}</span>`;

    let middle = '';
    if (isLive && homeScore !== undefined) {
      middle = `<span class="sb-score">${homeScore} - ${awayScore}</span>
                <span class="sb-min">${minute ? minute + "'" : 'VIVO'}</span>`;
    } else if (isFin && homeScore !== undefined) {
      middle = `<span class="sb-score">${homeScore} - ${awayScore}</span>
                <span class="sb-time">FIN</span>`;
    } else {
      // Fixture sin score: muestra hora local
      const hora = m.time
        ? m.time.slice(0, 5)
        : m.kickoff
          ? new Date(m.kickoff).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          : '';
      middle = `<span class="sb-vs">vs</span>${hora ? `<span class="sb-time">${hora}</span>` : ''}`;
    }

    const liveBadge = isLive ? '<span class="sb-live-badge">LIVE</span>' : '';

    return `<div class="sb-match">${liveBadge}${homeEl}${middle}${awayEl}</div>`;
  }

  // ── Modal de apodo ───────────────────────────────────────────────────
  function tryJoin() {
    const nick = nickInput.value.trim();
    if (!nick) { nickInput.focus(); return; }
    myNick = nick;
    overlay.classList.add('hidden');
    if (pendingStreamUrl) streamFrame.src = pendingStreamUrl;
    msgInput.disabled = false;
    sendBtn.disabled  = false;
    msgInput.focus();

    loadHistory().then(() => {
      postMsg(`${nick} se unió al chat`, 'system');
      startPolling();
      startHeartbeat();
    });
  }

  joinBtn.addEventListener('click', tryJoin);
  nickInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); });
  nickInput.focus();

  // ── Historial inicial ────────────────────────────────────────────────
  function loadHistory() {
    return fetch('/api/messages')
      .then(r => r.json())
      .then(messages => {
        messages.forEach(renderMsg);
        if (messages.length) lastTs = messages[messages.length - 1].ts;
        scrollBottom();
      });
  }

  // ── Heartbeat: presencia y contador de espectadores ─────────────────
  function startHeartbeat() {
    sendHeartbeat();
    setInterval(sendHeartbeat, 20000);
  }

  function sendHeartbeat() {
    fetch('/api/viewers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sessionId }),
    })
      .then(r => r.json())
      .then(({ count }) => { if (viewerEl) viewerEl.textContent = count; })
      .catch(() => {});
  }

  // ── Polling de mensajes nuevos (adaptivo) ───────────────────────────
  function currentInterval() {
    if (!isLive)        return POLL_STANDBY;
    if (noMsgCount > 24) return POLL_IDLE;   // sin msgs por ~2 min → 15s
    return POLL_ACTIVE;
  }

  function reschedulePolling() {
    if (!pollTimer) return; // no empezó todavía
    clearInterval(pollTimer);
    pollTimer = setInterval(fetchNew, currentInterval());
  }

  function startPolling() {
    pollTimer = setInterval(fetchNew, currentInterval());
  }

  function fetchNew() {
    fetch(`/api/messages?since=${lastTs}`)
      .then(r => r.json())
      .then(messages => {
        if (!messages.length) {
          noMsgCount++;
          if (noMsgCount === 25) reschedulePolling(); // activa modo idle
          return;
        }
        const wasIdle = noMsgCount > 24;
        noMsgCount = 0;
        messages.forEach(renderMsg);
        lastTs = messages[messages.length - 1].ts;
        scrollBottom();
        if (wasIdle) reschedulePolling(); // vuelve a POLL_ACTIVE
      })
      .catch(() => {});
  }

  // ── Enviar mensaje ───────────────────────────────────────────────────
  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = '';
    msgInput.focus();
    postMsg(text, 'message');
  }

  function postMsg(text, type) {
    fetch('/api/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nickname: myNick, text, type }),
    }).then(r => r.json()).then(({ ts }) => {
      // El propio mensaje del usuario llega vía polling como cualquier otro,
      // pero actualizamos lastTs ya para no recibirlo duplicado
      if (ts) lastTs = Math.max(lastTs, ts - 1);
    }).catch(() => {});
  }

  sendBtn.addEventListener('click', sendMessage);
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  // ── Emojis rápidos ───────────────────────────────────────────────────
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      msgInput.value += btn.dataset.emoji;
      msgInput.focus();
    });
  });

  // ── Render ───────────────────────────────────────────────────────────
  function renderMsg(m) {
    if (m.type === 'system') appendSystem(m.text);
    else appendMessage(m);
  }

  function appendMessage({ nickname, text, ts }) {
    const el   = document.createElement('div');
    el.className = 'msg';
    const time = new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML =
      `<span class="nick">${esc(nickname)}</span>` +
      `<span class="body">${esc(text)}</span>` +
      `<span style="color:var(--text-muted);font-size:.7rem;margin-left:6px">${time}</span>`;
    messagesEl.appendChild(el);
    trimMessages();
  }

  function appendSystem(text) {
    const el   = document.createElement('div');
    el.className = 'msg-system';
    el.textContent = text;
    messagesEl.appendChild(el);
    trimMessages();
  }

  function trimMessages() {
    while (messagesEl.children.length > 80) {
      messagesEl.removeChild(messagesEl.firstChild);
    }
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Hamburger ────────────────────────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const headerNav = document.getElementById('header-nav');

  hamburger?.addEventListener('click', e => {
    e.stopPropagation();
    const open = headerNav.classList.toggle('open');
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', e => {
    if (!document.querySelector('header').contains(e.target)) {
      headerNav?.classList.remove('open');
      hamburger?.classList.remove('open');
      hamburger?.setAttribute('aria-expanded', 'false');
    }
  });

  // ── Modal suscripción ─────────────────────────────────────────────────
  const notifyBtn  = document.getElementById('notify-btn');
  const subOverlay = document.getElementById('sub-overlay');
  const subClose   = document.getElementById('sub-close');
  const subEmailEl = document.getElementById('sub-email');
  const subSubmit  = document.getElementById('sub-submit');
  const subStatus  = document.getElementById('sub-status');

  function openSubModal() {
    subOverlay.classList.remove('hidden');
    headerNav?.classList.remove('open');
    hamburger?.classList.remove('open');
    hamburger?.setAttribute('aria-expanded', 'false');
    setTimeout(() => subEmailEl.focus(), 50);
  }

  function closeSubModal() {
    subOverlay.classList.add('hidden');
    subStatus.textContent = '';
    subStatus.className = 'sub-status';
  }

  notifyBtn?.addEventListener('click', openSubModal);
  subClose?.addEventListener('click', closeSubModal);
  subOverlay?.addEventListener('click', e => { if (e.target === subOverlay) closeSubModal(); });
  subEmailEl?.addEventListener('keydown', e => { if (e.key === 'Enter') submitSub(); });
  subSubmit?.addEventListener('click', submitSub);

  function submitSub() {
    const email = subEmailEl.value.trim();
    if (!email) { subEmailEl.focus(); return; }
    subSubmit.disabled = true;

    fetch('/api/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    })
      .then(r => r.json())
      .then(({ ok, already, error }) => {
        if (!ok) throw new Error(error || 'No se pudo guardar');
        setSubStatus(
          already
            ? '¡Ya estás en la lista! Te avisamos cuando transmitamos.'
            : '¡Listo! Te avisamos cuando estemos en vivo. 🎉',
          true
        );
        subEmailEl.value = '';
        setTimeout(closeSubModal, 3000);
      })
      .catch(err => setSubStatus(err.message, false))
      .finally(() => { subSubmit.disabled = false; });
  }

  function setSubStatus(msg, ok) {
    subStatus.textContent = msg;
    subStatus.className = 'sub-status ' + (ok ? 'ok' : 'err');
  }
})();
