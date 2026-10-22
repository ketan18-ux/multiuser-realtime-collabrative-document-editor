/**
 * offline.js — Network status monitoring and service worker registration.
 *
 * Note: navigator.onLine is a network hint only and does not guarantee Supabase reachability.
 * It indicates whether the client has an active local network interface connection.
 */

/**
 * Registers the application service worker for offline asset caching and persistence.
 * Logs high-level registration events without any sensitive information.
 *
 * @returns {Promise<{ success: boolean, registration?: ServiceWorkerRegistration, error?: string }>}
 */
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { success: false, error: 'Service worker is not supported in this browser.' };
  }

  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js');
    console.info('Service Worker registered successfully with scope:', registration.scope);
    return { success: true, registration };
  } catch (err) {
    console.warn('Service Worker registration failed:', err.message || 'Unknown error');
    return { success: false, error: err.message || 'Registration failed' };
  }
}

/**
 * Sets up event listeners for network connectivity transitions.
 * Invokes the provided callback immediately with the current connectivity status.
 *
 * @param {Function} onStatusChange - Callback receiving 'online' or 'offline'
 * @returns {Function} Teardown function to remove event listeners
 */
export function initOfflineMonitor(onStatusChange) {
  if (typeof window === 'undefined' || typeof onStatusChange !== 'function') {
    return () => {};
  }

  const handleOnline = () => onStatusChange('online');
  const handleOffline = () => onStatusChange('offline');

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Call immediately with the current initial status
  const initialStatus = (typeof navigator !== 'undefined' && navigator.onLine) ? 'online' : 'offline';
  onStatusChange(initialStatus);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Returns whether the browser currently reports network connectivity.
 *
 * Note: navigator.onLine is a network hint only and does not guarantee Supabase reachability.
 *
 * @returns {boolean}
 */
export function isOnline() {
  return typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : true;
}
