(function () {
  const overlay     = document.getElementById('nickname-overlay');
  const joinBtn     = document.getElementById('join-btn');
  const nickInput   = document.getElementById('nickname-input');
  const msgInput    = document.getElementById('msg-input');
  const sendBtn     = document.getElementById('send-btn');
  const messagesEl  = document.getElementById('messages');
  const streamFrame = document.getElementById('stream-frame');

  let myNick   = '';
  let lastTs   = 0;
  let pollTimer = null;

  // ── Stream URL ───────────────────────────────────────────────────────
  fetch('/api/config')
    .then(r => r.json())
    .then(({ streamUrl }) => { if (streamUrl) streamFrame.src = streamUrl; });

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
