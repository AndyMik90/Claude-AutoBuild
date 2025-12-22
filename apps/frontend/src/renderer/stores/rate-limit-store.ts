import { create } from 'zustand';
import type { RateLimitInfo, SDKRateLimitInfo } from '../../shared/types';

interface RateLimitState {
  // Terminal rate limit modal
  isModalOpen: boolean;
  rateLimitInfo: RateLimitInfo | null;

  // SDK rate limit modal (for changelog, tasks, etc.)
  isSDKModalOpen: boolean;
  sdkRateLimitInfo: SDKRateLimitInfo | null;

  // Track if there's a pending rate limit (persists after modal is closed)
  // User can click the sidebar indicator to reopen
  hasPendingRateLimit: boolean;
  pendingRateLimitType: 'terminal' | 'sdk' | null;

  // Actions
  showRateLimitModal: (info: RateLimitInfo) => void;
  hideRateLimitModal: () => void;
  showSDKRateLimitModal: (info: SDKRateLimitInfo) => void;
  hideSDKRateLimitModal: () => void;
  reopenRateLimitModal: () => void;
  clearPendingRateLimit: () => void;
}

export const useRateLimitStore = create<RateLimitState>((set, get) => ({
  isModalOpen: false,
  rateLimitInfo: null,
  isSDKModalOpen: false,
  sdkRateLimitInfo: null,
  hasPendingRateLimit: false,
  pendingRateLimitType: null,

  showRateLimitModal: (info: RateLimitInfo) => {
    set({
      isModalOpen: true,
      rateLimitInfo: info,
      hasPendingRateLimit: true,
      pendingRateLimitType: 'terminal'
    });
  },

  hideRateLimitModal: () => {
    // Keep the rate limit info and pending flag when closing
    // User can reopen via sidebar indicator
    set({ isModalOpen: false });
  },

  showSDKRateLimitModal: (info: SDKRateLimitInfo) => {
    set({
      isSDKModalOpen: true,
      sdkRateLimitInfo: info,
      hasPendingRateLimit: true,
      pendingRateLimitType: 'sdk'
    });
  },

  hideSDKRateLimitModal: () => {
    // Keep the rate limit info and pending flag when closing
    // User can reopen via sidebar indicator
    set({ isSDKModalOpen: false });
  },

  reopenRateLimitModal: () => {
    const state = get();
    if (state.pendingRateLimitType === 'terminal' && state.rateLimitInfo) {
      set({ isModalOpen: true });
    } else if (state.pendingRateLimitType === 'sdk' && state.sdkRateLimitInfo) {
      set({ isSDKModalOpen: true });
    }
  },

  clearPendingRateLimit: () => {
    set({
      hasPendingRateLimit: false,
      pendingRateLimitType: null,
      rateLimitInfo: null,
      sdkRateLimitInfo: null
    });
  },
}));
