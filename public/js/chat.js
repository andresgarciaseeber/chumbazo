(function () {
  const overlay     = document.getElementById('nickname-overlay');
  const joinBtn     = document.getElementById('join-btn');
  const nickInput   = document.getElementById('nickname-input');
  const msgInput    = document.getElementById('msg-input');
  const sendBtn     = document.getElementById('send-btn');
  const messagesEl  = document.getElementById('messages');
  const streamFrame = document.getElementById('stream-frame');

  let myNick    = '';
  let lastTs    = 0;
  let sessionId = Math.random().toString(36).slice(2);
  const viewerEl = document.getElementById('viewer-count');

  // ── Stream URL ───────────────────────────────────────────────────────
  fetch('/api/config')
    .then(r => r.json())
    .then(({ streamUrl }) => { if (streamUrl) streamFrame.src = streamUrl; });

  // ── Scores ───────────────────────────────────────────────────────────
  fetchScores();
  setInterval(fetchScores, 60000);

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
      const hora = m.time ? m.time.slice(0, 5) : '';
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

  // ── Polling de mensajes nuevos ───────────────────────────────────────
  function startPolling() {
    pollTimer = setInterval(fetchNew, 1500);
  }

  function fetchNew() {
    fetch(`/api/messages?since=${lastTs}`)
      .then(r => r.json())
      .then(messages => {
        if (!messages.length) return;
        messages.forEach(renderMsg);
        lastTs = messages[messages.length - 1].ts;
        scrollBottom();
      })
      .catch(() => {}); // silencia errores de red transitorios
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
})();
