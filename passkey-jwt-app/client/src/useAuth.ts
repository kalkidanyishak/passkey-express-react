// 🎯 src/hooks/useAuth.ts
// — Elegant Auth State & Actions with React Query —

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

// ── 🧩 Types ─────────────────────────────────────────────────────

/**
 * Shape of verification responses from auth mutations
 */
type VerificationResponse = { 
  verified: boolean; 
  error?: string;
};

/**
 * Login response includes optional auth token
 */
type LoginVerificationResponse = VerificationResponse & { 
  token?: string; 
};

/**
 * Mutation function signature (for type safety & autocomplete)
 */
import type { UseMutateFunction } from '@tanstack/react-query';

/**
 * Public API shape of this hook — clean, typed, predictable
 */
interface UseAuthReturn {
  isLoggedIn: boolean;
  profileMessage: string | undefined;
  isProfileLoading: boolean;

  // Mutations
  register: UseMutateFunction<VerificationResponse, Error, string, unknown>;
  isRegistering: boolean;

  login: UseMutateFunction<LoginVerificationResponse, Error, string, unknown>;
  isLoggingIn: boolean;

  // Action
  logout: () => void;
}

// ── 🪄 Hook Implementation ───────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const queryClient = useQueryClient();

  // 💡 Auth State — initialized from localStorage token
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(
    !!localStorage.getItem('token')
  );

  // 🚪 Logout — clears token & cache
  const logout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    queryClient.clear(); // 🧹 wipes all cached queries
  };

  // 👤 Profile Query — only runs if logged in
  const {
    data: profileMessage,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useQuery<string, Error>({
    queryKey: ['profile'],
    queryFn: api.getProfile,
    enabled: isLoggedIn,
    retry: 1, // 🔄 retry once on failure
  });

  // ⚠️ Auto-logout on profile fetch error (token likely expired/invalid)
  useEffect(() => {
    if (isProfileError) logout();
  }, [isProfileError]);

  // ✍️ Register Mutation
  const { mutate: register, isPending: isRegistering } = useMutation<
    VerificationResponse,
    Error,
    string
  >({
    mutationFn: api.registerUser,
    onSuccess: () => {
      alert('🎉 Registration successful!');
    },
    onError: (error) => {
      alert(`❌ Registration failed: ${error.message}`);
    },
  });

  // 🔐 Login Mutation
  const { mutate: login, isPending: isLoggingIn } = useMutation<
    LoginVerificationResponse,
    Error,
    string
  >({
    mutationFn: api.loginUser,
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
        setIsLoggedIn(true);
        queryClient.invalidateQueries({ queryKey: ['profile'] }); // 🆕 refresh profile
        alert('✅ Login successful!');
      }
    },
    onError: (error) => {
      alert(`🔐 Login failed: ${error.message}`);
    },
  });

  // 🎁 Return polished, typed API
  return {
    isLoggedIn,
    profileMessage,
    isProfileLoading,

    register,
    isRegistering,

    login,
    isLoggingIn,

    logout,
  };
}

// ✨ Designed for clarity. Optimized for flow. Typed for safety.