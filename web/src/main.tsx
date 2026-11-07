import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import './styles.css';
import { registerDayframePwa } from './pwa';

const root = document.getElementById('root');
if (!root) throw new Error('Dayframe mount element is missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA is optional. A blocked registration must never block online Dayframe.
window.addEventListener('load',()=>{void registerDayframePwa();},{once:true});
