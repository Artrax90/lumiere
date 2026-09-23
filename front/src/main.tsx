import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import App from './App.tsx';
import './index.css';
import './i18n';

// Clear watch history if ?clear=1
if (window.location.search.includes('clear=1')) {
  localStorage.removeItem('lumiere_watch_history');
  localStorage.removeItem('playback_positions');
  localStorage.removeItem('last_torrents');
  localStorage.removeItem('lumiere_favorites');
  window.history.replaceState({}, '', window.location.pathname);
  alert('История просмотров очищена!');
}

import ErrorBoundary from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
