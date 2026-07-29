import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './lib/icons.js'; // registra os ícones Iconify offline (antes de renderizar)
import { App } from './App.js';
import { I18nProvider } from './lib/i18n/index.js';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
