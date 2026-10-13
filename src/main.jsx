import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import './styles.css';
import './patterns.css';
import { applyStoredAppearance } from '@/lib/appearance';
import { startDemo } from '@demo-entry';

applyStoredAppearance();

// В обычной сборке startDemo — пустая заглушка; в демо-сборке она поднимает
// браузерный бэкенд до первого запроса к /api.
startDemo().then(() => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
