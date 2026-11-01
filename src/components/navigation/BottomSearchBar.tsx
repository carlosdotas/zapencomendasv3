import React from 'react';
import { FloatingSearchBar } from '../search/FloatingSearchBar';
import { useMapStore } from '../../context/MapContext';

export const BottomSearchBar: React.FC = () => {
  const { selectedPlace, currentRole } = useMapStore();

  // Se houver uma entrega/local selecionado ou for motorista (solicitado retirar a busca da tela), oculta a barra
  if (selectedPlace || currentRole === 'motorista') return null;

  return (
    <div 
      className="absolute bottom-3 sm:bottom-4 left-0 right-0 z-20 px-3 sm:px-6 pointer-events-none flex justify-center animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md sm:max-w-2xl pointer-events-auto">
        <FloatingSearchBar dropdownDirection="up" />
      </div>
    </div>
  );
};
