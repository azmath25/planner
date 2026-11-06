import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Dayframe mount element is missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
