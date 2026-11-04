import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const container = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (container) {
  createRoot(container).render(<App />);
}
