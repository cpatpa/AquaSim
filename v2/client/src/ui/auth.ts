import { register, login, loginAsGuest, forgotPassword, type LoginResponse } from '../api/client';

const OVERLAY_STYLES = `
  .auth-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; display:flex; align-items:center; justify-content:center; }
  .auth-panel { background:#0A1520; border:1px solid #1A3A4B; border-radius:8px; width:380px; max-width:90vw; padding:24px; }
  .auth-panel h2 { font-family:'Orbitron',monospace; color:#00E5FF; letter-spacing:1px; margin-bottom:16px; font-size:1.1rem; }
  .auth-field { margin-bottom:10px; }
  .auth-label { display:block; color:#4A7A8A; font-size:0.75rem; margin-bottom:3px; padding-left:2px; }
  .auth-panel input { width:100%; padding:8px 12px; background:#0D1B2A; border:1px solid #1B3A4B; color:#7EE8FA; font-family:inherit; font-size:13px; border-radius:4px; }
  .auth-panel input::placeholder { color:#3A5A6A; }
  .auth-panel input:focus { outline:none; border-color:#00E5FF; }
  .auth-btn { width:100%; padding:10px; border:none; border-radius:4px; font-family:inherit; font-size:13px; cursor:pointer; margin-bottom:8px; }
  .auth-btn-primary { background:#00E5FF; color:#0A1520; font-weight:bold; }
  .auth-btn-primary:hover { background:#33EEFF; }
  .auth-btn-secondary { background:#0D1B2A; border:1px solid #1B3A4B; color:#7EE8FA; }
  .auth-btn-secondary:hover { background:#1B3A4B; }
  .auth-btn-ghost { background:none; border:1px solid #1B3A4B; color:#4A7A8A; }
  .auth-btn-ghost:hover { background:#0D1B2A; color:#7EE8FA; }
  .auth-error { color:#FF6B6B; font-size:0.8rem; margin-bottom:8px; min-height:18px; }
  .auth-link { color:#00E5FF; cursor:pointer; font-size:0.8rem; }
  .auth-link:hover { text-decoration:underline; }
  .auth-divider { text-align:center; color:#3A5A6A; margin:12px 0; font-size:0.8rem; }
  .auth-tabs { display:flex; gap:0; margin-bottom:16px; }
  .auth-tab { flex:1; padding:8px; text-align:center; cursor:pointer; border-bottom:2px solid transparent; color:#4A7A8A; font-size:0.85rem; }
  .auth-tab.active { border-color:#00E5FF; color:#00E5FF; }
  .auth-mfa-input { letter-spacing:0.5em; text-align:center; font-size:1.2rem; }
  .auth-skip { text-align:center; margin-top:4px; }
`;

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = OVERLAY_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

export type AuthResult = { action: 'login'; response: LoginResponse } | { action: 'guest'; response: LoginResponse } | { action: 'skip' };

export function showAuthModal(): Promise<AuthResult> {
  injectStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';

    let mode: 'login' | 'register' | 'forgot' = 'login';

    function close(result: AuthResult): void {
      overlay.remove();
      resolve(result);
    }

    function renderPanel(): void {
      if (mode === 'forgot') {
        overlay.innerHTML = `
          <div class="auth-panel">
            <h2>Reset Password</h2>
            <p style="color:#4A7A8A;font-size:0.8rem;margin-bottom:12px;">Enter the email address you registered with and we'll send you a reset link.</p>
            <div class="auth-error" id="auth-err"></div>
            <div class="auth-field">
              <label class="auth-label">Email address</label>
              <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email">
            </div>
            <button class="auth-btn auth-btn-primary" id="auth-submit">Send Reset Link</button>
            <div style="text-align:center;margin-top:8px;">
              <span class="auth-link" id="auth-back">Back to login</span>
            </div>
          </div>`;

        overlay.querySelector('#auth-submit')!.addEventListener('click', async () => {
          const email = (overlay.querySelector('#auth-email') as HTMLInputElement).value;
          const errEl = overlay.querySelector('#auth-err') as HTMLElement;
          if (!email) { errEl.textContent = 'Enter your email'; return; }
          try {
            const msg = await forgotPassword(email);
            errEl.style.color = '#88FF88';
            errEl.textContent = msg;
          } catch (e) {
            errEl.textContent = (e as Error).message;
          }
        });
        overlay.querySelector('#auth-back')!.addEventListener('click', () => { mode = 'login'; renderPanel(); });
        return;
      }

      overlay.innerHTML = `
        <div class="auth-panel">
          <h2>AquaSim</h2>
          <div class="auth-tabs">
            <div class="auth-tab ${mode === 'login' ? 'active' : ''}" id="tab-login">Login</div>
            <div class="auth-tab ${mode === 'register' ? 'active' : ''}" id="tab-register">Create Account</div>
          </div>
          <div class="auth-error" id="auth-err"></div>
          ${mode === 'register' ? `
            <div class="auth-field">
              <label class="auth-label">Username</label>
              <input type="text" id="auth-user" placeholder="Choose a username" autocomplete="username">
            </div>
            <div class="auth-field">
              <label class="auth-label">Email</label>
              <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email">
            </div>
            <div class="auth-field">
              <label class="auth-label">Password</label>
              <input type="password" id="auth-pass" placeholder="Minimum 8 characters" autocomplete="new-password">
            </div>
          ` : `
            <div class="auth-field">
              <label class="auth-label">Username</label>
              <input type="text" id="auth-user" placeholder="Your username" autocomplete="username">
            </div>
            <div class="auth-field">
              <label class="auth-label">Password</label>
              <input type="password" id="auth-pass" placeholder="Your password" autocomplete="current-password">
            </div>
          `}
          <div id="auth-mfa-row" style="display:none;">
            <div class="auth-field">
              <label class="auth-label">MFA Code</label>
              <input type="text" id="auth-mfa" class="auth-mfa-input" placeholder="6-digit code" maxlength="6" autocomplete="one-time-code">
            </div>
          </div>
          <button class="auth-btn auth-btn-primary" id="auth-submit">${mode === 'register' ? 'Create Account' : 'Login'}</button>
          ${mode === 'login' ? '<div style="text-align:right;margin-bottom:8px;"><span class="auth-link" id="auth-forgot">Forgot password?</span></div>' : ''}
          <div class="auth-divider">or</div>
          <button class="auth-btn auth-btn-secondary" id="auth-guest">Play as Guest</button>
          <div class="auth-skip"><span class="auth-link" id="auth-skip">Skip for now</span></div>
        </div>`;

      overlay.querySelector('#tab-login')!.addEventListener('click', () => { mode = 'login'; renderPanel(); });
      overlay.querySelector('#tab-register')!.addEventListener('click', () => { mode = 'register'; renderPanel(); });

      const forgotEl = overlay.querySelector('#auth-forgot');
      if (forgotEl) forgotEl.addEventListener('click', () => { mode = 'forgot'; renderPanel(); });

      const skipEl = overlay.querySelector('#auth-skip');
      if (skipEl) skipEl.addEventListener('click', () => { close({ action: 'skip' }); });

      overlay.querySelector('#auth-guest')!.addEventListener('click', async () => {
        try {
          const resp = await loginAsGuest();
          close({ action: 'guest', response: resp });
        } catch (e) {
          overlay.querySelector('#auth-err')!.textContent = (e as Error).message;
        }
      });

      overlay.querySelector('#auth-submit')!.addEventListener('click', async () => {
        const errEl = overlay.querySelector('#auth-err') as HTMLElement;
        const userEl = overlay.querySelector('#auth-user') as HTMLInputElement;
        const passEl = overlay.querySelector('#auth-pass') as HTMLInputElement;
        const emailEl = overlay.querySelector('#auth-email') as HTMLInputElement | null;
        const mfaEl = overlay.querySelector('#auth-mfa') as HTMLInputElement | null;

        errEl.textContent = '';

        if (mode === 'register') {
          if (!userEl.value || !passEl.value || !emailEl?.value) {
            errEl.textContent = 'All fields are required';
            return;
          }
          if (passEl.value.length < 8) {
            errEl.textContent = 'Password must be at least 8 characters';
            return;
          }
          try {
            const resp = await register(userEl.value, emailEl.value, passEl.value);
            close({ action: 'login', response: resp });
          } catch (e) {
            errEl.textContent = (e as Error).message;
          }
        } else {
          if (!userEl.value || !passEl.value) {
            errEl.textContent = 'Username and password required';
            return;
          }
          try {
            const resp = await login(userEl.value, passEl.value, mfaEl?.value || undefined);
            if (resp.mfaRequired) {
              (overlay.querySelector('#auth-mfa-row') as HTMLElement).style.display = 'block';
              (overlay.querySelector('#auth-mfa') as HTMLInputElement).focus();
              errEl.textContent = 'Enter your MFA code';
              errEl.style.color = '#88FF88';
              return;
            }
            close({ action: 'login', response: resp });
          } catch (e) {
            errEl.textContent = (e as Error).message;
          }
        }
      });

      const passEl = overlay.querySelector('#auth-pass') as HTMLInputElement;
      passEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (overlay.querySelector('#auth-submit') as HTMLButtonElement).click();
      });

      setTimeout(() => {
        (overlay.querySelector('#auth-user') as HTMLInputElement)?.focus();
      }, 50);
    }

    renderPanel();
    document.body.appendChild(overlay);
  });
}

export function showMfaPrompt(): Promise<string | null> {
  injectStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-panel">
        <h2>MFA Verification</h2>
        <div class="auth-error" id="mfa-err"></div>
        <input type="text" id="mfa-code" class="auth-mfa-input" placeholder="6-digit code" maxlength="6" autocomplete="one-time-code">
        <button class="auth-btn auth-btn-primary" id="mfa-submit">Verify</button>
        <button class="auth-btn auth-btn-ghost" id="mfa-cancel">Cancel</button>
      </div>`;

    overlay.querySelector('#mfa-submit')!.addEventListener('click', () => {
      const code = (overlay.querySelector('#mfa-code') as HTMLInputElement).value;
      if (code.length !== 6) {
        overlay.querySelector('#mfa-err')!.textContent = 'Enter a 6-digit code';
        return;
      }
      overlay.remove();
      resolve(code);
    });

    overlay.querySelector('#mfa-cancel')!.addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    document.body.appendChild(overlay);
    setTimeout(() => (overlay.querySelector('#mfa-code') as HTMLInputElement).focus(), 50);
  });
}
