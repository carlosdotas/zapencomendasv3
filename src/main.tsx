import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App.tsx';
import { initPWAUpdateService } from './services/pwaUpdateService';

// Suprime alertas de conexão WebSocket do HMR e recupera automaticamente de falhas de carregamento de CSS/chunks
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (e?.message && typeof e.message === 'string' && e.message.includes('WebSocket')) {
      e.stopImmediatePropagation();
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reasonStr = String(e?.reason?.message || e?.reason || '');
    if (reasonStr.includes('WebSocket')) {
      e.stopImmediatePropagation();
    }
  });

  // Se o navegador ou WebView falhar ao carregar um chunk ou folha de estilos desatualizada, recarrega para sincronizar
  window.addEventListener('vite:preloadError', () => {
    console.warn('[Vite] Erro ao pré-carregar recursos; recarregando aplicação...');
    window.location.reload();
  });
  window.addEventListener(
    'error',
    (event) => {
      if (event?.target && (event.target as HTMLElement).tagName === 'LINK') {
        const link = event.target as HTMLLinkElement;
        if (link.rel === 'stylesheet' && link.href && link.href.includes('/assets/')) {
          console.warn('[CSS] Erro ao carregar folha de estilos; recarregando para puxar versão mais recente...');
          window.location.reload();
        }
      }
    },
    true
  );
}

// Inicializa o serviço inteligente de PWA com detecção contínua e atualização automática
initPWAUpdateService();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
