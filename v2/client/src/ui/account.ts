import {
  getUser, logout, setupMfa, verifyMfa, disableMfa,
  promoteGuest, resetPassword,
} from '../api/client';

const ACCT_STYLES = `
  .acct-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:970; display:flex; align-items:center; justify-content:center; }
  .acct-panel { background:#0A1520; border:1px solid #1A3A4B; border-radius:8px; width:420px; max-width:90vw; max-height:80vh; display:flex; flex-direction:column; }
  .acct-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #1A3A4B; }
  .acct-header h2 { font-family:'Orbitron',monospace; color:#00E5FF; font-size:1rem; letter-spacing:1px; }
  .acct-close { background:none; border:none; color:#4A7A8A; font-size:1.5rem; cursor:pointer; }
  .acct-close:hover { color:#FF6B6B; }
  .acct-body { padding:16px 20px; overflow-y:auto; flex:1; }
  .acct-section { margin-bottom:20px; }
  .acct-section-title { color:#7EE8FA; font-size:0.85rem; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #1A3A4B; padding-bottom:6px; }
  .acct-field { color:#4A7A8A; font-size:0.8rem; margin-bottom:6px; }
  .acct-field span { color:#7EE8FA; }
  .acct-input { width:100%; padding:8px 12px; background:#0D1B2A; border:1px solid #1B3A4B; color:#7EE8FA; font-family:inherit; font-size:13px; border-radius:4px; margin-bottom:8px; }
  .acct-input:focus { outline:none; border-color:#00E5FF; }
  .acct-input::placeholder { color:#3A5A6A; }
  .acct-btn { padding:8px 16px; border:none; border-radius:4px; font-family:inherit; font-size:0.8rem; cursor:pointer; margin-right:6px; margin-bottom:6px; }
  .acct-btn-primary { background:#00E5FF; color:#0A1520; font-weight:bold; }
  .acct-btn-primary:hover { background:#33EEFF; }
  .acct-btn-danger { background:#FF6B6B22; color:#FF6B6B; border:1px solid #FF6B6B33; }
  .acct-btn-danger:hover { background:#FF6B6B44; }
  .acct-btn-secondary { background:#0D1B2A; color:#7EE8FA; border:1px solid #1B3A4B; }
  .acct-btn-secondary:hover { background:#1B3A4B; }
  .acct-msg { font-size:0.8rem; margin-bottom:8px; min-height:18px; }
  .acct-msg-ok { color:#88FF88; }
  .acct-msg-err { color:#FF6B6B; }
  .acct-badge { display:inline-block; padding:2px 8px; border-radius:8px; font-size:0.7rem; margin-left:6px; }
  .acct-badge-on { background:#22c55e33; color:#22c55e; }
  .acct-badge-off { background:#1B3A4B; color:#4A7A8A; }
  .acct-qr { display:block; margin:8px auto; max-width:200px; border-radius:4px; }
  .acct-mfa-code { letter-spacing:0.5em; text-align:center; font-size:1.1rem; }
`;

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = ACCT_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

export interface AccountCallbacks {
  onLogout: () => void;
  onClose: () => void;
}

export function openAccount(callbacks: AccountCallbacks): void {
  injectStyles();

  const user = getUser();
  if (!user) return;

  const overlay = document.createElement('div');
  overlay.className = 'acct-overlay';

  function close(): void {
    overlay.remove();
    callbacks.onClose();
  }

  function renderPanel(): void {
    const isGuest = user!.role === 'guest';

    overlay.innerHTML = `
      <div class="acct-panel">
        <div class="acct-header">
          <h2>Account</h2>
          <button class="acct-close">&times;</button>
        </div>
        <div class="acct-body">
          <div class="acct-section">
            <div class="acct-section-title">Profile</div>
            <div class="acct-field">Username: <span>${escapeHtml(user!.username)}</span></div>
            <div class="acct-field">Role: <span>${user!.role}</span></div>
            <div class="acct-field">Saves: <span>${user!.saveCount}/${user!.saveLimit}</span></div>
            <div class="acct-field">Joined: <span>${formatDate(user!.createdAt)}</span></div>
          </div>

          ${isGuest ? `
            <div class="acct-section">
              <div class="acct-section-title">Upgrade Account</div>
              <p class="acct-field">Create a full account to unlock 10 saves, MFA, and leaderboard access.</p>
              <div class="acct-msg" id="acct-promote-msg"></div>
              <input class="acct-input" id="acct-promote-user" placeholder="Username">
              <input class="acct-input" id="acct-promote-email" type="email" placeholder="Email">
              <input class="acct-input" id="acct-promote-pass" type="password" placeholder="Password (min 8 chars)">
              <button class="acct-btn acct-btn-primary" id="acct-promote-btn">Create Account</button>
            </div>
          ` : `
            <div class="acct-section">
              <div class="acct-section-title">
                Multi-Factor Authentication
                <span class="acct-badge ${user!.mfaEnabled ? 'acct-badge-on' : 'acct-badge-off'}">
                  ${user!.mfaEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div class="acct-msg" id="acct-mfa-msg"></div>
              <div id="acct-mfa-content">
                ${user!.mfaEnabled ? `
                  <p class="acct-field">Enter your current TOTP code to disable MFA.</p>
                  <input class="acct-input acct-mfa-code" id="acct-mfa-code" maxlength="6" placeholder="6-digit code">
                  <button class="acct-btn acct-btn-danger" id="acct-mfa-disable">Disable MFA</button>
                ` : `
                  <button class="acct-btn acct-btn-primary" id="acct-mfa-setup">Set Up MFA</button>
                `}
              </div>
            </div>

            <div class="acct-section">
              <div class="acct-section-title">Change Password</div>
              <div class="acct-msg" id="acct-pass-msg"></div>
              <input class="acct-input" id="acct-new-pass" type="password" placeholder="New password (min 8 chars)">
              <input class="acct-input" id="acct-confirm-pass" type="password" placeholder="Confirm new password">
              <button class="acct-btn acct-btn-secondary" id="acct-change-pass">Update Password</button>
            </div>
          `}

          <div class="acct-section" style="border-top:1px solid #1A3A4B; padding-top:16px;">
            <button class="acct-btn acct-btn-danger" id="acct-logout">Logout</button>
          </div>
        </div>
      </div>`;

    overlay.querySelector('.acct-close')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('#acct-logout')!.addEventListener('click', async () => {
      try { await logout(); } catch { /* proceed anyway */ }
      close();
      callbacks.onLogout();
    });

    if (isGuest) {
      wirePromoteGuest();
    } else {
      wireMfa();
      wireChangePassword();
    }
  }

  function wirePromoteGuest(): void {
    const btn = overlay.querySelector('#acct-promote-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const msg = overlay.querySelector('#acct-promote-msg')!;
      const u = (overlay.querySelector('#acct-promote-user') as HTMLInputElement).value;
      const e = (overlay.querySelector('#acct-promote-email') as HTMLInputElement).value;
      const p = (overlay.querySelector('#acct-promote-pass') as HTMLInputElement).value;
      msg.className = 'acct-msg';
      msg.textContent = '';
      if (!u || !e || !p) { msg.className = 'acct-msg acct-msg-err'; msg.textContent = 'All fields required'; return; }
      if (p.length < 8) { msg.className = 'acct-msg acct-msg-err'; msg.textContent = 'Password must be at least 8 characters'; return; }
      try {
        await promoteGuest(u, e, p);
        msg.className = 'acct-msg acct-msg-ok';
        msg.textContent = 'Account upgraded!';
        setTimeout(() => renderPanel(), 1500);
      } catch (err) {
        msg.className = 'acct-msg acct-msg-err';
        msg.textContent = (err as Error).message;
      }
    });
  }

  function wireMfa(): void {
    const setupBtn = overlay.querySelector('#acct-mfa-setup');
    if (setupBtn) {
      setupBtn.addEventListener('click', async () => {
        const msg = overlay.querySelector('#acct-mfa-msg')!;
        const content = overlay.querySelector('#acct-mfa-content')!;
        try {
          const { uri } = await setupMfa();
          content.innerHTML = `
            <p class="acct-field">Scan this QR code with your authenticator app, then enter the code below.</p>
            <img class="acct-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}" alt="MFA QR Code">
            <input class="acct-input acct-mfa-code" id="acct-mfa-verify" maxlength="6" placeholder="6-digit code">
            <button class="acct-btn acct-btn-primary" id="acct-mfa-confirm">Verify & Enable</button>
          `;
          content.querySelector('#acct-mfa-confirm')!.addEventListener('click', async () => {
            const code = (content.querySelector('#acct-mfa-verify') as HTMLInputElement).value;
            if (code.length !== 6) { msg.className = 'acct-msg acct-msg-err'; msg.textContent = 'Enter a 6-digit code'; return; }
            try {
              await verifyMfa(code);
              msg.className = 'acct-msg acct-msg-ok';
              msg.textContent = 'MFA enabled!';
              setTimeout(() => renderPanel(), 1500);
            } catch (err) {
              msg.className = 'acct-msg acct-msg-err';
              msg.textContent = (err as Error).message;
            }
          });
        } catch (err) {
          msg.className = 'acct-msg acct-msg-err';
          msg.textContent = (err as Error).message;
        }
      });
    }

    const disableBtn = overlay.querySelector('#acct-mfa-disable');
    if (disableBtn) {
      disableBtn.addEventListener('click', async () => {
        const msg = overlay.querySelector('#acct-mfa-msg')!;
        const code = (overlay.querySelector('#acct-mfa-code') as HTMLInputElement).value;
        if (code.length !== 6) { msg.className = 'acct-msg acct-msg-err'; msg.textContent = 'Enter a 6-digit code'; return; }
        try {
          await disableMfa(code);
          msg.className = 'acct-msg acct-msg-ok';
          msg.textContent = 'MFA disabled';
          setTimeout(() => renderPanel(), 1500);
        } catch (err) {
          msg.className = 'acct-msg acct-msg-err';
          msg.textContent = (err as Error).message;
        }
      });
    }
  }

  function wireChangePassword(): void {
    const btn = overlay.querySelector('#acct-change-pass');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const msg = overlay.querySelector('#acct-pass-msg')!;
      const newPass = (overlay.querySelector('#acct-new-pass') as HTMLInputElement).value;
      const confirm = (overlay.querySelector('#acct-confirm-pass') as HTMLInputElement).value;
      msg.className = 'acct-msg';
      msg.textContent = '';
      if (!newPass) { msg.className = 'acct-msg acct-msg-err'; msg.textContent = 'Enter a new password'; return; }
      if (newPass.length < 8) { msg.className = 'acct-msg acct-msg-err'; msg.textContent = 'Password must be at least 8 characters'; return; }
      if (newPass !== confirm) { msg.className = 'acct-msg acct-msg-err'; msg.textContent = 'Passwords do not match'; return; }
      try {
        await resetPassword('', newPass);
        msg.className = 'acct-msg acct-msg-ok';
        msg.textContent = 'Password updated';
        (overlay.querySelector('#acct-new-pass') as HTMLInputElement).value = '';
        (overlay.querySelector('#acct-confirm-pass') as HTMLInputElement).value = '';
      } catch (err) {
        msg.className = 'acct-msg acct-msg-err';
        msg.textContent = (err as Error).message;
      }
    });
  }

  renderPanel();
  document.body.appendChild(overlay);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
