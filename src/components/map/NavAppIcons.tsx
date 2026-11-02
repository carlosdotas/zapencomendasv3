import React from 'react';

// Ícone visual autêntico do Google Maps em vetor SVG
export const GoogleMapsIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <path fill="#4885ED" d="M24 4C14.06 4 6 12.06 6 22c0 8.04 5.34 14.86 12.69 17.16L24 44l5.31-4.84C36.66 36.86 42 30.04 42 22c0-9.94-8.06-18-18-18z"/>
    <path fill="#34A853" d="M24 4c-9.94 0-18 8.06-18 18 0 4.97 2.03 9.47 5.32 12.73l12.68-12.73V4z"/>
    <path fill="#FBBC05" d="M24 22l-12.68 12.73c3.27 3.25 7.74 5.27 12.68 5.27V22z"/>
    <path fill="#EA4335" d="M24 22v18c4.94 0 9.41-2.02 12.68-5.27L24 22z"/>
    <circle fill="#FFFFFF" cx="24" cy="22" r="7"/>
    <circle fill="#4285F4" cx="24" cy="22" r="4.5"/>
  </svg>
);

// Ícone visual autêntico do Waze em vetor SVG
export const WazeIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <rect width="48" height="48" rx="12" fill="#33CCFF"/>
    <path fill="#FFFFFF" d="M37.5 24c0-7.46-6.04-13.5-13.5-13.5S10.5 16.54 10.5 24c0 2.22.54 4.31 1.49 6.16l-1.39 4.34a1 1 0 0 0 1.25 1.25l4.34-1.39A13.43 13.43 0 0 0 24 37.5c7.46 0 13.5-6.04 13.5-13.5z"/>
    <circle cx="19" cy="22.5" r="2.2" fill="#222222"/>
    <circle cx="29" cy="22.5" r="2.2" fill="#222222"/>
    <path d="M20 28.5c1.2 1.5 2.6 2.2 4 2.2s2.8-.7 4-2.2" stroke="#222222" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="17.5" cy="35" r="2.5" fill="#222222"/>
    <circle cx="30.5" cy="35" r="2.5" fill="#222222"/>
  </svg>
);

// Abre sempre fora da página do app (nova aba/janela ou app nativo), nunca na mesma webview
const openOutside = (url: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Dispara o app nativo por um iframe oculto: se não existir, a página do app não é substituída
const launchNativeScheme = (url: string) => {
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 2000);
};

// Abre a navegação curva a curva no app escolhido
export const openExternalNavigation = (app: 'google_maps' | 'waze', lat: number, lng: number) => {
  if (app === 'waze') {
    openOutside(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`);
    return;
  }
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;
  if (/Android/i.test(navigator.userAgent)) {
    launchNativeScheme(`google.navigation:q=${lat},${lng}&mode=d`);
    // Só abre a versão web se o app nativo não assumiu (a página continua visível)
    setTimeout(() => {
      if (!document.hidden) openOutside(webUrl);
    }, 1200);
  } else {
    openOutside(webUrl);
  }
};
