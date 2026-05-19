let accessToken: string | null = null;
let currentUser: UserPublic | null = null;

export interface UserPublic {
  id: string;
  username: string;
  role: 'user' | 'admin' | 'guest';
  mfaEnabled: boolean;
  saveCount: number;
  saveLimit: number;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: UserPublic;
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface SimulationSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: 'private' | 'public' | 'link';
  generation: number;
  createdAt: string;
  updatedAt: string;
  ownerUsername: string;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  generation: number;
  achievedAt: string;
  simulationName: string;
}

export function getToken(): string | null {
  return accessToken;
}

export function getUser(): UserPublic | null {
  return currentUser;
}

export function isLoggedIn(): boolean {
  return accessToken !== null;
}

export function isAdmin(): boolean {
  return currentUser?.role === 'admin';
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.token;
    if (data.user) {
      currentUser = data.user;
    }
    return true;
  } catch {
    return false;
  }
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(path, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && accessToken) {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${accessToken}`);
      res = await fetch(path, { ...options, headers, credentials: 'include' });
    }
  }

  return res;
}

export async function register(username: string, email: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Registration failed');
  }
  const data: LoginResponse = await res.json();
  accessToken = data.token;
  currentUser = data.user;
  return data;
}

export async function login(username: string, password: string, mfaCode?: string): Promise<LoginResponse> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, mfaCode }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  const data: LoginResponse = await res.json();
  if (!data.mfaRequired) {
    accessToken = data.token;
    currentUser = data.user;
  }
  return data;
}

export async function loginAsGuest(): Promise<LoginResponse> {
  const res = await apiFetch('/api/auth/guest', { method: 'POST' });
  if (!res.ok) throw new Error('Guest login failed');
  const data: LoginResponse = await res.json();
  accessToken = data.token;
  currentUser = data.user;
  return data;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  accessToken = null;
  currentUser = null;
}

export async function tryRestoreSession(): Promise<boolean> {
  return refreshToken();
}

export async function promoteGuest(username: string, email: string, password: string): Promise<void> {
  const res = await apiFetch('/api/auth/promote', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Promotion failed');
  }
  const data = await res.json();
  accessToken = data.token;
  if (currentUser) {
    currentUser.username = username;
    currentUser.role = 'user';
    currentUser.saveLimit = 10;
  }
}

export async function forgotPassword(email: string): Promise<string> {
  const res = await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  return data.message;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Reset failed');
  }
}

export async function setupMfa(): Promise<{ secret: string; uri: string }> {
  const res = await apiFetch('/api/auth/mfa/setup', { method: 'POST' });
  if (!res.ok) throw new Error('MFA setup failed');
  return res.json();
}

export async function verifyMfa(code: string): Promise<void> {
  const res = await apiFetch('/api/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Verification failed');
  }
  if (currentUser) currentUser.mfaEnabled = true;
}

export async function disableMfa(code: string): Promise<void> {
  const res = await apiFetch('/api/auth/mfa/disable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Disable MFA failed');
  }
  if (currentUser) currentUser.mfaEnabled = false;
}

export async function listSimulations(): Promise<SimulationSummary[]> {
  const res = await apiFetch('/api/simulations');
  if (!res.ok) throw new Error('Failed to list simulations');
  return res.json();
}

export async function saveSimulation(name: string, state: unknown, description?: string, visibility?: string): Promise<{ id: string }> {
  const res = await apiFetch('/api/simulations', {
    method: 'POST',
    body: JSON.stringify({ name, state, description, visibility }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Save failed');
  }
  if (currentUser) currentUser.saveCount++;
  return res.json();
}

export async function updateSimulation(id: string, state: unknown): Promise<void> {
  const res = await apiFetch(`/api/simulations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error('Update failed');
}

export async function loadSimulation(id: string, shareToken?: string): Promise<{ state: unknown }> {
  const url = shareToken ? `/api/simulations/${id}?token=${shareToken}` : `/api/simulations/${id}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Load failed');
  return res.json();
}

export async function deleteSimulation(id: string): Promise<void> {
  const res = await apiFetch(`/api/simulations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  if (currentUser) currentUser.saveCount = Math.max(0, currentUser.saveCount - 1);
}

export async function shareSimulation(id: string): Promise<{ shareUrl: string; shareToken: string }> {
  const res = await apiFetch(`/api/simulations/${id}/share`, { method: 'POST' });
  if (!res.ok) throw new Error('Share failed');
  return res.json();
}

export async function listPublicSimulations(page: number = 1): Promise<SimulationSummary[]> {
  const res = await apiFetch(`/api/simulations/public?page=${page}`);
  if (!res.ok) throw new Error('Failed to list public simulations');
  return res.json();
}

export async function getPasskeyRegisterOptions(): Promise<unknown> {
  const res = await apiFetch('/api/auth/passkey/register-options', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to get passkey options');
  return res.json();
}

export async function registerPasskey(credential: unknown): Promise<void> {
  const res = await apiFetch('/api/auth/passkey/register', {
    method: 'POST',
    body: JSON.stringify(credential),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Passkey registration failed');
  }
}

export async function getPasskeyAuthOptions(username?: string): Promise<unknown> {
  const res = await apiFetch('/api/auth/passkey/auth-options', {
    method: 'POST',
    body: JSON.stringify(username ? { username } : {}),
  });
  if (!res.ok) throw new Error('Failed to get auth options');
  return res.json();
}

export async function authenticateWithPasskey(credential: unknown): Promise<LoginResponse> {
  const res = await apiFetch('/api/auth/passkey/auth', {
    method: 'POST',
    body: JSON.stringify(credential),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Passkey authentication failed');
  }
  const data: LoginResponse = await res.json();
  accessToken = data.token;
  currentUser = data.user;
  return data;
}

export async function getLeaderboard(type: string, limit: number = 50): Promise<LeaderboardEntry[]> {
  const res = await apiFetch(`/api/leaderboard/${type}?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load leaderboard');
  return res.json();
}

export async function submitScore(simulationId: string, scoreType: string, score: number, generation: number): Promise<void> {
  const res = await apiFetch('/api/leaderboard', {
    method: 'POST',
    body: JSON.stringify({ simulationId, scoreType, score, generation }),
  });
  if (!res.ok) throw new Error('Score submission failed');
}
