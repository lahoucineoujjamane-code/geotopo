/* ═══════════════════════════════════════════════════════════
   GeoTopo Pro — Cloud Client (Cloudflare Pages + D1 + R2)
   Inject BEFORE app.js — does not modify any GIS feature
   ═══════════════════════════════════════════════════════════ */

/* ── API client ─────────────────────────────────────────── */
const API = (() => {
  const BASE = '/api';
  let _token = localStorage.getItem('gtp_token');
  let _user  = JSON.parse(localStorage.getItem('gtp_user') || 'null');

  const hdr = () => ({
    'Content-Type': 'application/json',
    ...(_token ? { Authorization: 'Bearer ' + _token } : {})
  });

  async function call(path, opts = {}) {
    const res  = await fetch(BASE + path, { headers: hdr(), ...opts,
      ...(opts.body && typeof opts.body !== 'string' ? { body: JSON.stringify(opts.body) } : {}) });
    const data = await res.json().catch(() => ({ error: 'Réponse invalide' }));
    if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
    return data;
  }

  function persist(token, user) {
    _token = token; _user = user;
    localStorage.setItem('gtp_token', token);
    localStorage.setItem('gtp_user', JSON.stringify(user));
  }

  return {
    token:     () => _token,
    user:      () => _user,
    loggedIn:  () => !!_token,

    async register(email, password, name, plan = 'free') {
      const d = await call('/auth/register', { method: 'POST', body: { email, password, name, plan } });
      persist(d.token, d.user); return d;
    },
    async login(email, password) {
      const d = await call('/auth/login', { method: 'POST', body: { email, password } });
      persist(d.token, d.user); return d;
    },
    async logout() {
      try { await call('/auth/logout', { method: 'POST' }); } catch (_) {}
      _token = null; _user = null;
      localStorage.removeItem('gtp_token');
      localStorage.removeItem('gtp_user');
      localStorage.removeItem('gtp_current_project');
    },
    async me()                  { return call('/auth/me'); },
    async resetRequest(email)   { return call('/auth/reset',  { method: 'POST', body: { email } }); },
    async resetConfirm(t, p)    { return call('/auth/reset',  { method: 'POST', body: { token: t, password: p } }); },

    // Projects
    async listProjects()             { return call('/projects'); },
    async createProject(data)        { return call('/projects',      { method: 'POST', body: data }); },
    async getProject(id)             { return call('/projects/' + id); },
    async updateProject(id, data)    { return call('/projects/' + id, { method: 'PUT',  body: data }); },
    async deleteProject(id)          { return call('/projects/' + id, { method: 'DELETE' }); },

    // Layers
    async saveLayer(data)            { return call('/layers',        { method: 'POST', body: data }); },
    async deleteLayer(id)            { return call('/layers/' + id,  { method: 'DELETE' }); },
  };
})();

/* ── Project state ──────────────────────────────────────── */
let _currentProject = JSON.parse(localStorage.getItem('gtp_current_project') || 'null');
let _dirty = false;
let _autoSaveTimer = null;

function _markDirty() {
  _dirty = true;
  _showSaveIndicator('●', '#f5a623', 'Modifications non sauvegardées');
  clearTimeout(_autoSaveTimer);
  if (API.loggedIn() && _currentProject) {
    _autoSaveTimer = setTimeout(() => saveProject(true), 30000);
  }
}

function _markSaved() {
  _dirty = false;
  _showSaveIndicator('✓', '#1fd1a8', 'Sauvegardé');
  setTimeout(() => _showSaveIndicator('', '', ''), 3000);
}

function _showSaveIndicator(icon, color, title) {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  if (!icon) { el.classList.remove('show'); return; }
  el.innerHTML = `<span style="color:${color}">${icon}</span> ${title}`;
  el.classList.add('show');
}

/* ── Collect current map state ──────────────────────────── */
function _collectLayers() {
  const layers = [];
  if (typeof drawn === 'undefined') return layers;
  let z = 0;
  drawn.eachLayer(layer => {
    try {
      if (!layer.toGeoJSON) return;
      layers.push({
        name:    layer._gname || (layer._gtype || 'layer'),
        type:    'geojson',
        geojson: layer.toGeoJSON(),
        style:   { color: layer._gcolor || '#1fd1a8' },
        visible: 1,
        z_index: z++,
      });
    } catch (_) {}
  });
  return layers;
}

/* ── Save project ────────────────────────────────────────── */
async function saveProject(silent = false) {
  if (!API.loggedIn()) { showAuthModal('login'); return; }
  if (!_currentProject) { _showSaveModal(); return; }

  if (!silent) _showSaveIndicator('⌛', '#8294b5', 'Sauvegarde…');
  try {
    const c = (typeof map !== 'undefined') ? map.getCenter() : { lat: 29, lng: -10 };
    // Update project meta
    await API.updateProject(_currentProject.id, {
      crs:        typeof activeCRS !== 'undefined' ? activeCRS : 'EPSG:4326',
      base_map:   typeof baseKey   !== 'undefined' ? baseKey   : 'osm',
      center_lat: c.lat, center_lon: c.lng,
      zoom:       typeof map !== 'undefined' ? map.getZoom() : 10,
    });
    // Save layers
    const layers = _collectLayers();
    // Delete old layers first then re-save (simplest strategy)
    const { project, layers: oldLayers } = await API.getProject(_currentProject.id);
    await Promise.allSettled(oldLayers.map(l => API.deleteLayer(l.id)));
    await Promise.allSettled(layers.map(l => API.saveLayer({ ...l, project_id: _currentProject.id })));

    _markSaved();
    if (!silent) _toast('✓ Projet "' + _currentProject.name + '" sauvegardé');
  } catch (e) {
    _showSaveIndicator('✕', '#ef4444', 'Erreur: ' + e.message);
    if (!silent) _toast('Erreur: ' + e.message, true);
  }
}

/* ── Open project ────────────────────────────────────────── */
async function openProject() {
  if (!API.loggedIn()) { showAuthModal('login'); return; }
  _showDashboard();
}

async function _loadProject(id) {
  _toast('Chargement…');
  try {
    const { project, layers } = await API.getProject(id);
    _currentProject = project;
    localStorage.setItem('gtp_current_project', JSON.stringify(project));

    // Restore map view
    if (typeof map !== 'undefined' && project.center_lat && project.center_lon) {
      map.setView([project.center_lat, project.center_lon], project.zoom || 10);
    }

    // Restore CRS
    if (project.crs && typeof setCRS === 'function') {
      try { setCRS('active', project.crs); } catch (_) {}
    }

    // Restore layers
    if (typeof drawn !== 'undefined') {
      drawn.clearLayers();
      if (typeof selectedLayer !== 'undefined') window.selectedLayer = null;
    }
    for (const layer of layers) {
      if (!layer.geojson) continue;
      try {
        const gj    = typeof layer.geojson === 'string' ? JSON.parse(layer.geojson) : layer.geojson;
        const style = typeof layer.style   === 'string' ? JSON.parse(layer.style)   : layer.style || {};
        if (typeof addGeoJSON === 'function') addGeoJSON(gj, style.color);
      } catch (_) {}
    }
    if (typeof renderList === 'function') renderList();

    _markSaved();
    _closeDashboard();
    _toast('✓ "' + project.name + '" ouvert — ' + layers.length + ' couche(s)');
    _updateUserUI();
  } catch (e) { _toast('Erreur: ' + e.message, true); }
}

async function _deleteProject(id, name) {
  if (!confirm('Supprimer "' + name + '" ?\nCette action est irréversible.')) return;
  try {
    await API.deleteProject(id);
    if (_currentProject?.id === id) {
      _currentProject = null;
      localStorage.removeItem('gtp_current_project');
    }
    _toast('Projet supprimé');
    _loadProjectList();
  } catch (e) { _toast(e.message, true); }
}

/* ── Dashboard UI ────────────────────────────────────────── */
function _showDashboard() {
  _closeDashboard();
  const d = document.createElement('div');
  d.id = 'cloudDash';
  d.style.cssText = [
    'position:fixed;inset:0;z-index:4000;',
    'background:rgba(0,15,40,.92);backdrop-filter:blur(8px);',
    'display:flex;flex-direction:column;overflow:hidden'
  ].join('');

  const user = API.user();
  d.innerHTML = `
  <div style="background:#0d1421;border-bottom:1px solid #1e3a5f;
    padding:14px 18px;display:flex;align-items:center;gap:14px;flex-shrink:0">
    <span style="font-size:22px">⛰</span>
    <div style="flex:1">
      <div style="font-size:16px;font-weight:800;color:#e2e8f0">Mes Projets</div>
      <div style="font-size:11px;color:#8294b5">${_esc(user?.name||'')} · ${_esc(user?.plan||'')}</div>
    </div>
    <button onclick="_showNewProjectModal()"
      style="padding:8px 16px;background:#1fd1a8;color:#0d1421;border:none;
      border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
      + Nouveau projet
    </button>
    <button onclick="_closeDashboard()"
      style="padding:8px 13px;background:#1e3a5f;color:#e2e8f0;border:none;
      border-radius:10px;font-size:13px;cursor:pointer">✕</button>
  </div>
  <div style="flex:1;overflow-y:auto;padding:18px">
    <div id="projGrid" style="display:grid;
      grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
      <div style="text-align:center;padding:40px;color:#8294b5">Chargement…</div>
    </div>
  </div>`;

  document.body.appendChild(d);
  _loadProjectList();
}

async function _loadProjectList() {
  const grid = document.getElementById('projGrid');
  if (!grid) return;
  try {
    const { projects } = await API.listProjects();
    if (!projects.length) {
      grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#8294b5">
        <div style="font-size:48px;margin-bottom:12px">📭</div>
        <div style="font-size:15px;font-weight:600">Aucun projet sauvegardé</div>
        <div style="font-size:12px;margin-top:6px">Créez votre premier projet cloud</div>
      </div>`;
      return;
    }
    grid.innerHTML = projects.map(p => `
    <div style="background:#0d1421;border:1px solid ${_currentProject?.id===p.id?'#1fd1a8':'#1e3a5f'};
      border-radius:14px;padding:16px;transition:border-color .15s"
      onmouseover="this.style.borderColor='#1fd1a8'"
      onmouseout="this.style.borderColor='${_currentProject?.id===p.id?'#1fd1a8':'#1e3a5f'}'">
      ${_currentProject?.id===p.id ? '<div style="font-size:10px;font-weight:700;color:#1fd1a8;margin-bottom:6px">● Projet actif</div>' : ''}
      <div style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:4px">${_esc(p.name)}</div>
      ${p.description ? `<div style="font-size:12px;color:#8294b5;margin-bottom:6px">${_esc(p.description)}</div>` : ''}
      <div style="font-size:10px;color:#4a5a7a;margin-bottom:12px">
        Mis à jour: ${new Date(p.updated_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
        &nbsp;·&nbsp; CRS: ${_esc(p.crs||'WGS84')}
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="_loadProject('${p.id}')"
          style="flex:1;padding:8px;background:#1fd1a8;color:#0d1421;border:none;
          border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">
          📂 Ouvrir
        </button>
        <button onclick="_deleteProject('${p.id}','${_esc(p.name)}')"
          style="padding:8px 12px;background:rgba(239,68,68,.12);color:#ef4444;
          border:1px solid rgba(239,68,68,.25);border-radius:9px;font-size:12px;cursor:pointer">
          🗑
        </button>
      </div>
    </div>`).join('');
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444">
      Erreur: ${_esc(e.message)}</div>`;
  }
}

function _closeDashboard() { document.getElementById('cloudDash')?.remove(); }

function _showNewProjectModal() {
  const name = prompt('Nom du nouveau projet cloud:');
  if (!name?.trim()) return;
  _createProject(name.trim());
}

async function _createProject(name) {
  try {
    const c = (typeof map !== 'undefined') ? map.getCenter() : { lat: 29, lng: -10 };
    const { id } = await API.createProject({
      name,
      crs:        typeof activeCRS !== 'undefined' ? activeCRS : 'EPSG:4326',
      base_map:   typeof baseKey   !== 'undefined' ? baseKey   : 'osm',
      center_lat: c.lat, center_lon: c.lng,
      zoom:       typeof map !== 'undefined' ? map.getZoom() : 10,
    });
    _currentProject = { id, name };
    localStorage.setItem('gtp_current_project', JSON.stringify({ id, name }));
    _closeDashboard();
    _markSaved();
    _toast('✓ Projet "' + name + '" créé');
    _updateUserUI();
  } catch (e) { _toast(e.message, true); }
}

/* ── Auth Modal ──────────────────────────────────────────── */
function showAuthModal(tab = 'login') {
  document.getElementById('authModal')?.remove();
  const INP = 'width:100%;background:#0a1628;border:1.5px solid #1e3a5f;color:#e2e8f0;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;margin-bottom:10px;box-sizing:border-box;transition:border-color .15s';
  const BTN = 'width:100%;padding:11px;background:#1fd1a8;color:#0d1421;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px';
  const BTN2 = 'width:100%;padding:10px;background:transparent;color:#8294b5;border:1.5px solid #1e3a5f;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px';

  const m = document.createElement('div');
  m.id = 'authModal';
  m.style.cssText = 'position:fixed;inset:0;z-index:6000;background:rgba(0,15,40,.9);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML = `
  <div style="background:#0d1421;border:1px solid #1e3a5f;border-radius:20px;padding:32px;
    width:400px;max-width:100%;max-height:90vh;overflow-y:auto;
    box-shadow:0 20px 60px rgba(0,0,0,.6)">
    <div style="text-align:center;margin-bottom:22px">
      <div style="font-size:38px;margin-bottom:8px">⛰</div>
      <div style="font-size:19px;font-weight:800;color:#e2e8f0">GeoTopo Pro Cloud</div>
      <div style="font-size:12px;color:#8294b5;margin-top:4px">Sauvegarde sécurisée sur Cloudflare</div>
    </div>

    <div style="display:flex;gap:3px;background:#0a1628;border-radius:10px;padding:4px;margin-bottom:20px">
      ${['login','register','reset'].map(t=>
        `<button id="atab-${t}" onclick="_switchAuthTab('${t}')"
          style="flex:1;padding:7px;border-radius:7px;border:none;font-size:12px;font-weight:600;cursor:pointer;
          background:${t===tab?'#1e3a5f':'transparent'};color:${t===tab?'#e2e8f0':'#8294b5'};transition:all .15s">
          ${t==='login'?'Connexion':t==='register'?'Inscription':'Mot de passe'}
        </button>`).join('')}
    </div>

    <!-- LOGIN -->
    <div id="aform-login" style="display:${tab==='login'?'block':'none'}">
      <div id="loginErr" style="color:#ef4444;font-size:12px;margin-bottom:8px;display:none"></div>
      <input id="aiEmail" type="email" placeholder="Email" style="${INP}" autocomplete="email"/>
      <input id="aiPass"  type="password" placeholder="Mot de passe" style="${INP}"/>
      <button style="${BTN}" onclick="_doLogin()">Se connecter →</button>
      <button style="${BTN2}" onclick="document.getElementById('authModal').remove()">Continuer sans compte</button>
    </div>

    <!-- REGISTER -->
    <div id="aform-register" style="display:${tab==='register'?'block':'none'}">
      <div id="regErr" style="color:#ef4444;font-size:12px;margin-bottom:8px;display:none"></div>
      <input id="aiName"  type="text"     placeholder="Nom complet"          style="${INP}"/>
      <input id="aiEmail2" type="email"   placeholder="Email"                style="${INP}" autocomplete="email"/>
      <input id="aiPass2"  type="password" placeholder="Mot de passe (min 8)" style="${INP}"/>
      <div style="font-size:11px;font-weight:600;color:#8294b5;margin-bottom:8px">Plan :</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div id="pFree"   onclick="_selPlan('free')"
          style="border:2px solid #1e3a5f;border-radius:10px;padding:12px;text-align:center;cursor:pointer;transition:all .15s">
          <div style="font-size:18px">🆓</div>
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;margin-top:4px">Gratuit</div>
          <div style="font-size:10px;color:#8294b5">Essai 30 jours</div>
        </div>
        <div id="pAnnual" onclick="_selPlan('annual')"
          style="border:2px solid #1fd1a8;background:rgba(31,209,168,.08);border-radius:10px;
          padding:12px;text-align:center;cursor:pointer;transition:all .15s">
          <div style="font-size:18px">⭐</div>
          <div style="font-size:12px;font-weight:700;color:#1fd1a8;margin-top:4px">400 MAD/an</div>
          <div style="font-size:10px;color:#8294b5">Tout inclus</div>
        </div>
      </div>
      <button style="${BTN}" onclick="_doRegister()">Créer mon compte →</button>
      <div style="font-size:11px;color:#8294b5;text-align:center">✓ 30 jours d'essai gratuit</div>
    </div>

    <!-- RESET -->
    <div id="aform-reset" style="display:${tab==='reset'?'block':'none'}">
      <div id="reset1">
        <div style="font-size:12px;color:#8294b5;margin-bottom:12px">
          Entrez votre email pour recevoir un lien de réinitialisation.</div>
        <input id="aiResetEmail" type="email" placeholder="Email" style="${INP}"/>
        <div id="resetErr" style="color:#ef4444;font-size:12px;margin-bottom:8px;display:none"></div>
        <button style="${BTN}" onclick="_doResetReq()">Envoyer le lien</button>
      </div>
      <div id="reset2" style="display:none">
        <div style="font-size:12px;color:#1fd1a8;margin-bottom:12px">Entrez le token reçu par email.</div>
        <input id="aiResetTok"  type="text"     placeholder="Token de réinitialisation" style="${INP}"/>
        <input id="aiResetPass" type="password" placeholder="Nouveau mot de passe"      style="${INP}"/>
        <button style="${BTN}" onclick="_doResetConfirm()">Réinitialiser</button>
      </div>
    </div>

    <button onclick="document.getElementById('authModal').remove()"
      style="display:block;width:100%;padding:7px;background:none;border:none;
      color:#4a5a7a;font-size:12px;cursor:pointer;margin-top:8px">Fermer</button>
  </div>`;

  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  // Enter key
  m.querySelectorAll('input').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if      (tab === 'login')    _doLogin();
        else if (tab === 'register') _doRegister();
      }
    });
    el.style.setProperty('--focus-color','#1fd1a8');
    el.addEventListener('focus',  () => { el.style.borderColor = '#1fd1a8'; });
    el.addEventListener('blur',   () => { el.style.borderColor = '#1e3a5f'; });
  });
}

let _selPlanVal = 'annual';
function _selPlan(p) {
  _selPlanVal = p;
  document.getElementById('pFree')  ?.style && Object.assign(document.getElementById('pFree').style,
    { borderColor: p==='free'?'#1fd1a8':'#1e3a5f', background: p==='free'?'rgba(31,209,168,.08)':'' });
  document.getElementById('pAnnual')?.style && Object.assign(document.getElementById('pAnnual').style,
    { borderColor: p==='annual'?'#1fd1a8':'#1e3a5f', background: p==='annual'?'rgba(31,209,168,.08)':'' });
}

function _switchAuthTab(tab) {
  ['login','register','reset'].forEach(t => {
    const f = document.getElementById('aform-' + t);
    const b = document.getElementById('atab-'  + t);
    if (f) f.style.display = t === tab ? 'block' : 'none';
    if (b) { b.style.background = t===tab?'#1e3a5f':'transparent'; b.style.color = t===tab?'#e2e8f0':'#8294b5'; }
  });
}

function _setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg; el.style.display = msg ? 'block' : 'none';
}

async function _doLogin() {
  _setErr('loginErr', '');
  const email = document.getElementById('aiEmail')?.value?.trim();
  const pass  = document.getElementById('aiPass')?.value;
  try {
    await API.login(email, pass);
    document.getElementById('authModal')?.remove();
    _updateUserUI();
    _toast('✓ Connecté — ' + API.user()?.name);
    // Auto-open dashboard after login
    setTimeout(_showDashboard, 300);
  } catch (e) { _setErr('loginErr', e.message); }
}

async function _doRegister() {
  _setErr('regErr', '');
  const name  = document.getElementById('aiName')?.value?.trim();
  const email = document.getElementById('aiEmail2')?.value?.trim();
  const pass  = document.getElementById('aiPass2')?.value;
  try {
    await API.register(email, pass, name, _selPlanVal);
    document.getElementById('authModal')?.remove();
    _updateUserUI();
    _toast('✓ Bienvenue ' + name + '! Essai 30 jours activé');
    setTimeout(_showDashboard, 300);
  } catch (e) { _setErr('regErr', e.message); }
}

async function _doResetReq() {
  _setErr('resetErr', '');
  const email = document.getElementById('aiResetEmail')?.value?.trim();
  try {
    await API.resetRequest(email);
    document.getElementById('reset1').style.display = 'none';
    document.getElementById('reset2').style.display = 'block';
    _toast('Email envoyé (consultez la console en mode dev)');
  } catch (e) { _setErr('resetErr', e.message); }
}

async function _doResetConfirm() {
  const token = document.getElementById('aiResetTok')?.value?.trim();
  const pass  = document.getElementById('aiResetPass')?.value;
  try {
    await API.resetConfirm(token, pass);
    document.getElementById('authModal')?.remove();
    _toast('✓ Mot de passe réinitialisé');
    setTimeout(() => showAuthModal('login'), 400);
  } catch (e) { _toast(e.message, true); }
}

/* ── User button menu ────────────────────────────────────── */
function _updateUserUI() {
  const btn = document.getElementById('btnUser');
  if (!btn) return;
  const user = API.user();
  if (user) {
    const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    btn.textContent = initials;
    btn.style.background = '#1fd1a8';
    btn.style.color = '#0d1421';
    btn.title = user.name + ' · ' + user.email;
  } else {
    btn.textContent = '👤';
    btn.style.background = '';
    btn.style.color = '';
    btn.title = 'Connexion / Inscription';
  }

  // Update project indicator
  const projInd = document.getElementById('projectIndicator');
  if (projInd) {
    projInd.textContent = _currentProject ? '📁 ' + _currentProject.name : '';
    projInd.style.display = _currentProject ? 'block' : 'none';
  }
}

function toggleUserMenu() {
  const user = API.user();
  if (!user) { showAuthModal('login'); return; }

  document.getElementById('userDrop')?.remove();
  const dd = document.createElement('div');
  dd.id = 'userDrop';
  dd.style.cssText = 'position:fixed;top:54px;right:10px;z-index:5000;background:#0d1421;' +
    'border:1px solid #1e3a5f;border-radius:14px;padding:8px;box-shadow:0 8px 30px rgba(0,0,0,.5);min-width:220px';

  const mi = (icon, label, fn, danger = false) =>
    `<button onclick="${fn};document.getElementById('userDrop')?.remove()"
      style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;
      background:transparent;border:none;color:${danger?'#ef4444':'#e2e8f0'};
      font-size:13px;cursor:pointer;border-radius:8px;text-align:left"
      onmouseover="this.style.background='rgba(255,255,255,.05)'"
      onmouseout="this.style.background='transparent'">
      <span>${icon}</span>${label}
    </button>`;

  const projName = _currentProject ? _currentProject.name : 'Aucun projet';
  dd.innerHTML = `
    <div style="padding:10px 12px;border-bottom:1px solid #1e3a5f;margin-bottom:6px">
      <div style="font-size:13px;font-weight:700;color:#e2e8f0">${_esc(user.name)}</div>
      <div style="font-size:11px;color:#8294b5">${_esc(user.email)}</div>
      <div style="font-size:10px;color:#1fd1a8;margin-top:5px">📁 ${_esc(projName)}</div>
    </div>
    ${mi('💾', 'Enregistrer le projet', 'saveProject()')}
    ${mi('📂', 'Ouvrir un projet',      'openProject()')}
    ${mi('➕', 'Nouveau projet',         '_showNewProjectModal()')}
    <div style="height:1px;background:#1e3a5f;margin:6px 0"></div>
    ${mi('🚪', 'Déconnexion', '_doLogout()', true)}`;

  document.body.appendChild(dd);
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!dd.contains(e.target) && e.target !== document.getElementById('btnUser')) {
      dd.remove(); document.removeEventListener('click', h);
    }
  }), 50);
}

async function _doLogout() {
  await API.logout();
  _currentProject = null;
  _updateUserUI();
  _toast('Déconnecté');
}

/* ── Helpers ─────────────────────────────────────────────── */
function _toast(msg, err = false) {
  if (typeof toast === 'function') { toast(msg, err); return; }
  console[err ? 'error' : 'log']('[GTP Cloud]', msg);
}
function _esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Boot ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  _updateUserUI();

  // Ctrl+S → save
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveProject(); }
  });

  // Hook drawn layer to mark dirty
  setTimeout(() => {
    if (typeof map !== 'undefined') {
      map.on('draw:created draw:edited draw:deleted', _markDirty);
    }
    // Patch register() to mark dirty
    if (typeof window.register === 'function') {
      const _orig = window.register;
      window.register = function(...a) { const r = _orig.apply(this, a); _markDirty(); return r; };
    }
    // Auto-restore last project
    if (API.loggedIn() && _currentProject?.id) {
      _loadProject(_currentProject.id).catch(() => {});
    }
  }, 600);
});
