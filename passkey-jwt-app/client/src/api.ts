// 🌐 src/api.ts
// — Beautiful, Type-Safe API Layer for Passkey Auth —

import axios from 'axios';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

// ── 🧩 Types ─────────────────────────────────────────────────────

export interface VerificationResponse {
  verified: boolean;
  error?: string;
}

export interface LoginVerificationResponse extends VerificationResponse {
  token?: string;
}

export interface ProfileResponse {
  message: string;
}

// ── 🛠️ API Client Setup ──────────────────────────────────────────

const API_BASE_URL = 'https://passkey-express-react.onrender.com'; // ✅ Fixed trailing space!

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000, // ⏱️ 10s timeout for all requests
});

// ── 🧭 Helper: Throw if verification fails
const throwIfNotVerified = <T extends VerificationResponse>(res: T): T => {
  if (!res.verified) {
    throw new Error(res.error || 'Verification failed');
  }
  return res;
};

// ── 🔐 Helper: Ensure auth token exists
const getAuthToken = (): string => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');
  return token;
};

// ── 📡 API Functions — Clean, Composed, Elegant ──────────────────

/**
 * Fetches user profile — requires valid auth token
 */
export const getProfile = async (): Promise<string> => {
  const token = getAuthToken();

  const { data } = await api.get<ProfileResponse>('/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });

  return data.message;
};

/**
 * Registers a new user via WebAuthn
 */
export const registerUser = async (username: string): Promise<VerificationResponse> => {
  // 1️⃣ Get registration challenge
  const { data: options } = await api.post<PublicKeyCredentialCreationOptionsJSON>(
    '/register-challenge',
    { username }
  );

  // 2️⃣ Start WebAuthn registration (user interaction)
  const attestation = await startRegistration({
    optionsJSON: options,
  } as any);

  // 3️⃣ Verify registration on server
  const { data } = await api.post<VerificationResponse>(
    '/register-verify',
    { username, response: attestation }
  );

  // 4️⃣ Validate & return
  return throwIfNotVerified(data);
};

/**
 * Logs in existing user via WebAuthn
 */
export const loginUser = async (username: string): Promise<LoginVerificationResponse> => {
  // 1️⃣ Get login challenge
  const { data: options } = await api.post<PublicKeyCredentialRequestOptionsJSON>(
    '/login-challenge',
    { username }
  );

  // 2️⃣ Start WebAuthn authentication (user interaction)
  const assertion = await startAuthentication({
    optionsJSON: options,
  } as any);

  // 3️⃣ Verify login on server
  const { data } = await api.post<LoginVerificationResponse>(
    '/login-verify',
    { username, response: assertion }
  );

  // 4️⃣ Validate & return (includes token on success)
  return throwIfNotVerified(data);
};

// ✨ Crafted for clarity. Typed for trust. Composed for reuse.