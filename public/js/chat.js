(function () {
  const overlay    = document.getElementById('nickname-overlay');
  const joinBtn    = document.getElementById('join-btn');
  const nickInput  = document.getElementById('nickname-input');
  const msgInput   = document.getElementById('msg-input');
  const sendBtn    = document.getElementById('send-btn');
  const messagesEl = document.getElementById('messages');
  const viewerEl   = document.getElementById('viewer-count');
  const streamFrame = document.getElementById('stream-frame');

  let socket = null;
  let myNick = '';

  // ── Cargar URL del stream ──
  fetch('/config')
    .then(r => r.json())
    .then(({ streamUrl }) => {
      if (streamUrl) streamFrame.src = streamUrl;
    });

  // ── Modal de apodo ──
  function tryJoin() {
    const nick = nickInput.value.trim();
    if (!nick) { nickInput.focus(); return; }
    myNick = nick;
    overlay.classList.add('hidden');
    initSocket();
  }

  joinBtn.addEventListener('click', tryJoin);
  nickInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); });
  nickInput.focus();

  // ── Socket.IO ──
  function initSocket() {
    socket = io();

    socket.on('connect', () => {
      socket.emit('join', myNick);
      msgInput.disabled = false;
      sendBtn.disabled = false;
      msgInput.focus();
    });

    socket.on('history', (messages) => {
      messages.forEach(appendMessage);
      scrollBottom();
    });

    socket.on('chat message', (msg) => {
      appendMessage(msg);
      scrollBottom();
    });

    socket.on('system', (text) => {
      appendSystem(text);
      scrollBottom();
    });

    socket.on('viewer count', (count) => {
      viewerEl.textContent = count;
    });
  }

  // ── Enviar mensaje ──
  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !socket) return;
    socket.emit('chat message', text);
    msgInput.value = '';
    msgInput.focus();
  }

  sendBtn.addEventListener('click', sendMessage);
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  // ── Emojis rápidos ──
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      msgInput.value += btn.dataset.emoji;
      msgInput.focus();
    });
  });

  // ── Render ──
  function appendMessage({ nickname, text, ts }) {
    const el = document.createElement('div');
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
    const el = document.createElement('div');
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
