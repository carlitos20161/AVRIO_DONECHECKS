import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { BrowserRouter } from 'react-router-dom';
import { logger } from './utils/logger';

// Version checking and auto-refresh logic
let currentVersion: string | null = null;
let checkVersionInterval: NodeJS.Timeout | null = null;

async function checkForUpdates() {
  try {
    const response = await fetch('/version.json?' + Date.now());
    if (response.ok) {
      const data = await response.json();
      const newVersion = data.version || data.buildTime || Date.now().toString();
      
      if (currentVersion === null) {
        // First check - store current version
        currentVersion = newVersion;
        logger.log('[Version] Current version:', currentVersion);
      } else if (currentVersion !== newVersion) {
        // New version detected!
        logger.log('[Version] New version detected! Reloading...', {
          current: currentVersion,
          new: newVersion
        });
        
        // Show a brief message to user (optional)
        if (document.body) {
          const notification = document.createElement('div');
          notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 10000;
            font-family: Arial, sans-serif;
          `;
          notification.textContent = '🔄 New version available! Reloading...';
          document.body.appendChild(notification);
        }
        
        // Small delay to show notification, then reload
        setTimeout(async () => {
          // Unregister old service worker
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
          }
          
          // Clear all caches
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }
          
          // Reload the page
          window.location.reload();
        }, 1000);
      }
    }
  } catch (error) {
    // Silently fail - version.json might not exist yet
    logger.log('[Version] Version check failed (this is OK if version.json doesn\'t exist yet):', error);
  }
}

// Listen for force reload messages from service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FORCE_RELOAD') {
      logger.log('[SW] Received force reload message, reloading...');
      window.location.reload();
    }
  });
}

// TEMPORARILY DISABLED - Register service worker for caching (only in production)
if (false && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        logger.log('[SW] Registered:', registration);
        
        // Check for updates immediately
        checkForUpdates();
        
        // Check for updates every minute
        checkVersionInterval = setInterval(checkForUpdates, 60000);
        
        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker is ready, reload to activate it
                logger.log('[SW] New service worker installed, reloading...');
                window.location.reload();
              }
            });
          }
        });
        
        // Check for updates when page becomes visible
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            registration.update();
            checkForUpdates();
          }
        });
      })
      .catch((registrationError) => {
        logger.log('[SW] Registration failed:', registrationError);
      });
  });
} else if (process.env.NODE_ENV === 'development') {
  // In development, still check for version updates but don't register SW
  window.addEventListener('load', () => {
    checkForUpdates();
    checkVersionInterval = setInterval(checkForUpdates, 60000);
  });
}

const theme = createTheme();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* ✅ Wrap App in BrowserRouter */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

