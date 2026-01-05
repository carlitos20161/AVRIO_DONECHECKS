/**
 * Session Timeout Utility
 * Automatically logs out users after 24 hours of inactivity
 * Timer resets on each login
 */

import { logger } from './logger';

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CHECK_INTERVAL = 60 * 1000; // Check every minute

const STORAGE_KEY = 'session_login_time';

/**
 * Save login timestamp to localStorage
 */
export const saveLoginTime = (): void => {
  const loginTime = Date.now();
  localStorage.setItem(STORAGE_KEY, loginTime.toString());
  logger.log('Session timer started. Will expire in 24 hours.');
};

/**
 * Get login timestamp from localStorage
 */
export const getLoginTime = (): number | null => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  return parseInt(stored, 10);
};

/**
 * Clear login timestamp (on logout)
 */
export const clearLoginTime = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  logger.log('Session timer cleared.');
};

/**
 * Check if session has expired
 * Returns true if session is expired, false otherwise
 */
export const isSessionExpired = (): boolean => {
  const loginTime = getLoginTime();
  if (!loginTime) return true; // No login time = expired
  
  const now = Date.now();
  const elapsed = now - loginTime;
  
  return elapsed >= SESSION_DURATION;
};

/**
 * Get time remaining until session expires (in milliseconds)
 * Returns 0 if expired or no session
 */
export const getTimeRemaining = (): number => {
  const loginTime = getLoginTime();
  if (!loginTime) return 0;
  
  const now = Date.now();
  const elapsed = now - loginTime;
  const remaining = SESSION_DURATION - elapsed;
  
  return remaining > 0 ? remaining : 0;
};

/**
 * Get formatted time remaining (e.g., "23h 45m")
 */
export const getFormattedTimeRemaining = (): string => {
  const remaining = getTimeRemaining();
  if (remaining === 0) return 'Expired';
  
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

