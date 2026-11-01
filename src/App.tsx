import React, { useEffect } from 'react';
import { MapProvider } from './context/MapContext';
import { MainAppContent } from './components/MainAppContent';
import { useScreenWakeLock } from './hooks/useScreenWakeLock';
import { backNavigationService } from './services/backNavigationService';

export default function App() {
  // Mantém a tela acesa continuamente enquanto o aplicativo estiver aberto no navegador ou instalado via PWA
  useScreenWakeLock();

  // Inicializa o gerenciador do botão Voltar do Android e gestos de retorno
  useEffect(() => {
    backNavigationService.init();
  }, []);

  return (
    <MapProvider>
      <MainAppContent />
    </MapProvider>
  );
}
