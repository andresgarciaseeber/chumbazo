(function () {
  const loginBox    = document.getElementById('login-box');
  const panelBox    = document.getElementById('panel-box');
  const secretInput = document.getElementById('secret-input');
  const loginBtn    = document.getElementById('login-btn');
  const loginStatus = document.getElementById('login-status');
  const currentUrl  = document.getElementById('current-url');
  const urlInput    = document.getElementById('url-input');
  const saveBtn     = document.getElementById('save-btn');
  const saveStatus  = document.getElementById('save-status');
  const modeStatus  = document.getElementById('mode-status');
  const modeBtn     = document.getElementById('mode-btn');

  const STORAGE_KEY = 'chumbazo_admin_secret';
  let currentLive   = true;

  function setStatus(el, msg, ok) {
    el.textContent = msg;
    el.classList.remove('hidden', 'ok', 'err');
    el.classList.add(ok ? 'ok' : 'err');
  }

  function authedFetch(method, body) {
    return fetch('/api/admin-stream', {
      method,
      headers: {
        'Content-Type':   'application/json',
        'X-Admin-Secret': sessionStorage.getItem(STORAGE_KEY) || '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  function updateModeUI(live) {
    currentLive = live;
    if (live) {
      modeStatus.textContent  = '🟢 EN VIVO — chat y resultados activos';
      modeStatus.style.color  = '#4ade80';
      modeBtn.textContent     = '⏸ Pausar hasta próximo partido';
      modeBtn.style.background = '#ef4444';
      modeBtn.style.color      = '#fff';
    } else {
      modeStatus.textContent  = '⏸ STANDBY — chat y resultados pausados';
      modeStatus.style.color  = '#f97316';
      modeBtn.textContent     = '▶ Activar (hay partido)';
      modeBtn.style.background = '#4ade80';
      modeBtn.style.color      = '#111';
    }
  }

  function loadSettings() {
    authedFetch('GET')
      .then(r => r.json())
      .then(({ streamUrl, live, error }) => {
        if (error) { currentUrl.textContent = '—'; return; }
        currentUrl.textContent = streamUrl || '(sin configurar)';
        urlInput.value = streamUrl || '';
        updateModeUI(live !== false);
      })
      .catch(() => { currentUrl.textContent = 'error al cargar'; });
  }

  function toggleMode() {
    modeBtn.disabled = true;
    authedFetch('POST', { live: !currentLive })
      .then(r => r.json())
      .then(({ ok, live }) => {
        if (!ok) throw new Error('No se pudo cambiar el modo');
        updateModeUI(live);
      })
      .catch(err => alert(err.message))
      .finally(() => { modeBtn.disabled = false; });
  }

  function showPanel() {
    loginBox.classList.add('hidden');
    panelBox.classList.remove('hidden');
    loadSettings();
  }

  function tryLogin() {
    const secret = secretInput.value.trim();
    if (!secret) return;
    loginBtn.disabled = true;
    sessionStorage.setItem(STORAGE_KEY, secret);

    authedFetch('GET')
      .then(r => {
        if (r.status === 401) throw new Error('Clave incorrecta');
        return r.json();
      })
      .then(() => showPanel())
      .catch(err => {
        sessionStorage.removeItem(STORAGE_KEY);
        setStatus(loginStatus, err.message || 'Error de acceso', false);
      })
      .finally(() => { loginBtn.disabled = false; });
  }

  function saveUrl() {
    const url = urlInput.value.trim();
    if (!url) return;
    saveBtn.disabled = true;
    saveStatus.classList.add('hidden');

    authedFetch('POST', { streamUrl: url })
      .then(r => r.json())
      .then(({ ok, error, streamUrl }) => {
        if (!ok) throw new Error(error || 'No se pudo guardar');
        currentUrl.textContent = streamUrl;
        setStatus(saveStatus, '✓ URL actualizada', true);
      })
      .catch(err => setStatus(saveStatus, err.message, false))
      .finally(() => { saveBtn.disabled = false; });
  }

  loginBtn.addEventListener('click', tryLogin);
  secretInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  saveBtn.addEventListener('click', saveUrl);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveUrl(); });
  modeBtn.addEventListener('click', toggleMode);

  if (sessionStorage.getItem(STORAGE_KEY)) {
    secretInput.value = sessionStorage.getItem(STORAGE_KEY);
    tryLogin();
  }
})();
