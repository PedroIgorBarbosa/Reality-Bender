import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './styles/global.css';

const mount = document.getElementById('root');
if (!mount) {
  throw new Error('APP_ROOT_MISSING: elemento #root não encontrado.');
}
createRoot(mount).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter><App /></BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
