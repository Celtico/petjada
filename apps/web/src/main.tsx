import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/map.css';
import { App } from './App';
import { Provider } from './components/ui/provider';

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <Provider>
      <App />
    </Provider>
  </StrictMode>,
);
