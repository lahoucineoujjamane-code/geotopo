/* ============================================================
   GeoTopo Pro — Auth & Trial Manager v1.0
   Système de connexion + période d'essai 14 jours
   Entièrement côté client (localStorage)
   ============================================================ */
(function () {
  'use strict';

  const TRIAL_DAYS = 14;
  const K  = 'gtp_auth_v1';
  const SK = 'gtp_sess_v1';

  /* ─── Utilitaires ─── */
  async function sha256(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function loadData()    { try { return JSON.parse(localStorage.getItem(K) || 'null'); } catch { return null; } }
  function saveData(d)   { localStorage.setItem(K, JSON.stringify(d)); }
  function getSession()  { return localStorage.getItem(SK); }
  function saveSession(e){ localStorage.setItem(SK, e); }
  function clearSession(){ localStorage.removeItem(SK); }

  function daysLeft(d) {
    if (!d || !d.trialStart) return 0;
    return Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - d.trialStart) / 86400000));
  }

  /* ─── CSS injecté ─── */
  const AUTH_CSS = `
  /* ── Overlay principal ── */
  #gtp-auth {
    position: fixed; inset: 0; z-index: 99999;
    background: linear-gradient(135deg, #060e1a 0%, #0a1628 60%, #04080f 100%);
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  #gtp-auth * { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Carte ── */
  .ga-card {
    background: #141d2e; border: 1px solid #2a3a5a; border-radius: 22px;
    width: 92%; max-width: 400px; padding: 30px 24px 26px;
    box-shadow: 0 24px 80px rgba(0,0,0,.75);
    animation: ga-pop .35s cubic-bezier(.4,0,.2,1);
  }
  @keyframes ga-pop { from { opacity:0; transform:translateY(18px) scale(.97) } }

  /* ── Logo ── */
  .ga-logo { display:flex; align-items:center; gap:10px; margin-bottom:6px }
  .ga-tri  { width:0; height:0; border-left:11px solid transparent; border-right:11px solid transparent; border-bottom:19px solid #1fd1a8; flex-shrink:0 }
  .ga-name { font-size:20px; font-weight:800; color:#eaf0fa; letter-spacing:-.3px }
  .ga-name b { color:#1fd1a8 }
  .ga-ver  { font-size:10px; color:#8294b5; font-weight:600; letter-spacing:1px; margin-left:3px }
  .ga-tagline { font-size:12px; color:#8294b5; margin-bottom:20px; padding-left:2px }

  /* ── Badge essai ── */
  .ga-badge {
    display: inline-flex; align-items:center; gap:5px;
    background: rgba(31,209,168,.1); border: 1px solid rgba(31,209,168,.28);
    border-radius: 999px; padding: 5px 12px;
    font-size: 11px; font-weight: 700; color: #1fd1a8; margin-bottom: 20px;
  }

  /* ── Onglets Login / Inscription ── */
  .ga-tabs {
    display: flex; background: #0d1421; border-radius: 11px; padding: 3px;
    margin-bottom: 20px; border: 1px solid #2a3a5a; gap: 3px;
  }
  .ga-tab {
    flex: 1; text-align: center; padding: 10px; border-radius: 9px;
    font-size: 13px; font-weight: 600; color: #8294b5; cursor: pointer; transition: .15s;
  }
  .ga-tab.on { background: #1fd1a8; color: #04231d; }

  /* ── Formulaires ── */
  .ga-form   { display: flex; flex-direction: column; gap: 11px; }
  .ga-inp    {
    background: #0d1421; border: 1px solid #2a3a5a; color: #eaf0fa;
    padding: 13px 14px; border-radius: 11px; font-size: 14px;
    font-family: inherit; width: 100%; outline: none; transition: border-color .15s;
  }
  .ga-inp:focus   { border-color: #1fd1a8; }
  .ga-inp::placeholder { color: #4a5a78; }
  .ga-btn {
    padding: 14px; border-radius: 11px; border: none;
    background: linear-gradient(135deg, #1fd1a8, #0eb890);
    color: #04231d; font-size: 15px; font-weight: 700;
    cursor: pointer; transition: .12s; letter-spacing: .2px;
  }
  .ga-btn:active   { transform: scale(.98); }
  .ga-btn:disabled { opacity: .45; cursor: not-allowed; }
  .ga-btn.sec {
    background: transparent; border: 1px solid #2a3a5a;
    color: #eaf0fa; font-weight: 600;
  }
  .ga-btn.sec:hover { border-color: #1fd1a8; color: #1fd1a8; }
  .ga-err  { color: #ef4444; font-size: 12px; text-align: center; min-height: 14px; line-height: 1.5; }
  .ga-note { font-size: 11px; color: #8294b5; text-align: center; margin-top: 2px; }
  .ga-note a { color: #1fd1a8; cursor: pointer; }
  .ga-hr   { border: none; border-top: 1px solid #2a3a5a; margin: 6px 0; }

  /* ── Écran expiré ── */
  .ga-expired { text-align: center; padding: 8px 0; }
  .ga-exp-ico { font-size: 52px; margin-bottom: 14px; }
  .ga-exp-ttl { color: #eaf0fa; font-size: 20px; font-weight: 800; margin-bottom: 8px; }
  .ga-exp-sub { color: #8294b5; font-size: 13px; line-height: 1.6; margin-bottom: 22px; }
  .ga-exp-days { font-size: 13px; color: #ef4444; font-weight: 700; margin-bottom: 6px; }

  /* ── Chip utilisateur (topbar) ── */
  #gtp-user-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #1c2840; border: 1px solid #2a3a5a;
    border-radius: 999px; padding: 6px 10px 6px 8px;
    font-size: 11px; font-weight: 700; color: #eaf0fa;
    cursor: pointer; transition: border-color .15s;
    pointer-events: auto;
  }
  #gtp-user-chip:hover { border-color: #1fd1a8; }
  #gtp-user-chip .av {
    width: 22px; height: 22px; border-radius: 50%;
    background: #1fd1a8; color: #04231d;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; flex-shrink: 0;
  }
  #gtp-user-chip .trial-days {
    background: rgba(245,166,35,.18); color: #f5a623;
    border-radius: 999px; padding: 2px 7px;
    font-size: 10px; font-weight: 800; border: 1px solid rgba(245,166,35,.3);
  }
  #gtp-user-chip .trial-days.ok { background:rgba(31,209,168,.15); color:#1fd1a8; border-color:rgba(31,209,168,.3); }
  `;

  /* ─── HTML de l'overlay ─── */
  function buildHTML() {
    return `
    <div class="ga-card">

      <!-- Logo -->
      <div class="ga-logo">
        <div class="ga-tri"></div>
        <div class="ga-name">GeoTopo <b>Pro</b><span class="ga-ver">v2.1</span></div>
      </div>
      <div class="ga-tagline">Outil topographique professionnel</div>

      <!-- Badge essai -->
      <div class="ga-badge">🎁 Essai gratuit 14 jours — sans carte bancaire</div>

      <!-- ── Écran LOGIN / INSCRIPTION ── -->
      <div id="ga-main">
        <div class="ga-tabs">
          <div class="ga-tab on" id="ga-tab-login">Se connecter</div>
          <div class="ga-tab"    id="ga-tab-reg"  >Créer un compte</div>
        </div>

        <!-- Formulaire CONNEXION -->
        <div id="ga-f-login" class="ga-form">
          <input class="ga-inp" id="ga-l-email" type="email"    placeholder="Adresse e-mail"   autocomplete="email">
          <input class="ga-inp" id="ga-l-pass"  type="password" placeholder="Mot de passe"     autocomplete="current-password">
          <div class="ga-err" id="ga-l-err"></div>
          <button class="ga-btn" id="ga-l-btn">Se connecter →</button>
          <p class="ga-note">Pas encore de compte ? <a id="ga-to-reg">Créer un compte</a></p>
        </div>

        <!-- Formulaire INSCRIPTION -->
        <div id="ga-f-reg" class="ga-form" style="display:none">
          <input class="ga-inp" id="ga-r-email"  type="email"    placeholder="Adresse e-mail"            autocomplete="email">
          <input class="ga-inp" id="ga-r-pass"   type="password" placeholder="Mot de passe (min. 6 car.)" autocomplete="new-password">
          <input class="ga-inp" id="ga-r-pass2"  type="password" placeholder="Confirmer le mot de passe"  autocomplete="new-password">
          <div class="ga-err" id="ga-r-err"></div>
          <button class="ga-btn" id="ga-r-btn">Créer mon compte &amp; Démarrer l'essai</button>
          <p class="ga-note">Déjà un compte ? <a id="ga-to-login">Se connecter</a></p>
        </div>
      </div>

      <!-- ── Écran EXPIRÉ ── -->
      <div id="ga-expired" style="display:none">
        <div class="ga-expired">
          <div class="ga-exp-ico">⏰</div>
          <div class="ga-exp-ttl">Période d'essai terminée</div>
          <div class="ga-exp-days">Votre essai de 14 jours est expiré</div>
          <div class="ga-exp-sub">
            Contactez-nous pour obtenir une licence complète<br>et continuer à utiliser GeoTopo Pro.
          </div>
          <button class="ga-btn" style="margin-bottom:10px"
            onclick="window.open('mailto:lahoucineoujjamane@gmail.com?subject=GeoTopo%20Pro%20%E2%80%94%20Demande%20de%20licence','_blank')">
            📧 Demander une licence
          </button>
          <hr class="ga-hr">
          <button class="ga-btn sec" style="margin-top:10px" id="ga-switch-acc">Utiliser un autre compte</button>
        </div>
      </div>

    </div>`;
  }

  /* ─── Injecter CSS ─── */
  function injectCSS() {
    const s = document.createElement('style');
    s.id = 'gtp-auth-css';
    s.textContent = AUTH_CSS;
    document.head.appendChild(s);
  }

  /* ─── Afficher / cacher l'overlay ─── */
  function showOverlay() {
    let el = document.getElementById('gtp-auth');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gtp-auth';
      el.innerHTML = buildHTML();
      document.body.appendChild(el);
      bindFormEvents();
    }
    el.style.display = 'flex';
  }

  function hideOverlay() {
    const el = document.getElementById('gtp-auth');
    if (!el) return;
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 420);
  }

  function showScreen(name) {
    const main    = document.getElementById('ga-main');
    const expired = document.getElementById('ga-expired');
    if (!main || !expired) return;
    if (name === 'expired') {
      main.style.display    = 'none';
      expired.style.display = '';
    } else {
      main.style.display    = '';
      expired.style.display = 'none';
      switchTab(name === 'register' ? 'reg' : 'login');
    }
  }

  function switchTab(to) {
    const isReg = (to === 'reg');
    const fLogin = document.getElementById('ga-f-login');
    const fReg   = document.getElementById('ga-f-reg');
    const tLogin = document.getElementById('ga-tab-login');
    const tReg   = document.getElementById('ga-tab-reg');
    if (fLogin) fLogin.style.display = isReg ? 'none' : '';
    if (fReg)   fReg.style.display   = isReg ? '' : 'none';
    if (tLogin) tLogin.classList.toggle('on', !isReg);
    if (tReg)   tReg.classList.toggle('on',   isReg);
  }

  /* ─── Chip utilisateur ─── */
  function addUserChip(data) {
    if (document.getElementById('gtp-user-chip')) return;
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const dl      = daysLeft(data);
    const initial = (data.email || 'U').charAt(0).toUpperCase();
    const chip    = document.createElement('div');
    chip.id = 'gtp-user-chip';
    chip.innerHTML = `
      <div class="av">${initial}</div>
      <span class="trial-days ${dl > 3 ? 'ok' : ''}">${dl}j</span>
    `;
    chip.title = `${data.email}\n${dl} jour(s) restant(s) sur ${TRIAL_DAYS}`;
    chip.onclick = () => {
      if (confirm(`Déconnexion de ${data.email} ?`)) {
        clearSession();
        location.reload();
      }
    };
    // Insérer avant le premier bouton icône
    const firstBtn = topbar.querySelector('.icobtn');
    if (firstBtn) topbar.insertBefore(chip, firstBtn);
    else topbar.appendChild(chip);
  }

  /* ─── Liaison des événements ─── */
  function bindFormEvents() {
    /* Onglets */
    document.getElementById('ga-tab-login').onclick  = () => switchTab('login');
    document.getElementById('ga-tab-reg').onclick    = () => switchTab('reg');
    document.getElementById('ga-to-reg')?.addEventListener('click', () => switchTab('reg'));
    document.getElementById('ga-to-login')?.addEventListener('click', () => switchTab('login'));

    /* ── CONNEXION ── */
    const lBtn = document.getElementById('ga-l-btn');
    lBtn.onclick = async () => {
      const email = document.getElementById('ga-l-email').value.trim();
      const pass  = document.getElementById('ga-l-pass').value;
      const errEl = document.getElementById('ga-l-err');
      errEl.textContent = '';

      if (!email || !pass) { errEl.textContent = 'Veuillez remplir tous les champs.'; return; }

      const d = loadData();
      if (!d) { errEl.textContent = 'Aucun compte trouvé. Créez un compte.'; switchTab('reg'); return; }
      if (d.email.toLowerCase() !== email.toLowerCase()) { errEl.textContent = 'E-mail incorrect.'; return; }

      lBtn.disabled = true; lBtn.textContent = '…';
      const hash = await sha256(pass);
      lBtn.disabled = false; lBtn.textContent = 'Se connecter →';

      if (d.passHash !== hash) { errEl.textContent = 'Mot de passe incorrect.'; return; }

      saveSession(email);
      if (daysLeft(d) <= 0) { showScreen('expired'); return; }
      hideOverlay();
      addUserChip(d);
    };

    /* Enter → submit login */
    ['ga-l-email','ga-l-pass'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => { if (e.key==='Enter') lBtn.click(); });
    });

    /* ── INSCRIPTION ── */
    const rBtn = document.getElementById('ga-r-btn');
    rBtn.onclick = async () => {
      const email = document.getElementById('ga-r-email').value.trim();
      const pass  = document.getElementById('ga-r-pass').value;
      const pass2 = document.getElementById('ga-r-pass2').value;
      const errEl = document.getElementById('ga-r-err');
      errEl.textContent = '';

      if (!email || !pass || !pass2)        { errEl.textContent = 'Veuillez remplir tous les champs.'; return; }
      if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { errEl.textContent = 'Adresse e-mail invalide.'; return; }
      if (pass.length < 6)                   { errEl.textContent = 'Mot de passe trop court (min. 6 caractères).'; return; }
      if (pass !== pass2)                    { errEl.textContent = 'Les mots de passe ne correspondent pas.'; return; }
      if (loadData())                        { errEl.textContent = 'Un compte existe déjà. Connectez-vous.'; switchTab('login'); return; }

      rBtn.disabled = true; rBtn.textContent = '…';
      const hash = await sha256(pass);
      rBtn.disabled = false; rBtn.textContent = "Créer mon compte & Démarrer l'essai";

      const newData = { email, passHash: hash, trialStart: Date.now() };
      saveData(newData);
      saveSession(email);
      hideOverlay();
      addUserChip(newData);
    };

    /* Enter → submit register */
    ['ga-r-email','ga-r-pass','ga-r-pass2'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => { if (e.key==='Enter') rBtn.click(); });
    });

    /* ── EXPIRÉ — changer de compte ── */
    document.getElementById('ga-switch-acc')?.addEventListener('click', () => {
      clearSession();
      localStorage.removeItem(K);
      showScreen('register');
    });
  }

  /* ─── Initialisation ─── */
  function init() {
    injectCSS();
    const d = loadData();
    const s = getSession();

    if (s && d) {
      /* Session existante */
      if (daysLeft(d) > 0) {
        /* Essai valide → laisser l'app se charger */
        setTimeout(() => addUserChip(d), 600);
      } else {
        /* Essai expiré */
        showOverlay();
        showScreen('expired');
      }
    } else {
      /* Pas de session → afficher login ou inscription */
      showOverlay();
      showScreen(d ? 'login' : 'register');
    }
  }

  /* ─── API publique ─── */
  window.GTP_AUTH = {
    daysLeft : () => daysLeft(loadData()),
    getData  : loadData,
    logout   : () => { clearSession(); location.reload(); }
  };

  /* Lancer dès que le DOM est prêt */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
