import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, User, Phone, ChevronRight, ChevronDown, Building2, AlertTriangle, Zap, Check, LocateFixed, Package, Navigation, RefreshCw, Loader2 } from 'lucide-react';
import { GoogleMapsIcon, WazeIcon, openExternalNavigation } from './NavAppIcons';
import { useMapStore } from '../../context/MapContext';
import { reverseGeocode } from '../../services/geocodingService';
import { MapLayerType, Place, OperationType, Driver, CompletedWaypointMark } from '../../types/map';
import { Customer } from '../../types/customer';
import { isCustomerMissingLocation, getCustomerPlaceName } from '../../utils/customerLocationUtils';
import { isStreetOrAddress, calculateDistanceMeters, resolveCommercialClosingTime } from '../../utils/placeUtils';
import { placeService } from '../../services/placeService';
import { ClaimRouteMap } from './ClaimRouteMap';
import { getSavedLocation, saveLocationToStorage } from '../../utils/storage';
import { tileCache } from '../../services/tileCache';
import { formatLastSeen } from '../../utils/driverUtils';
import { formatDriverLastSeen, isDriverStale } from '../../services/driverTrackingClient';
import { formatPhotoUrl } from '../../services/apiAdapters';
import { UserRole } from '../../types/auth';
import { filterPlacesBySequence } from '../../utils/orderSequence';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { fetchMultiStopRoute } from '../../services/routingService';
import { getPlaceCalendarDate, isDateInInterval } from '../../utils/dateFilterUtils';
import { companyService } from '../../services/companyService';

import { CachedTileLayer } from '../../services/tileCache';

// Camadas de Mapa baseadas no Google Maps Oficial (Roadmap, Terreno e Satélite)
const GOOGLE_MAPS_ROADMAP_URL = 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
const GOOGLE_MAPS_TERRAIN_URL = 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
const GOOGLE_MAPS_SATELLITE_URL = 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTRIBUTION = '&copy; Google Maps';

const TILE_LAYERS: Record<MapLayerType, { url: string; attribution: string; maxZoom: number; subdomains?: string[] }> = {
  default: {
    url: GOOGLE_MAPS_ROADMAP_URL,
    attribution: GOOGLE_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['0', '1', '2', '3']
  },
  osm: {
    url: GOOGLE_MAPS_ROADMAP_URL,
    attribution: GOOGLE_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['0', '1', '2', '3']
  },
  terrain: {
    url: GOOGLE_MAPS_TERRAIN_URL,
    attribution: GOOGLE_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['0', '1', '2', '3']
  },
  dark: {
    url: GOOGLE_MAPS_ROADMAP_URL,
    attribution: GOOGLE_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['0', '1', '2', '3']
  },
  satellite: {
    url: GOOGLE_MAPS_SATELLITE_URL,
    attribution: GOOGLE_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['0', '1', '2', '3']
  }
};

// Brand Package Box Pin Marker (Caixinha de entrega amarelo-alaranjada com haste e xizinho na ponta)
const createBrandPinIcon = (isSelected: boolean = false) => {
  const pinColor = isSelected ? '#007AFF' : '#0B5187';
  const mainColor = isSelected ? '#FFB834' : '#FFA826'; // Amarelo alaranjado padrão
  const topLightColor = isSelected ? '#FFE8A0' : '#FFDB78'; // Tampa superior mais clarinha
  const darkColor = isSelected ? '#F58216' : '#E67E22'; // Face lateral sombreada

  const pinSvg = `
    <div style="width: 38px; height: 48px; position: relative; pointer-events: none;">
      <svg width="38" height="48" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; overflow: visible; filter: drop-shadow(0 3px 8px rgba(245, 158, 11, 0.45));">
        <!-- Sombra no solo -->
        <ellipse cx="19" cy="43" rx="7.5" ry="2.2" fill="rgba(0, 0, 0, 0.28)" />

        <!-- Xzinho na ponta do alfinete marcando o ponto exato no mapa -->
        <path d="M 14 38 L 24 48 M 14 48 L 24 38" stroke="#FFFFFF" stroke-width="3.8" stroke-linecap="round" />
        <path d="M 14 38 L 24 48 M 14 48 L 24 38" stroke="${pinColor}" stroke-width="2.2" stroke-linecap="round" />

        <!-- Risquinho fininho do alfinete -->
        <line x1="19" y1="26" x2="19" y2="43" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" />
        <line x1="19" y1="26" x2="19" y2="43" stroke="${pinColor}" stroke-width="1.8" stroke-linecap="round" />

        <!-- Ponto central no cruzamento do X -->
        <circle cx="19" cy="43" r="1.4" fill="#FFFFFF" />

        <!-- Caixinha de entrega ou encomenda 3D Amarelo-Alaranjada -->
        <!-- Contorno externo da caixa -->
        <path d="M 19 2 L 32 8.5 L 32 20.5 L 19 27 L 6 20.5 L 6 8.5 Z" fill="${darkColor}" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round" />

        <!-- Face Superior da Caixa (tampa - mais clarinha) -->
        <path d="M 19 2.5 L 31.5 8.5 L 19 14.5 L 6.5 8.5 Z" fill="${topLightColor}" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />

        <!-- Face Esquerda da Caixa (amarelo alaranjado padrão) -->
        <path d="M 6.5 8.5 L 19 14.5 L 19 26.5 L 6.5 20.5 Z" fill="${mainColor}" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />

        <!-- Face Direita da Caixa (tom alaranjado de sombra) -->
        <path d="M 19 14.5 L 31.5 8.5 L 31.5 20.5 L 19 26.5 Z" fill="${darkColor}" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />

        <!-- Fitas de encomenda brancas na caixa -->
        <path d="M 12.8 5.5 L 25.2 11.5" stroke="rgba(255, 255, 255, 0.92)" stroke-width="2" stroke-linecap="round" />
        <path d="M 19 14.5 L 19 26.5" stroke="rgba(255, 255, 255, 0.92)" stroke-width="2" stroke-linecap="round" />

        <!-- Mini etiqueta de remessa -->
        <polygon points="8,12 13.5,14.5 13.5,18.5 8,16" fill="#FFFFFF" opacity="0.95" />
        <line x1="9.5" y1="14.2" x2="12" y2="15.4" stroke="#D97706" stroke-width="1" stroke-linecap="round" />
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'custom-brand-pin',
    html: pinSvg,
    iconSize: [38, 48],
    iconAnchor: [19, 43],
    popupAnchor: [0, -43]
  });
};

// Helper para gerar o badge da data da encomenda (Hoje, Ontem, 2 dias atrás, 3 dias atrás ou data agendada)
export const getPlaceDateBadgeInfo = (place: Place): { label: string; type: 'hoje' | 'amanha' | 'ontem' | '2_dias_atras' | '3_dias_atras' | 'custom' | string; iconSvg: string } => {
  let badgeType = place.orderDateBadge;

  // Resolve a data da encomenda (scheduledDate ou data ou orderDate) no fuso de SP
  const targetDateStr = place.scheduledDate || (place as any).data || (place as any).orderDate;
  if (targetDateStr) {
    const cleanDate = targetDateStr.slice(0, 10);
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const twoDaysAgoStr = twoDaysAgo.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      const threeDaysAgoStr = threeDaysAgo.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      if (cleanDate === todayStr) {
        return {
          label: 'Hoje',
          type: 'hoje',
          iconSvg: `<span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:#ffffff; opacity:0.95; flex-shrink:0;"></span>`
        };
      }
      if (cleanDate === yesterdayStr) {
        return {
          label: 'Ontem',
          type: 'ontem',
          iconSvg: `<span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:#ffffff; opacity:0.95; flex-shrink:0;"></span>`
        };
      }
      if (cleanDate === twoDaysAgoStr) {
        return {
          label: '2 dias atrás',
          type: '2_dias_atras',
          iconSvg: `<span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:#ffffff; opacity:0.95; flex-shrink:0;"></span>`
        };
      }
      if (cleanDate === threeDaysAgoStr) {
        return {
          label: '3 dias atrás',
          type: '3_dias_atras',
          iconSvg: `<span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:#ffffff; opacity:0.95; flex-shrink:0;"></span>`
        };
      }
      if (cleanDate === tomorrowStr) {
        return {
          label: 'Amanhã',
          type: 'amanha',
          iconSvg: `<span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:#ffffff; opacity:0.95; flex-shrink:0;"></span>`
        };
      }
      return {
        label: `${day}/${month}`,
        type: 'custom',
        iconSvg: `<span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:#ffffff; opacity:0.95; flex-shrink:0;"></span>`
      };
    }
  }

  // Se não estiver especificado, encomendas ativas padrão são de 'hoje'
  if (!badgeType) {
    if (place.id.startsWith('pedido-') || place.orderCode) {
      badgeType = 'hoje';
    } else {
      const idSum = place.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      badgeType = (idSum % 2 === 0) ? 'hoje' : 'ontem';
    }
  }

  let label = 'Hoje';
  if (badgeType === 'hoje') label = 'Hoje';
  else if (badgeType === 'amanha') label = 'Amanhã';
  else if (badgeType === 'ontem') label = 'Ontem';
  else if (badgeType === '2_dias_atras') label = '2 dias atrás';
  else if (badgeType === '3_dias_atras') label = '3 dias atrás';
  else label = badgeType;

  return {
    label,
    type: badgeType,
    iconSvg: `<span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:#ffffff; opacity:0.95; flex-shrink:0;"></span>`
  };
};

// Helper para obter a primeira foto da encomenda (do localStorage, photos ou imageUrl)
// REGRA: Na entrega NÃO pode mostrar foto do local, deve mostrar foto apenas na COLETA
export const getPlacePhoto = (place: Place): string | null => {
  if (!place) return null;
  const isColeta = place.operationType === 'coleta' || place.orderStage === 'coleta';
  if (!isColeta) {
    return null;
  }

  let raw: string | null = null;
  try {
    const saved = localStorage.getItem(`encomendaszap_photos_${place.id}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]) {
        if (!String(parsed[0]).includes('images.unsplash.com')) {
          raw = parsed[0];
        }
      }
    }
  } catch (err) {
    // Ignore storage parse error
  }
  if (!raw) {
    if (place.photos && place.photos.length > 0) {
      raw = place.photos[0];
    } else if (place.imageUrl) {
      raw = place.imageUrl;
    }
  }
  if (!raw) return null;
  return formatPhotoUrl(raw, 'thumb') || raw;
};

// Helper para identificação clara de veículo (moto, carro, utilitário) com cores diferenciadas no fundo
const getVehicleInfo = (vehicleType?: string) => {
  const v = (vehicleType || 'moto').toLowerCase().trim();
  if (v === 'carro' || v === 'automovel' || v === 'automóvel') {
    return { 
      emoji: '🚗', 
      label: 'Carro', 
      type: 'carro',
      bg: '#0284C7', // Azul Celeste vibrante
      border: '#7DD3FC',
      color: '#FFFFFF',
      badgeClass: 'bg-sky-600 text-white border-sky-400'
    };
  }
  if (v === 'utilitario' || v === 'utilitário' || v === 'caminhao' || v === 'caminhão' || v === 'van' || v === 'furgao' || v === 'furgão') {
    return { 
      emoji: '🚚', 
      label: 'Utilitário', 
      type: 'utilitario',
      bg: '#D97706', // Âmbar / Dourado intenso
      border: '#FDE68A',
      color: '#FFFFFF',
      badgeClass: 'bg-amber-600 text-white border-amber-300'
    };
  }
  return { 
    emoji: '🏍️', 
    label: 'Moto', 
    type: 'moto',
    bg: '#059669', // Verde Esmeralda intenso
    border: '#6EE7B7',
    color: '#FFFFFF',
    badgeClass: 'bg-emerald-600 text-white border-emerald-300'
  };
};

const isCollectionCenterPlace = (place: Place): boolean =>
  /central\s+de\s+coletas?/i.test(place.category || '') || Boolean((place as any).central_coletas);

// Distância do motoboy até o local, em texto curto ("850 m" / "1,2 km")
const formatClaimDistance = (
  from: { lat: number; lng: number } | null | undefined,
  to: { lat: number; lng: number } | null | undefined
): string => {
  if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) return '';
  const meters = calculateDistanceMeters(from, to);
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
};

// Status do motorista exibido dentro da label da maker (admin/atendente/terminal): "Aceito por X" ou "X indo • distância"
type DriverStatusInfo = { text: string; enRoute: boolean };
const getDriverStatusInfo = (places: Place[], liveDrivers: Array<{ id: string; name?: string; coordinates: { lat: number; lng: number } }>): DriverStatusInfo | null => {
  const assigned = places.filter(p => (p.assignedDriverId || p.assignedDriverName) && p.orderStage !== 'concluido' && !isCollectionCenterPlace(p));
  if (assigned.length === 0) return null;
  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  if (assigned.length > 1) {
    const going = assigned.filter(p => p.driverEnRoute).length;
    return { text: `${assigned.length} aceitos${going ? ` • ${going} indo` : ''}`, enRoute: going > 0 };
  }
  const p = assigned[0];
  const digits = (v?: string) => String(v || '').replace(/\D/g, '');
  const live = liveDrivers.find(d => {
    const a = digits(p.assignedDriverId);
    return (a && digits(d.id) === a) || (p.assignedDriverName && d.name === p.assignedDriverName);
  });
  const name = escapeHtml(p.assignedDriverName || live?.name || 'Motorista');
  if (p.driverEnRoute) {
    const distance = live ? formatClaimDistance(live.coordinates, p.coordinates) : '';
    return { text: `${name} indo${distance ? ` • ${distance}` : ''}`, enRoute: true };
  }
  return { text: `Aceito por ${name}`, enRoute: false };
};

// Place Marker com caixinha 3D ou Foto da Encomenda, risquinho fininho, xizinho na ponta e legenda translúcida
export const createPlaceMarkerIcon = (
  place: Place, 
  isSelected: boolean = false, 
  placesAtLocation: Place[] = [place],
  customers: Customer[] = [],
  isPublicForDriver: boolean = false,
  distanceLabel: string = '',
  driverStatus: DriverStatusInfo | null = null,
  hideLocationAlert: boolean = false
) => {
  const isMultiple = placesAtLocation.length > 1;
  const isCollectionCenter = placesAtLocation.some(isCollectionCenterPlace);
  const opType: OperationType = place.operationType || 'entrega';
  const isSingleMissing = !isMultiple && !isPublicForDriver && !hideLocationAlert && isCustomerMissingLocation(place, customers);
  
  let pinColor = '#FF5E00';
  let mainColor = '#FF5E00';
  let topLightColor = '#FFDB78';
  let darkColor = '#EA580C';
  let symbolSvg = `
    <!-- Mini etiqueta de remessa de entrega -->
    <polygon points="8,12 13.5,14.5 13.5,18.5 8,16" fill="#FFFFFF" opacity="0.95" />
    <line x1="9.5" y1="14.2" x2="12" y2="15.4" stroke="#FF5E00" stroke-width="1" stroke-linecap="round" />
  `;
  let opEmoji = '📦';

  if (isPublicForDriver && !isCollectionCenter) {
    const label = isMultiple ? `${placesAtLocation.length} pedidos` : 'Aceitar';
    return L.divIcon({
      className: 'public-claim-marker',
      html: `
        <style>
          @keyframes claimArrowBounce { 0%,100% { transform: translateY(-4px); } 50% { transform: translateY(3px); } }
          @keyframes claimPulse { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.4); opacity: 0; } }
          @keyframes claimWiggle { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-4deg); } 75% { transform: rotate(4deg); } }
          @keyframes claimShadow { 0%,100% { transform: translateX(-50%) scale(0.7); opacity: .3; } 50% { transform: translateX(-50%) scale(1); opacity: .55; } }
        </style>
        <div style="position:relative;width:84px;height:92px;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="position:absolute;left:50%;bottom:-4px;width:28px;height:9px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.3) 55%,rgba(0,0,0,0) 100%);animation:claimShadow 0.9s ease-in-out infinite;pointer-events:none;"></div>
          <div style="min-width:64px;max-width:84px;padding:3px 8px 4px;border-radius:9px;background:#FFFFFF;border:2px solid #DC2626;box-shadow:0 2px 6px rgba(0,0,0,0.35);text-align:center;line-height:1;">
            <div style="font-size:9px;font-weight:900;letter-spacing:0.05em;text-transform:uppercase;color:#DC2626;white-space:nowrap;">${label}</div>
            <div style="margin-top:2px;font-size:12px;font-weight:900;color:#0F172A;white-space:nowrap;">${distanceLabel || '🛵'}</div>
          </div>
          <div style="position:relative;width:46px;height:44px;margin-top:2px;animation:claimWiggle 2.4s ease-in-out infinite;">
            <div style="position:absolute;inset:3px;border-radius:10px;background:#EF4444;animation:claimPulse 1.8s ease-out infinite;"></div>
            <svg width="46" height="44" viewBox="0 0 64 62" style="position:absolute;inset:0;filter:drop-shadow(0 3px 4px rgba(127,29,29,0.55))${isSelected ? ' drop-shadow(0 0 4px rgba(254,202,202,0.95))' : ''};">
              <path d="M32 3 L59 16 V44 L32 58 L5 44 V16 Z" fill="#DC2626" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" />
              <path d="M5 16 L32 29 L59 16" fill="#EF4444" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round" />
              <path d="M32 29 V58" stroke="#FFFFFF" stroke-width="2" />
              <path d="M18.5 9.5 L45.5 22.5" stroke="#FECACA" stroke-width="3.5" stroke-linecap="round" />
            </svg>
          </div>
          <svg width="20" height="15" viewBox="0 0 34 26" style="margin-top:1px;animation:claimArrowBounce 0.9s ease-in-out infinite;filter:drop-shadow(0 3px 3px rgba(0,0,0,0.35));">
            <path d="M4 3 L17 22 L30 3" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M4 3 L17 22 L30 3" fill="none" stroke="#DC2626" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      `,
      iconSize: [84, 92],
      iconAnchor: [42, 92],
      popupAnchor: [0, -92]
    });
  }
  if (isPublicForDriver) {
    // Pedido Público Aberto visto por Motorista: Cor Dourada/Âmbar Chamativa com Raio ⚡
    pinColor = isSelected ? '#F59E0B' : '#D97706';
    mainColor = isSelected ? '#FBBF24' : '#F59E0B';
    topLightColor = isSelected ? '#FEF3C7' : '#FDE68A';
    darkColor = isSelected ? '#D97706' : '#B45309';
    opEmoji = '⚡';
    symbolSvg = `
      <!-- Símbolo de Raio Dourado para Pedido Público Disponível -->
      <circle cx="25" cy="18" r="5" fill="#FFFFFF" stroke="#B45309" stroke-width="0.9" />
      <path d="M 25.5 14.5 L 23.2 18 L 25.5 18 L 24.5 21.5 L 27.2 17.5 L 25 17.5 Z" fill="#D97706" stroke="#92400E" stroke-width="0.6" stroke-linejoin="round" />
    `;
  } else if (isCollectionCenter) {
    pinColor = isSelected ? '#0F766E' : '#0D9488';
    mainColor = isSelected ? '#2DD4BF' : '#14B8A6';
    topLightColor = isSelected ? '#CCFBF1' : '#99F6E4';
    darkColor = isSelected ? '#0F766E' : '#115E59';
    opEmoji = '🏬';
    symbolSvg = `
      <circle cx="25" cy="18" r="5" fill="#FFFFFF" stroke="#115E59" stroke-width="0.9" />
      <path d="M21.5 18 L25 15.5 L28.5 18 V21 H21.5 Z" fill="#0F766E" stroke="#115E59" stroke-width="0.7" stroke-linejoin="round" />
      <path d="M23 19 H24.2 V21 H23 Z M25.8 19 H27 V20.2 H25.8 Z" fill="#FFFFFF" />
    `;
  } else if (isMultiple) {
    // Quando tiver mais de uma no lugar só: cor cinza, uma cor mais clara, cinza
    pinColor = isSelected ? '#64748B' : '#94A3B8';
    mainColor = isSelected ? '#94A3B8' : '#CBD5E1';
    topLightColor = isSelected ? '#E2E8F0' : '#F1F5F9';
    darkColor = isSelected ? '#475569' : '#64748B';
    opEmoji = '📦';
    symbolSvg = `
      <!-- Símbolo de Múltiplas Encomendas (Camadas em cinza claro) -->
      <circle cx="25" cy="18" r="4.5" fill="#FFFFFF" stroke="#64748B" stroke-width="0.8" />
      <path d="M 22.5 16.5 L 25 15.2 L 27.5 16.5 L 25 17.8 Z" fill="#94A3B8" />
      <path d="M 22.5 18 L 25 19.3 L 27.5 18" stroke="#64748B" stroke-width="0.8" stroke-linecap="round" />
      <path d="M 22.5 19.5 L 25 20.8 L 27.5 19.5" stroke="#64748B" stroke-width="0.8" stroke-linecap="round" />
    `;
  } else if (opType === 'coleta') {
    // 1. Coleta: Azul Marinho Oficial da Logo (#0B5187)
    pinColor = isSelected ? '#106CB2' : '#0B5187';
    mainColor = isSelected ? '#106CB2' : '#0B5187';
    topLightColor = isSelected ? '#60A5FA' : '#4F92C7';
    darkColor = isSelected ? '#0B5187' : '#002B49';
    opEmoji = '📥';
    symbolSvg = `
      <!-- Símbolo de Coleta (Seta para baixo dentro do badge circular) -->
      <circle cx="25" cy="18" r="4.5" fill="#FFFFFF" stroke="#002B49" stroke-width="0.8" />
      <path d="M 23.4 16.6 L 25 19.4 L 26.6 16.6 M 25 15.2 L 25 19.4" stroke="#0B5187" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (opType === 'troca') {
    // 3. Troca: Roxo / Violeta (#7C3AED)
    pinColor = isSelected ? '#8B5CF6' : '#7C3AED';
    mainColor = isSelected ? '#A78BFA' : '#8B5CF6';
    topLightColor = isSelected ? '#DDD6FE' : '#C4B5FD';
    darkColor = isSelected ? '#7C3AED' : '#6D28D9';
    opEmoji = '🔄';
    symbolSvg = `
      <!-- Símbolo de Troca (Duas setas de troca ⇄ dentro do badge circular) -->
      <circle cx="25" cy="18" r="4.5" fill="#FFFFFF" stroke="#6D28D9" stroke-width="0.8" />
      <path d="M 23 16.8 L 27 16.8 M 25.6 15.6 L 27 16.8 L 25.6 18 M 27 19.2 L 23 19.2 M 24.4 18 L 23 19.2 L 24.4 20.4" stroke="#7C3AED" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (place.orderStage === 'retorno') {
    // 4. Retorno da Troca (2ª Entrega de volta ao ponto de coleta)
    pinColor = isSelected ? '#F59E0B' : '#D97706';
    mainColor = isSelected ? '#FBBF24' : '#F59E0B';
    topLightColor = isSelected ? '#FDE68A' : '#FEF3C7';
    darkColor = isSelected ? '#D97706' : '#B45309';
    opEmoji = '↩️';
    symbolSvg = `
      <circle cx="25" cy="18" r="4.5" fill="#FFFFFF" stroke="#B45309" stroke-width="0.8" />
      <path d="M 27 18 L 23 18 M 24.5 16.5 L 23 18 L 24.5 19.5" stroke="#D97706" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else {
    // 2. Entrega: Laranja Oficial da Logo Zap (#FF5E00 / #EA580C)
    pinColor = isSelected ? '#FF7A29' : '#FF5E00';
    mainColor = isSelected ? '#FFA826' : '#FF5E00';
    topLightColor = isSelected ? '#FFE8A0' : '#FFDB78';
    darkColor = isSelected ? '#EA580C' : '#C2410C';
    opEmoji = '📦';
  }

  // Nome do Local SEMPRE em cima (em todas as makers)
  const rawPlaceName = place.name || 'Local';
  const cleanPlaceName = rawPlaceName.length > 24 ? rawPlaceName.slice(0, 22) + '...' : rawPlaceName;

  // Foto da encomenda: na entrega NÃO pode mostrar foto do local, deve mostrar foto na coleta
  const isColetaMarker = opType === 'coleta' || place.orderStage === 'coleta';
  const placePhoto = isColetaMarker ? (getPlacePhoto(place) || placesAtLocation.filter(p => p.operationType === 'coleta' || p.orderStage === 'coleta').map(p => getPlacePhoto(p)).find(Boolean) || null) : null;

  // Veículo da encomenda individual
  const singleVehicle = getVehicleInfo(place.vehicleType);
  const singlePrice = Number(place.price) || Number((place as any).total) || Number((place as any).valor_total) || 0;
  const singleClientName = place.customerName 
    ? (place.customerName.length > 26 ? place.customerName.slice(0, 24) + '...' : place.customerName) 
    : 'Cliente';

  // Soma dos valores de todas as encomendas no mesmo local
  const sumTotalValues = isMultiple
    ? placesAtLocation.reduce((acc, p) => acc + (Number(p.price) || Number((p as any).total) || Number((p as any).valor_total) || 0), 0)
    : singlePrice;

  // Montagem do conteúdo dos clientes:
  // Se houver mais de uma encomenda no mesmo lugar:
  // "embaixo tem o nome dos clientes. Lá vai ter as cores, nas cores de coleta e entrega, ou troca. Aí ele vem com a cor de fundo, com a borda e a cor de fundo."
  // "e quando tiver mais de uma, tem que estar na frente se é carro ou moto, lá na maker mesmo."
  const customerContentHtml = isMultiple ? `
    <div class="place-marker-customers-list">
      ${placesAtLocation.slice(0, 4).map((p, idx) => {
        const cName = p.customerName ? (p.customerName.length > 20 ? p.customerName.slice(0, 18) + '..' : p.customerName) : `Cliente ${idx + 1}`;
        const pVeh = getVehicleInfo(p.vehicleType);
        const pPrice = Number(p.price) || Number((p as any).total) || Number((p as any).valor_total) || 0;

        let opLabel = 'Entrega';
        let opBg = 'rgba(234, 88, 12, 0.90)';
        let opBorder = '#FDBA74';

        if (p.operationType === 'coleta') {
          opLabel = 'Coleta';
          opBg = 'rgba(11, 81, 135, 0.90)';
          opBorder = '#93C5FD';
        } else if (p.operationType === 'troca') {
          opLabel = 'Troca';
          opBg = 'rgba(124, 58, 237, 0.90)';
          opBorder = '#C4B5FD';
        } else if (p.orderStage === 'retorno') {
          opLabel = 'Retorno';
          opBg = 'rgba(217, 119, 6, 0.90)';
          opBorder = '#FDE68A';
        }

        const isLineMissing = !isPublicForDriver && !hideLocationAlert && isCustomerMissingLocation(p, customers);

        return `
          <div 
            class="place-marker-customer-line" 
            data-customer-idx="${idx}"
            style="background: ${opBg}; border: 1.2px solid ${opBorder}; border-radius: 6px; padding: 2px 5px; display: flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.12s ease;"
            title="${opLabel}: ${cName} (${pVeh.label}) - R$ ${pPrice.toFixed(2)}"
          >
            <!-- Na frente: se é carro ou moto com cor de fundo para diferenciar -->
            <span 
              class="place-marker-vehicle-tag" 
              style="background: ${pVeh.bg}; color: ${pVeh.color}; border: 1.2px solid ${pVeh.border}; font-size: 9px; font-weight: 900; padding: 0.5px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2.5px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.3); text-shadow: 0 0.5px 1px rgba(0,0,0,0.3);"
            >
              <span>${pVeh.emoji}</span>
              <span>${pVeh.label}</span>
            </span>

            <!-- Nome do cliente -->
            <span class="place-marker-customer-name" style="color: #ffffff; font-size: 10.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 105px;">
              ${cName}
            </span>

            ${isLineMissing ? `
              <!-- Alerta de Localização Faltando no Cliente -->
              <span 
                class="place-marker-location-alert-btn" 
                data-action="set-customer-location" 
                data-place-id="${p.id}"
                title="Cliente sem localização! Toque para definir local."
                style="background: #FEF3C7; color: #92400E; border: 1px solid #F59E0B; border-radius: 4px; padding: 0.5px 3.5px; font-size: 8px; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.25);"
              >
                <span>⚠️ Local</span>
              </span>
            ` : ''}

            <!-- Valor do pedido individual -->
            ${pPrice > 0 ? `
              <span style="font-size: 9px; font-weight: 900; color: #FEF08A; text-shadow: 0 1px 2px rgba(0,0,0,0.5); white-space: nowrap; margin-left: auto;">
                R$ ${pPrice.toFixed(2)}
              </span>
            ` : ''}

            <!-- Nome da operação (Coleta, Entrega, Troca) -->
            <span style="${pPrice > 0 ? 'margin-left: 2px;' : 'margin-left: auto;'} font-size: 8.5px; font-weight: 900; text-transform: uppercase; color: #ffffff; opacity: 0.95; letter-spacing: 0.02em; padding-left: 2px;">
              ${opLabel}
            </span>
          </div>
        `;
      }).join('')}
      ${placesAtLocation.length > 4 ? `<span class="place-marker-customer-more" style="color: #cbd5e1; font-weight: 800; font-size: 9.5px; padding-left: 2px;">+${placesAtLocation.length - 4} outros</span>` : ''}
    </div>
  ` : `
    <!-- Maker Individual: especifica o veículo na frente e mostra o cliente com fundo/borda suave -->
    <div 
      class="place-marker-single-customer"
      style="background: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 6px; padding: 1.5px 5px; display: flex; align-items: center; gap: 4px; margin-top: 2px;"
    >
      <span 
        class="place-marker-vehicle-tag" 
        style="background: ${singleVehicle.bg}; color: ${singleVehicle.color}; border: 1.2px solid ${singleVehicle.border}; font-size: 9px; font-weight: 900; padding: 0.5px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2.5px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.3); text-shadow: 0 0.5px 1px rgba(0,0,0,0.3);"
      >
        <span>${singleVehicle.emoji}</span>
        <span>${singleVehicle.label}</span>
      </span>
      <span class="place-marker-customer" style="color: #ffffff; font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">
        ${singleClientName}
      </span>
      ${singlePrice > 0 ? `
        <span style="margin-left: auto; font-size: 9.5px; font-weight: 900; color: #FEF08A; text-shadow: 0 1px 2px rgba(0,0,0,0.5); white-space: nowrap; background: rgba(0,0,0,0.25); padding: 0.5px 4px; border-radius: 4px;">
          R$ ${singlePrice.toFixed(2)}
        </span>
      ` : ''}
    </div>

    ${isSingleMissing ? `
      <!-- Alerta de Localização Faltando no Cliente -->
      <div 
        class="place-marker-location-alert-btn" 
        data-action="set-customer-location" 
        data-place-id="${place.id}"
        title="Cliente sem localização cadastrada! Toque para definir endereço e local."
        style="background: linear-gradient(135deg, #FEF3C7, #FDE68A); color: #92400E; border: 1.2px solid #F59E0B; border-radius: 5px; padding: 1.5px 6px; font-size: 8.5px; font-weight: 900; display: inline-flex; align-items: center; gap: 3.5px; margin-top: 2.5px; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.25); text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.2; width: fit-content;"
      >
        <span style="font-size: 9.5px;">⚠️</span>
        <span>Cadastrar Local</span>
      </div>
    ` : ''}
  `;

  const dateBadge = getPlaceDateBadgeInfo(place);

  return L.divIcon({
    className: 'custom-place-marker',
    html: `
      <div class="place-marker-bubble ${isSelected ? 'selected' : ''}">
        <!-- Alfinete com Caixinha 3D Oficial da Operação (cores originais ou cinza claro quando múltiplo) -->
        <div class="place-marker-pin ${isMultiple ? 'type-multiple' : `type-${opType}`}">
          <svg width="38" height="48" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Sombra no solo -->
            <ellipse cx="19" cy="43" rx="7.5" ry="2.2" fill="rgba(0, 0, 0, 0.28)" />

            <!-- Xzinho na ponta do alfinete marcando o ponto exato no solo -->
            <path d="M 14 38 L 24 48 M 14 48 L 24 38" stroke="#FFFFFF" stroke-width="3.8" stroke-linecap="round" />
            <path d="M 14 38 L 24 48 M 14 48 L 24 38" stroke="${pinColor}" stroke-width="2.2" stroke-linecap="round" />

            <!-- Risquinho fininho do alfinete -->
            <line x1="19" y1="26" x2="19" y2="43" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" />
            <line x1="19" y1="26" x2="19" y2="43" stroke="${pinColor}" stroke-width="1.8" stroke-linecap="round" />

            <!-- Ponto central no cruzamento do X -->
            <circle cx="19" cy="43" r="1.4" fill="#FFFFFF" />

            <!-- Caixinha de entrega ou encomenda 3D nas cores oficiais (ou cinza claro) -->
            <path d="M 19 2 L 32 8.5 L 32 20.5 L 19 27 L 6 20.5 L 6 8.5 Z" fill="${darkColor}" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round" />

            <!-- Face Superior da Caixa (tampa - mais clarinha) -->
            <path d="M 19 2.5 L 31.5 8.5 L 19 14.5 L 6.5 8.5 Z" fill="${topLightColor}" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />

            <!-- Face Esquerda da Caixa -->
            <path d="M 6.5 8.5 L 19 14.5 L 19 26.5 L 6.5 20.5 Z" fill="${mainColor}" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />

            <!-- Face Direita da Caixa -->
            <path d="M 19 14.5 L 31.5 8.5 L 31.5 20.5 L 19 26.5 Z" fill="${darkColor}" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />

            <!-- Fitas de encomenda brancas na caixa -->
            <path d="M 12.8 5.5 L 25.2 11.5" stroke="rgba(255, 255, 255, 0.92)" stroke-width="2" stroke-linecap="round" />
            <path d="M 19 14.5 L 19 26.5" stroke="rgba(255, 255, 255, 0.92)" stroke-width="2" stroke-linecap="round" />

            ${symbolSvg}
          </svg>
        </div>

        <!-- Etiqueta com Fundo Translúcido: NOME DO LOCAL EM CIMA, NOME DO CLIENTE EMBAIXO -->
        <div class="place-marker-label ${isMultiple ? 'type-multiple is-multiple' : `type-${opType}`} ${placePhoto && !driverStatus ? 'has-photo' : 'no-photo'}">
          ${driverStatus ? '' : `
          <!-- BADGE FLUTUANTE NO CANTO SUPERIOR DIREITO -->
          <span class="place-marker-date-badge badge-${dateBadge.type}">
            ${dateBadge.iconSvg}
            <span>${dateBadge.label}</span>
          </span>
          `}

          ${driverStatus ? '' : placePhoto ? `
            <!-- FOTO NO LUGAR DO ÍCONE DA LABEL: TOQUE PARA ABRIR CHEIA NA TELA -->
            <div class="place-marker-label-photo-thumb place-marker-photo-trigger" data-photo-url="${placePhoto}" title="Clique para abrir foto cheia na tela">
              <img src="${placePhoto}" alt="Foto da encomenda" class="place-marker-thumb-img" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=120&auto=format&fit=crop&q=70';" />
              <div class="place-marker-thumb-hover">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </div>
            </div>
          ` : `
            <span style="font-size: 16px; align-self: center; flex-shrink: 0;">${opEmoji}</span>
          `}

          <div class="place-marker-text-group">
            <!-- 1. NOME DO LOCAL EM CIMA (EM DESTAQUE) -->
            ${driverStatus ? '' : `<div class="place-marker-header-row">
              <span class="place-marker-place">${cleanPlaceName}</span>
              ${isCollectionCenter
                ? `<span class="place-marker-op-badge" style="background: linear-gradient(135deg, #0F766E, #115E59); border: 1.2px solid #99F6E4; color: #FFFFFF; font-size: 9px; font-weight: 900; padding: 1.5px 5px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.02em;">CENTRAL DE COLETA</span>`
                : isPublicForDriver
                ? `<span class="place-marker-op-badge" style="background: linear-gradient(135deg, #F59E0B, #D97706); border: 1.2px solid #FDE68A; color: #FFFFFF; font-size: 9px; font-weight: 900; padding: 1.5px 5px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.02em;">⚡ ${isMultiple ? `${placesAtLocation.length} PEDIDOS` : 'DISPONÍVEL'}</span>`
                : isMultiple 
                ? `<span class="place-marker-count-pill" style="background: #475569; border: 1px solid #CBD5E1; color: #ffffff; font-size: 9px; font-weight: 900; padding: 1px 6px; border-radius: 9999px;">${placesAtLocation.length} no local</span>${sumTotalValues > 0 ? `<span class="place-marker-sum-pill" style="background: #059669; border: 1px solid #6EE7B7; color: #ffffff; font-size: 9px; font-weight: 900; padding: 1px 6px; border-radius: 9999px; margin-left: 2px;">Total: R$ ${sumTotalValues.toFixed(2)}</span>` : ''}` 
                : `<span class="place-marker-op-badge" style="background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.45); border-radius: 4px; padding: 1px 4px; font-size: 9px; font-weight: 900; text-transform: uppercase;">${opType === 'coleta' ? 'Coleta' : opType === 'troca' ? 'Troca' : place.orderStage === 'retorno' ? 'Retorno' : 'Entrega'}</span>`
              }
            </div>
            <!-- 2. NOME DO CLIENTE EMBAIXO COM VEÍCULO NA FRENTE OU LISTAGEM COM FUNDO E BORDA -->
            ${customerContentHtml}`}
            ${driverStatus ? `
              <!-- Marker já direcionado a um motorista: label compacta só com o motorista -->
              <div
                class="place-marker-driver-status"
                style="background: ${driverStatus.enRoute ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'linear-gradient(135deg, #10B981, #059669)'}; color: #FFFFFF; font-size: 11px; font-weight: 900; padding: 4px 9px; border-radius: 6px; display: flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); border: 1.2px solid ${driverStatus.enRoute ? '#93C5FD' : '#6EE7B7'}; letter-spacing: 0.02em; white-space: nowrap; width: fit-content; max-width: 230px; overflow: hidden; text-overflow: ellipsis;"
              >
                <span>${driverStatus.enRoute ? '🛵' : '✔'} ${driverStatus.text}</span>
              </div>
            ` : ''}
            ${isPublicForDriver ? `
              <!-- AVISO DE CONFIRMAÇÃO DO MOTORISTA -->
              <div 
                class="place-marker-claim-prompt" 
                style="background: linear-gradient(135deg, #10B981, #059669); color: #FFFFFF; font-size: 9.5px; font-weight: 900; padding: 2.5px 7px; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 3.5px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); border: 1.2px solid #6EE7B7; text-transform: uppercase; letter-spacing: 0.02em;"
              >
                <span>⚡ ${isMultiple ? 'TOQUE PARA ESCOLHER O PEDIDO' : 'TOQUE PARA ACEITAR O PEDIDO'}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `,
    iconSize: [360, driverStatus ? 54 : (isMultiple ? (placesAtLocation.length > 2 ? 120 : 96) : (isPublicForDriver ? 104 : isSingleMissing ? 96 : 74))],
    iconAnchor: [19, 43],
    popupAnchor: [0, -43]
  });
};

// Mascote / Bichinho em Moto de Entrega Estilizada
const getMotoMascotSvg = (color: string) => `
<svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Guidão e Retrovisores -->
  <path d="M 6 15 C 6 12 12 13 17 13 C 22 13 28 12 28 15" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" />
  <circle cx="5.5" cy="13.5" r="1.8" fill="${color}" stroke="#FFFFFF" stroke-width="1" />
  <circle cx="28.5" cy="13.5" r="1.8" fill="${color}" stroke="#FFFFFF" stroke-width="1" />

  <!-- Cabeça / Capacete do Mascote Entregador -->
  <ellipse cx="17" cy="8.5" rx="6.5" ry="6" fill="${color}" stroke="#FFFFFF" stroke-width="1.6" />
  <!-- Viseira do Capacete com brilho espelhado -->
  <path d="M 12 7.5 C 13.5 5.5 20.5 5.5 22 7.5 C 22 10.5 12 10.5 12 7.5 Z" fill="#0f172a" stroke="#FFFFFF" stroke-width="1" />
  <path d="M 13.5 7.5 C 14.5 6.5 18 6.5 19 7" stroke="#38bdf8" stroke-width="1.2" stroke-linecap="round" />
  
  <!-- Carenagem / Frente da Moto -->
  <path d="M 11 15 L 23 15 L 21 24 L 17 27 L 13 24 Z" fill="${color}" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round" />
  
  <!-- Farol da Moto Iluminado em Amarelo/Branco -->
  <circle cx="17" cy="19" r="3.2" fill="#FEF08A" stroke="#FFFFFF" stroke-width="1.2" />
  <circle cx="17" cy="19" r="1.6" fill="#FFFFFF" />
  
  <!-- Pneu Dianteiro e Paralama -->
  <rect x="15" y="24" width="4" height="6.5" rx="2" fill="#1e293b" stroke="#FFFFFF" stroke-width="1" />
  <path d="M 13 24 C 13 22 21 22 21 24" stroke="#FFFFFF" stroke-width="1.2" />
</svg>
`;

// Mascote / Bichinho em Carro de Entrega Estilizado
const getCarMascotSvg = (color: string) => `
<svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Luz de Entrega / Antena no Teto -->
  <rect x="14.5" y="3" width="5" height="2.5" rx="1.2" fill="#FEF08A" stroke="#FFFFFF" stroke-width="1" />
  
  <!-- Teto da Cabine -->
  <path d="M 9 11 L 11 5.5 L 23 5.5 L 25 11 Z" fill="${color}" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round" />
  
  <!-- Para-brisa com Motorista Mascote Visível Dentro -->
  <path d="M 10 11.5 L 12 6.8 L 22 6.8 L 24 11.5 Z" fill="#0f172a" stroke="#FFFFFF" stroke-width="1" />
  <!-- Capacete/Mascote no volante acenando -->
  <circle cx="15.5" cy="9.5" r="2.2" fill="${color}" stroke="#FFFFFF" stroke-width="0.8" />
  <path d="M 14.5 9 C 15 8.5 16.5 8.5 17 9" stroke="#38bdf8" stroke-width="0.8" />
  <!-- Volante visível -->
  <ellipse cx="19.5" cy="10.8" rx="1.8" ry="1" fill="#334155" stroke="#FFFFFF" stroke-width="0.6" />
  
  <!-- Capô e Carroceria do Carro -->
  <path d="M 5 12 C 5 11.5 29 11.5 29 12 L 28 23 C 28 24.5 6 24.5 6 23 Z" fill="${color}" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round" />
  
  <!-- Faróis Dianteiros Brilhantes -->
  <circle cx="9" cy="15.5" r="2.5" fill="#FEF08A" stroke="#FFFFFF" stroke-width="1.2" />
  <circle cx="9" cy="15.5" r="1.1" fill="#FFFFFF" />
  <circle cx="25" cy="15.5" r="2.5" fill="#FEF08A" stroke="#FFFFFF" stroke-width="1.2" />
  <circle cx="25" cy="15.5" r="1.1" fill="#FFFFFF" />
  
  <!-- Grade Frontal com Raio Zap ⚡ -->
  <rect x="13" y="14" width="8" height="4" rx="1.2" fill="#0f172a" stroke="#FFFFFF" stroke-width="0.9" />
  <path d="M 17 14.5 L 15.8 16.2 H 17.5 L 17 17.8" stroke="#FDE047" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />
  
  <!-- Para-choque e Pneus -->
  <rect x="7" y="22" width="20" height="3" rx="1.5" fill="#1e293b" stroke="#FFFFFF" stroke-width="1" />
  <rect x="4" y="19" width="3" height="6.5" rx="1.5" fill="#0f172a" />
  <rect x="27" y="19" width="3" height="6.5" rx="1.5" fill="#0f172a" />
</svg>
`;

// Mascote / Bichinho em Utilitário / Furgão de Carga Estilizado
const getUtilitarioMascotSvg = (color: string) => `
<svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Luz de Carga / Sirene no Teto -->
  <rect x="13" y="2" width="8" height="2.5" rx="1.2" fill="#FEF08A" stroke="#FFFFFF" stroke-width="1" />
  
  <!-- Baú de Carga Alto -->
  <rect x="5" y="4.5" width="24" height="18.5" rx="2" fill="${color}" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round" />
  
  <!-- Faixa Lateral com Raio Zap ⚡ -->
  <path d="M 5 13 H 29" stroke="rgba(255, 255, 255, 0.9)" stroke-width="1.8" />
  
  <!-- Cabine Dianteira e Para-brisa com Motorista Mascote -->
  <rect x="9" y="6.5" width="16" height="5.5" rx="1.5" fill="#0f172a" stroke="#FFFFFF" stroke-width="1" />
  <circle cx="14" cy="9.2" r="2.2" fill="${color}" stroke="#FFFFFF" stroke-width="0.8" />
  <path d="M 13 8.5 C 14 8 15.5 8 16 8.5" stroke="#38bdf8" stroke-width="0.8" />
  <ellipse cx="19" cy="10.2" rx="1.8" ry="1" fill="#334155" stroke="#FFFFFF" stroke-width="0.6" />

  <!-- Faróis Dianteiros de Carga -->
  <circle cx="8.5" cy="17" r="2.4" fill="#FEF08A" stroke="#FFFFFF" stroke-width="1.2" />
  <circle cx="8.5" cy="17" r="1.1" fill="#FFFFFF" />
  <circle cx="25.5" cy="17" r="2.4" fill="#FEF08A" stroke="#FFFFFF" stroke-width="1.2" />
  <circle cx="25.5" cy="17" r="1.1" fill="#FFFFFF" />

  <!-- Grade Frontal e Raio ⚡ -->
  <rect x="13" y="15.5" width="8" height="4" rx="1" fill="#0f172a" stroke="#FFFFFF" stroke-width="0.9" />
  <path d="M 17 16 L 15.8 17.5 H 17.5 L 17 19" stroke="#FDE047" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />

  <!-- Pneus Robustos e Para-choque -->
  <rect x="6" y="22" width="22" height="3.5" rx="1.5" fill="#1e293b" stroke="#FFFFFF" stroke-width="1" />
  <rect x="3.5" y="19" width="3.5" height="7" rx="1.5" fill="#0f172a" />
  <rect x="27" y="19" width="3.5" height="7" rx="1.5" fill="#0f172a" />
</svg>
`;

// Helper para converter cor hexadecimal ou rgb em rgba com transparência suave
export const hexToRgba = (hexOrRgb: string, alpha = 0.85): string => {
  if (!hexOrRgb) return `rgba(11, 81, 135, ${alpha})`;
  if (hexOrRgb.startsWith('rgba')) {
    return hexOrRgb.replace(/[\d\.]+\)$/g, `${alpha})`);
  }
  if (hexOrRgb.startsWith('rgb')) {
    return hexOrRgb.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
  }
  let c = hexOrRgb.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const r = parseInt(c.substring(0, 2), 16) || 11;
  const g = parseInt(c.substring(2, 4), 16) || 81;
  const b = parseInt(c.substring(4, 6), 16) || 135;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Helper para extrair o tipo de veículo do perfil do usuário
export const getUserVehicleType = (userObj?: any): 'moto' | 'carro' | 'utilitario' => {
  if (!userObj) return 'moto';
  if (userObj.vehicleType) {
    const vt = String(userObj.vehicleType).toLowerCase();
    if (vt.includes('carro')) return 'carro';
    if (vt.includes('util') || vt.includes('van') || vt.includes('fiorino') || vt.includes('caminh')) return 'utilitario';
    return 'moto';
  }
  const combined = `${userObj.role || ''} ${userObj.name || ''} ${userObj.vehicle || ''}`.toLowerCase();
  if (combined.includes('utilit') || combined.includes('van') || combined.includes('fiorino') || combined.includes('caminh')) {
    return 'utilitario';
  }
  if (combined.includes('carro')) {
    return 'carro';
  }
  return 'moto';
};

// Gerador de SVG 3D para veículos no mapa (Moto, Carro, Utilitário) com rotação suave de rumo (Heading)
export const get3DVehicleSvg = (
  vehicleType: 'moto' | 'carro' | 'utilitario' = 'moto',
  heading: number = 0,
  accentColor: string = '#FF5E00',
  uid: string = 'v'
): string => {
  const currentAngle = typeof heading === 'number' && !isNaN(heading) ? Math.round(heading) : 0;
  const safeColor = accentColor || '#FF5E00';

  if (vehicleType === 'moto') {
    return `
      <div class="vehicle-3d-rotating-disc" style="transform: translate(-50%, -50%) rotate(${currentAngle}deg);">
        <svg width="54" height="54" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="moto-shadow-${uid}" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="1" dy="4" stdDeviation="3" flood-color="rgba(0, 0, 0, 0.42)" />
            </filter>
            <linearGradient id="moto-headlight-${uid}" x1="32" y1="18" x2="32" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="rgba(255, 245, 180, 0.55)" />
              <stop offset="100%" stop-color="rgba(255, 245, 180, 0)" />
            </linearGradient>
            <radialGradient id="moto-helmet-${uid}" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#475569" />
              <stop offset="70%" stop-color="#1E293B" />
              <stop offset="100%" stop-color="#0F172A" />
            </radialGradient>
            <linearGradient id="moto-box-${uid}" x1="21" y1="37" x2="43" y2="55" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="${safeColor}" />
              <stop offset="100%" stop-color="#C2410C" />
            </linearGradient>
          </defs>

          <!-- Feixe do Farol iluminando para frente -->
          <polygon points="32,16 16,0 48,0" fill="url(#moto-headlight-${uid})" />

          <!-- Corpo 3D da Moto com Sombra -->
          <g filter="url(#moto-shadow-${uid})">
            <!-- Sombra do Chassi no Solo -->
            <ellipse cx="32" cy="35" rx="7.5" ry="17" fill="rgba(0,0,0,0.28)" />

            <!-- Roda e Para-lama Dianteiro -->
            <rect x="29.5" y="10" width="5" height="12" rx="2.5" fill="#0F172A" stroke="#CBD5E1" stroke-width="0.8" />
            <rect x="30.5" y="12" width="3" height="7" rx="1.5" fill="#64748B" />

            <!-- Pneu traseiro aparecendo sob o baú -->
            <rect x="29.5" y="52" width="5" height="11" rx="2.5" fill="#0F172A" stroke="#CBD5E1" stroke-width="0.8" />

            <!-- Guidão, punhos e braços do piloto -->
            <path d="M 20 22 L 44 22" stroke="#1E293B" stroke-width="3" stroke-linecap="round" />
            <circle cx="19" cy="20" r="2.4" fill="#CBD5E1" stroke="#1E293B" stroke-width="1" />
            <circle cx="45" cy="20" r="2.4" fill="#CBD5E1" stroke="#1E293B" stroke-width="1" />
            <path d="M 25 29 L 20.5 22 M 39 29 L 43.5 22" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" />
            <path d="M 25 29 L 20.5 22 M 39 29 L 43.5 22" stroke="#1E293B" stroke-width="1.8" stroke-linecap="round" />
            <!-- Farol Central -->
            <circle cx="32" cy="18" r="3" fill="#FEF08A" stroke="#F59E0B" stroke-width="1.2" />

            <!-- Chassi / Tanque -->
            <path d="M 27 23 L 37 23 L 36 34 L 28 34 Z" fill="#334155" stroke="#FFFFFF" stroke-width="1" />

            <!-- Piloto (Ombros, mochila e Capacete com viseira) -->
            <ellipse cx="32" cy="30" rx="9" ry="4.5" fill="#1E293B" stroke="#FFFFFF" stroke-width="1.2" />
            <circle cx="32" cy="28" r="6.2" fill="${safeColor}" stroke="#FFFFFF" stroke-width="1.6" />
            <path d="M 32 21.8 L 32 34" stroke="#FFFFFF" stroke-width="1.6" opacity="0.9" />
            <path d="M 28.6 25.2 Q 32 23.6 35.4 25.2" stroke="#0F172A" stroke-width="2.2" stroke-linecap="round" />

            <!-- Baú de Carga Traseiro (3D) -->
            <rect x="21" y="37" width="22" height="16" rx="3.5" fill="url(#moto-box-${uid})" stroke="#FFFFFF" stroke-width="1.8" />
            <line x1="21" y1="41.5" x2="43" y2="41.5" stroke="rgba(255,255,255,0.7)" stroke-width="1" />
            <text x="32" y="50" font-size="8.5" font-weight="900" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif">EZ</text>
            <rect x="29" y="52.4" width="6" height="2" rx="1" fill="#EF4444" />
          </g>
        </svg>
      </div>
    `;
  }

  if (vehicleType === 'carro') {
    return `
      <div class="vehicle-3d-rotating-disc" style="transform: translate(-50%, -50%) rotate(${currentAngle}deg);">
        <svg width="54" height="54" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="car-shadow-${uid}" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="1" dy="4" stdDeviation="3.5" flood-color="rgba(0, 0, 0, 0.45)" />
            </filter>
            <linearGradient id="car-headlight-l-${uid}" x1="24" y1="14" x2="16" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="rgba(255, 245, 180, 0.5)" />
              <stop offset="100%" stop-color="rgba(255, 245, 180, 0)" />
            </linearGradient>
            <linearGradient id="car-headlight-r-${uid}" x1="40" y1="14" x2="48" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="rgba(255, 245, 180, 0.5)" />
              <stop offset="100%" stop-color="rgba(255, 245, 180, 0)" />
            </linearGradient>
            <linearGradient id="car-body-${uid}" x1="18" y1="12" x2="46" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#38BDF8" />
              <stop offset="50%" stop-color="${safeColor}" />
              <stop offset="100%" stop-color="#0F172A" />
            </linearGradient>
            <linearGradient id="car-glass-${uid}" x1="22" y1="20" x2="42" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#E0F2FE" />
              <stop offset="60%" stop-color="#7DD3FC" />
              <stop offset="100%" stop-color="#0284C7" />
            </linearGradient>
          </defs>

          <!-- Feixes dos Faróis Dianteiros -->
          <polygon points="23,12 10,0 26,0" fill="url(#car-headlight-l-${uid})" />
          <polygon points="41,12 38,0 54,0" fill="url(#car-headlight-r-${uid})" />

          <!-- Carro 3D com Sombra no Solo -->
          <g filter="url(#car-shadow-${uid})">
            <!-- Rodas e Pneus -->
            <rect x="15" y="16" width="4" height="9" rx="2" fill="#0F172A" />
            <rect x="45" y="16" width="4" height="9" rx="2" fill="#0F172A" />
            <rect x="15" y="42" width="4" height="9" rx="2" fill="#0F172A" />
            <rect x="45" y="42" width="4" height="9" rx="2" fill="#0F172A" />

            <!-- Retrovisores Laterais -->
            <rect x="14" y="24" width="4.5" height="3" rx="1.5" fill="${safeColor}" stroke="#FFFFFF" stroke-width="0.8" />
            <rect x="45.5" y="24" width="4.5" height="3" rx="1.5" fill="${safeColor}" stroke="#FFFFFF" stroke-width="0.8" />

            <!-- Chassi / Carroceria do Carro -->
            <path d="M 22 10 C 26 9, 38 9, 42 10 C 45 11, 46 15, 46 22 L 46 48 C 46 54, 43 57, 39 57 L 25 57 C 21 57, 18 54, 18 48 L 18 22 C 18 15, 19 11, 22 10 Z" fill="url(#car-body-${uid})" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round" />

            <!-- Nervuras do Capô -->
            <path d="M 26 12 L 26 18 M 38 12 L 38 18" stroke="#BAE6FD" stroke-width="1" stroke-linecap="round" />

            <!-- Para-brisa Dianteiro Curvo com Reflexo -->
            <path d="M 22 21 C 26 19, 38 19, 42 21 L 43 28 L 21 28 Z" fill="url(#car-glass-${uid})" stroke="#0C4A6E" stroke-width="0.8" />
            <line x1="24" y1="23" x2="33" y2="27" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.75" />

            <!-- Teto e Frisos -->
            <rect x="23" y="28.5" width="18" height="15" rx="2" fill="${safeColor}" stroke="rgba(255,255,255,0.4)" stroke-width="1" />
            <rect x="26" y="31" width="12" height="10" rx="1.5" fill="rgba(0,0,0,0.15)" stroke="#BAE6FD" stroke-width="0.6" opacity="0.7" />

            <!-- Vidro Traseiro -->
            <path d="M 22 45 L 42 45 L 41 50 C 37 51, 27 51, 23 50 Z" fill="url(#car-glass-${uid})" stroke="#0C4A6E" stroke-width="0.8" />

            <!-- Lâmpadas dos Faróis -->
            <ellipse cx="22" cy="11.5" rx="2.5" ry="1.5" fill="#FEF08A" stroke="#F59E0B" stroke-width="0.8" />
            <ellipse cx="42" cy="11.5" rx="2.5" ry="1.5" fill="#FEF08A" stroke="#F59E0B" stroke-width="0.8" />

            <!-- Lanternas Traseiras Vermelhas -->
            <rect x="20" y="55.5" width="4" height="2" rx="1" fill="#EF4444" />
            <rect x="40" y="55.5" width="4" height="2" rx="1" fill="#EF4444" />
          </g>
        </svg>
      </div>
    `;
  }

  // Utilitário / Furgão / Fiorino / Carga
  return `
    <div class="vehicle-3d-rotating-disc" style="transform: translate(-50%, -50%) rotate(${currentAngle}deg);">
      <svg width="54" height="54" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="van-shadow-${uid}" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="1" dy="4.5" stdDeviation="4" flood-color="rgba(0, 0, 0, 0.48)" />
          </filter>
          <linearGradient id="van-headlight-l-${uid}" x1="24" y1="12" x2="14" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(255, 245, 180, 0.55)" />
            <stop offset="100%" stop-color="rgba(255, 245, 180, 0)" />
          </linearGradient>
          <linearGradient id="van-headlight-r-${uid}" x1="40" y1="12" x2="50" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(255, 245, 180, 0.55)" />
            <stop offset="100%" stop-color="rgba(255, 245, 180, 0)" />
          </linearGradient>
          <linearGradient id="van-cabin-${uid}" x1="20" y1="8" x2="44" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FFFFFF" />
            <stop offset="100%" stop-color="#E2E8F0" />
          </linearGradient>
          <linearGradient id="van-box-${uid}" x1="16" y1="24" x2="48" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#F8FAFC" />
            <stop offset="50%" stop-color="#E2E8F0" />
            <stop offset="100%" stop-color="#CBD5E1" />
          </linearGradient>
          <linearGradient id="van-glass-${uid}" x1="22" y1="15" x2="42" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#E0F2FE" />
            <stop offset="100%" stop-color="#38BDF8" />
          </linearGradient>
        </defs>

        <!-- Faróis iluminando para frente -->
        <polygon points="23,10 8,0 26,0" fill="url(#van-headlight-l-${uid})" />
        <polygon points="41,10 38,0 56,0" fill="url(#van-headlight-r-${uid})" />

        <!-- Furgão Utilitário 3D com Sombra no Solo -->
        <g filter="url(#van-shadow-${uid})">
          <!-- Pneus -->
          <rect x="14" y="16" width="4.5" height="10" rx="2" fill="#0F172A" />
          <rect x="45.5" y="16" width="4.5" height="10" rx="2" fill="#0F172A" />
          <rect x="14" y="44" width="4.5" height="10" rx="2" fill="#0F172A" />
          <rect x="45.5" y="44" width="4.5" height="10" rx="2" fill="#0F172A" />

          <!-- Retrovisores Grandes de Utilitário -->
          <rect x="13" y="19" width="5" height="3" rx="1.5" fill="#1E293B" stroke="#FFFFFF" stroke-width="0.8" />
          <rect x="46" y="19" width="5" height="3" rx="1.5" fill="#1E293B" stroke="#FFFFFF" stroke-width="0.8" />

          <!-- Cabine Dianteira -->
          <path d="M 22 8 C 26 7, 38 7, 42 8 C 45 9, 46 12, 46 17 L 46 23 L 18 23 L 18 17 C 18 12, 19 9, 22 8 Z" fill="url(#van-cabin-${uid})" stroke="#94A3B8" stroke-width="1.2" />

          <!-- Para-brisa da Cabine -->
          <path d="M 21 16 C 26 14, 38 14, 43 16 L 43 22 L 21 22 Z" fill="url(#van-glass-${uid})" stroke="#0284C7" stroke-width="0.8" />
          <line x1="24" y1="18" x2="34" y2="21" stroke="#FFFFFF" stroke-width="1.2" opacity="0.8" />

          <!-- Baú Traseiro de Carga Volumosa -->
          <rect x="17" y="23" width="30" height="35" rx="3" fill="url(#van-box-${uid})" stroke="#94A3B8" stroke-width="1.4" />

          <!-- Nervuras Estruturais no Teto do Baú -->
          <line x1="22" y1="25" x2="22" y2="55" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" opacity="0.6" />
          <line x1="27" y1="25" x2="27" y2="55" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" opacity="0.6" />
          <line x1="32" y1="25" x2="32" y2="55" stroke="#94A3B8" stroke-width="1.4" stroke-linecap="round" opacity="0.7" />
          <line x1="37" y1="25" x2="37" y2="55" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" opacity="0.6" />
          <line x1="42" y1="25" x2="42" y2="55" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" opacity="0.6" />

          <!-- Divisão das Portas Traseiras Duplas -->
          <line x1="32" y1="53" x2="32" y2="58" stroke="#475569" stroke-width="1.6" />
          <circle cx="30" cy="55.5" r="1" fill="#475569" />
          <circle cx="34" cy="55.5" r="1" fill="#475569" />

          <!-- Faróis Dianteiros -->
          <circle cx="21" cy="9.5" r="2.2" fill="#FEF08A" stroke="#F59E0B" stroke-width="0.8" />
          <circle cx="43" cy="9.5" r="2.2" fill="#FEF08A" stroke="#F59E0B" stroke-width="0.8" />

          <!-- Lanternas Traseiras -->
          <rect x="18" y="56.5" width="4.5" height="2" rx="1" fill="#EF4444" />
          <rect x="41.5" y="56.5" width="4.5" height="2" rx="1" fill="#EF4444" />
        </g>
      </svg>
    </div>
  `;
};

// Gerador da Seta 3D de Navegação Estilo Google Maps (para Admin, Atendente e Terminal)
export const get3DGmapsArrowSvg = (
  heading: number = 0,
  isTracking: boolean = false,
  uid: string = 'arrow'
): string => {
  const currentAngle = typeof heading === 'number' && !isNaN(heading) ? Math.round(heading) : 0;

  return `
    <div class="vehicle-3d-rotating-disc" style="transform: translate(-50%, -50%) rotate(${currentAngle}deg);">
      <svg width="52" height="52" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="gmaps-shadow-${uid}" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="rgba(0, 30, 80, 0.45)" />
          </filter>
          <linearGradient id="gmaps-left-${uid}" x1="16" y1="12" x2="32" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#4285F4" />
            <stop offset="100%" stop-color="#1A73E8" />
          </linearGradient>
          <linearGradient id="gmaps-right-${uid}" x1="48" y1="12" x2="32" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1A73E8" />
            <stop offset="100%" stop-color="#1557B0" />
          </linearGradient>
          <radialGradient id="gmaps-glow-${uid}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(66, 133, 244, 0.35)" />
            <stop offset="100%" stop-color="rgba(66, 133, 244, 0)" />
          </radialGradient>
        </defs>

        <!-- Seta de Navegação 3D com Borda Branca e Facetas em Gradiente -->
        <g filter="url(#gmaps-shadow-${uid})">
          <!-- Asa Esquerda (Face Iluminada) -->
          <path d="M 32 8 L 13 48 L 32 38 Z" fill="url(#gmaps-left-${uid})" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round" />
          <!-- Asa Direita (Face em Sombra) -->
          <path d="M 32 8 L 51 48 L 32 38 Z" fill="url(#gmaps-right-${uid})" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round" />
          <!-- Friso Central de Relevo -->
          <line x1="32" y1="9" x2="32" y2="38" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity="0.8" />
          <!-- Brilho no Topo da Ponta -->
          <circle cx="32" cy="9.5" r="1.8" fill="#FFFFFF" />
        </g>
      </svg>
    </div>
  `;
};

// Marcador do Motorista na tela do Admin / Atendente / Terminal (Mostra o Veículo 3D com a tag do motorista no centro da bola que pulsa)
const createDriverMarkerIcon = (driver: Driver, isSelected: boolean) => {
  const vehicleEmoji = driver.vehicleType === 'moto' ? '🏍️' : driver.vehicleType === 'utilitario' ? '🚚' : '🚗';
  const headingAngle = typeof driver.heading === 'number' && !isNaN(driver.heading) ? Math.round(driver.heading) : 0;
  const parts = (driver.name || 'Motorista').trim().split(/\s+/);
  const cleanDriverName = parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];
  const driverLabelBg = hexToRgba(driver.color, 0.92);

  // A última hora que foi visto (formato HH:mm)
  let lastSeenHour = '';
  if (driver.lastSeenTimestamp && !isNaN(driver.lastSeenTimestamp)) {
    lastSeenHour = new Date(driver.lastSeenTimestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (driver.lastUpdatedStr) {
    const match = driver.lastUpdatedStr.match(/(\d{2}:\d{2})/);
    lastSeenHour = match ? match[1] : driver.lastUpdatedStr;
  } else {
    lastSeenHour = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  const vType = (driver.vehicleType || 'moto') as 'moto' | 'carro' | 'utilitario';
  const vehicleSvg = get3DVehicleSvg(vType, headingAngle, driver.color, `drv-${driver.id}`);
  const isOnlineOrMoving = driver.status === 'em_rota' || driver.status === 'disponivel';

  return L.divIcon({
    className: 'custom-driver-marker',
    html: `
      <div class="driver-3d-card ${isSelected ? 'selected' : ''}">
        <div class="driver-3d-tag" style="background: ${driverLabelBg};">
          <span>${vehicleEmoji}</span>
          <span>${cleanDriverName}</span>
          <span class="driver-3d-time">${lastSeenHour}</span>
        </div>
        <div class="driver-vehicle-relative-wrap">
          ${isOnlineOrMoving ? `<div class="vehicle-pulse-radar" style="border-color: ${driver.color}; background: ${hexToRgba(driver.color, 0.22)}; box-shadow: 0 0 16px ${hexToRgba(driver.color, 0.45)};"></div>` : ''}
          <div class="vehicle-pulse-halo" style="background: ${hexToRgba(driver.color, 0.24)}; border-color: ${hexToRgba(driver.color, 0.6)};"></div>
          <div class="vehicle-pulse-ball" style="background: ${driver.color}; box-shadow: 0 2px 10px ${hexToRgba(driver.color, 0.75)};"></div>
          ${vehicleSvg}
        </div>
      </div>
    `,
    iconSize: [80, 92],
    iconAnchor: [40, 58],
    popupAnchor: [0, -58]
  });
};

// Marcador do Usuário / GPS Ao Vivo:
// - Para Admin, Atendente ou Terminal: Seta de Navegação 3D no centro da bola que pulsa
// - Para Motorista: Veículo 3D andando no mapa (Moto, Carro ou Utilitário) no centro da bola que pulsa
const createUserLocationIcon = (
  role: UserRole = 'motorista',
  vehicleType: 'moto' | 'carro' | 'utilitario' = 'moto',
  heading: number | null = null,
  isTracking: boolean = false
) => {
  const currentAngle = heading !== null && !isNaN(heading) ? Math.round(heading) : 0;

  // Se for admin_geral, atendente ou terminal -> Seta de Navegação 3D no centro da bola que pulsa
  if (role === 'admin_geral' || role === 'atendente' || role === 'terminal') {
    const arrowSvg = get3DGmapsArrowSvg(currentAngle, isTracking, 'user-nav-arrow');
    return L.divIcon({
      className: 'user-location-wrapper',
      html: `
        <div class="google-maps-3d-arrow-wrap">
          <div class="vehicle-pulse-radar"></div>
          <div class="vehicle-pulse-halo"></div>
          <div class="vehicle-pulse-ball"></div>
          ${arrowSvg}
        </div>
      `,
      iconSize: [64, 64],
      iconAnchor: [32, 32]
    });
  }

  // Se for motorista -> Veículo 3D andando no mapa (moto, carro ou utilitário) no centro da bola que pulsa
  const vehicleSvg = get3DVehicleSvg(vehicleType, currentAngle, '#FF5E00', 'user-vehicle');
  return L.divIcon({
    className: 'user-location-wrapper',
    html: `
      <div class="vehicle-3d-marker-wrap">
        <div class="vehicle-pulse-radar"></div>
        <div class="vehicle-pulse-halo"></div>
        <div class="vehicle-pulse-ball"></div>
        ${vehicleSvg}
      </div>
    `,
    iconSize: [64, 64],
    iconAnchor: [32, 32]
  });
};

// Helper to compute bearing in degrees between two coordinates (0 = North, 90 = East, etc.)
const computeBearing = (startLat: number, startLng: number, endLat: number, endLng: number): number => {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const endLatRad = (endLat * Math.PI) / 180;
  const endLngRad = (endLng * Math.PI) / 180;

  const y = Math.sin(endLngRad - startLngRad) * Math.cos(endLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(endLatRad) -
    Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(endLngRad - startLngRad);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// Marcador do Xzinho no Solo (Ponto Concluído: Coleta, Troca ou Entrega realizada do dia atual)
const createCompletedXIcon = (mark: CompletedWaypointMark) => {
  const color = mark.operationType === 'coleta' 
    ? '#0B5187' 
    : mark.operationType === 'troca' 
    ? '#7C3AED' 
    : '#FF5E00';

  const opLabel = mark.operationType === 'coleta' 
    ? 'Coletado' 
    : mark.operationType === 'troca' 
    ? 'Trocado' 
    : 'Entregue';

  return L.divIcon({
    className: 'completed-waypoint-x-marker',
    html: `
      <div class="completed-x-marker-wrap" title="✓ ${opLabel} às ${mark.timeStr} • ${mark.placeName}">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Sombra circular/oval de contato no asfalto -->
          <ellipse cx="14" cy="16" rx="9" ry="3.8" fill="rgba(0, 0, 0, 0.38)" />

          <!-- Xzinho branco (borda de alto contraste para destacar no asfalto) -->
          <path d="M 7 7 L 21 21 M 7 21 L 21 7" stroke="#FFFFFF" stroke-width="4.8" stroke-linecap="round" />

          <!-- Xzinho na cor exata oficial da operação (Azul para Coleta, Laranja para Entrega, Roxo para Troca) -->
          <path d="M 7 7 L 21 21 M 7 21 L 21 7" stroke="${color}" stroke-width="2.6" stroke-linecap="round" />

          <!-- Ponto central branco de precisão -->
          <circle cx="14" cy="14" r="1.5" fill="#FFFFFF" />
        </svg>

        <!-- Tooltip flutuante que surge ao passar o mouse ou tocar -->
        <div class="completed-x-tooltip">
          <span class="completed-x-tag" style="background: ${color};">✓ ${opLabel} ${mark.timeStr}</span>
          <span class="completed-x-title">${mark.placeName}</span>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

export const FullscreenMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const activeTileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const placeMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const completedMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const driverMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayersRef = useRef<{ outer: L.Polyline; inner: L.Polyline; flow?: L.Polyline } | null>(null);

  // Janelinha / Modal de Seleção de Encomendas no Local (onmaker)
  const [markerSelectionModal, setMarkerSelectionModal] = useState<{
    placeName: string;
    places: Place[];
    driverClaimMode?: boolean;
  } | null>(null);
  const [showDriverFocusHint, setShowDriverFocusHint] = useState(false);

  // Smooth GPS continuous walking references
  const markerCurrentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const lastFixTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const animationStartTimeRef = useRef<number>(0);
  const animationStartPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const animationTargetPosRef = useRef<{ lat: number; lng: number } | null>(null);

  const {
    currentCoords,
    setMapInstance,
    selectedPlace,
    setSelectedPlace,
    mapLayer,
    mapTheme,
    userLocation,
    isTrackingUser,
    stopUserTracking,
    locateUser,
    activeRoute,
    savedPlaces,
    allPlaces,
    flyToLocation,
    drivers,
    selectedDriver,
    setSelectedDriver,
    vehicleFilter,
    operationFilter,
    operationsFilter,
    user,
    currentRole,
    isDriverOnline,
    openPhotoViewer,
    completedWaypointMarks,
    revertCompletedMark,
    customers,
    openCustomerLocationModal,
    dateRangeFilter,
    claimPublicOrder,
    defaultNavApp,
    setDefaultNavApp,
    routeSelectMode,
    routeSelectedIds,
    toggleRouteSelection
  } = useMapStore();

  const routeSelectModeRef = useRef(routeSelectMode);
  routeSelectModeRef.current = routeSelectMode;
  const toggleRouteSelectionRef = useRef(toggleRouteSelection);
  toggleRouteSelectionRef.current = toggleRouteSelection;
  const routeRingLayerRef = useRef<L.LayerGroup | null>(null);

  // Diálogo de navegação ao tocar em uma Central de Coletas
  const driversRef = useRef(drivers);
  driversRef.current = drivers;
  const [hubToNavigate, setHubToNavigate] = useState<{ name: string; address: string; lat: number; lng: number } | null>(null);
  const [showHubNavChooser, setShowHubNavChooser] = useState(false);

  // Estados para confirmação do motorista ao assumir pedido público
  const [publicOrderToClaim, setPublicOrderToClaim] = useState<Place | null>(null);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimToast, setClaimToast] = useState<string | null>(null);

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const currentRoleRef = useRef(currentRole);
  currentRoleRef.current = currentRole;
  const isDriverOnlineRef = useRef(isDriverOnline);
  isDriverOnlineRef.current = isDriverOnline;
  const isUserManuallyPanningRef = useRef<boolean>(false);
  const driverFocusHintTimerRef = useRef<NodeJS.Timeout | null>(null);
  const setSelectedPlaceRef = useRef(setSelectedPlace);
  setSelectedPlaceRef.current = setSelectedPlace;
  const operationsFilterRef = useRef(operationsFilter);
  operationsFilterRef.current = operationsFilter;
  const customersRef = useRef(customers);
  customersRef.current = customers;
  const handleAddPlaceAtCoordsRef = useRef<((coords: { lat: number; lng: number }) => Promise<void>) | null>(null);

  // Expõe helper global para abrir foto de coleta concluída no FullScreenPhotoViewer
  useEffect(() => {
    (window as any).openCompletedMarkPhoto = (photoUrl: string, title?: string) => {
      openPhotoViewer(photoUrl, {
        id: 'completed-coleta-photo',
        name: title ? decodeURIComponent(title) : 'Foto da Coleta Concluída',
        address: '',
        coordinates: { lat: 0, lng: 0 },
        imageUrl: photoUrl
      } as any);
    };
    return () => {
      delete (window as any).openCompletedMarkPhoto;
    };
  }, [openPhotoViewer]);

  // Botão "Voltar" da marca finalizada (admin/atendente): desfaz a baixa
  useEffect(() => {
    (window as any).revertCompletedMark = async (markId: string, btn?: HTMLButtonElement) => {
      if (!window.confirm('Voltar esta baixa? O pedido volta ao estado anterior e sai do histórico do motorista.')) return;
      if (btn) { btn.disabled = true; btn.textContent = 'Voltando...'; }
      const ok = await revertCompletedMark(markId);
      if (!ok) {
        if (btn) { btn.disabled = false; btn.textContent = '↩ Voltar baixa'; }
        window.alert('Não foi possível voltar esta baixa. A etapa do pedido pode já ter avançado.');
      }
    };
    return () => {
      delete (window as any).revertCompletedMark;
    };
  }, [revertCompletedMark]);

  // Ação de confirmar e assumir pedido público pelo motorista
  const handleConfirmClaimPublicOrder = async () => {
    if (!publicOrderToClaim) return;
    setIsClaiming(true);
    try {
      const won = await claimPublicOrder(publicOrderToClaim.id);
      if (!won) {
        setClaimToast('Este pedido já foi aceito por outro motorista.');
        setTimeout(() => setClaimToast(null), 3500);
        setPublicOrderToClaim(null);
        return;
      }
      setClaimToast(`Pedido aceito! Você é o responsável.`);
      setTimeout(() => setClaimToast(null), 3500);

      // Ao aceitar, apenas fecha o diálogo: não abre os detalhes do pedido
      setPublicOrderToClaim(null);

      if (typeof window !== 'undefined' && (window as any).AndroidApp) {
        (window as any).AndroidApp.showNotification?.("EncomendasZap", "Pedido público assumido com sucesso!");
        (window as any).AndroidApp.vibrate?.(250);
      }
    } catch (err) {
      console.warn('Erro ao assumir pedido público:', err);
      setClaimToast('Erro ao assumir pedido público.');
      setTimeout(() => setClaimToast(null), 3000);
    } finally {
      setIsClaiming(false);
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Load last saved position and zoom from localStorage
    const saved = getSavedLocation();

    const map = L.map(mapContainerRef.current, {
      center: [saved.coords.lat, saved.coords.lng],
      zoom: saved.zoom,
      zoomControl: false, // Clean UI without intrusive default zoom buttons
      attributionControl: false, // Custom clean attribution
      doubleClickZoom: false // Desabilita o zoom de duplo clique para permitir adicionar no local
    });

    const tileConfig = TILE_LAYERS[mapLayer];
    const tileLayer = new CachedTileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
      subdomains: tileConfig.subdomains || ['a', 'b', 'c']
    }).addTo(map);

    activeTileLayerRef.current = tileLayer;
    setMapInstance(map);

    // O motorista mantém o enquadramento manual até solicitar foco novamente.
    map.on('dragstart', () => {
      if (currentRoleRef.current !== 'motorista' || !isDriverOnlineRef.current) return;

      isUserManuallyPanningRef.current = true;
      setShowDriverFocusHint(false);
      if (driverFocusHintTimerRef.current) {
        clearTimeout(driverFocusHintTimerRef.current);
        driverFocusHintTimerRef.current = null;
      }
    });

    // Indica que o motorista pode voltar ao próprio local após 10 segundos sem arrastar.
    map.on('dragend', () => {
      if (currentRoleRef.current !== 'motorista' || !isDriverOnlineRef.current || !isUserManuallyPanningRef.current) return;

      if (driverFocusHintTimerRef.current) clearTimeout(driverFocusHintTimerRef.current);
      driverFocusHintTimerRef.current = setTimeout(() => {
        setShowDriverFocusHint(true);
        driverFocusHintTimerRef.current = null;
      }, 10000);
    });

    // Automatically save last location and zoom when user moves/zooms the map
    map.on('moveend', () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      saveLocationToStorage({ lat: center.lat, lng: center.lng }, zoom);
    });

    // Regra EncomendasZap: "se clicao duas vezes num local no mapa deve para add no local"
    // Referências para detecção confiável de duplo clique/duplo toque em desktop e mobile
    let lastClickTime = 0;
    let lastClickPos: L.LatLng | null = null;
    let lastHandledDblClick = 0;

    const handleAddPlaceAtCoords = async (coords: { lat: number; lng: number }) => {
      // Motorista NÃO PODE adicionar pedidos
      if (currentRole === 'motorista') {
        return;
      }

      const now = Date.now();
      if (now - lastHandledDblClick < 600) return;
      lastHandledDblClick = now;

      if (typeof window !== 'undefined' && window.AndroidApp?.vibrate) {
        window.AndroidApp.vibrate(60);
      }

      const tempId = `pedido-${Date.now()}`;
      const orderCode = `EZ-${Math.floor(1000 + Math.random() * 9000)}-GO`;
      const coordStr = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;

      // Define a operação inicial com base nos filtros ativos da barra superior
      const curOps = operationsFilterRef.current;
      const initialOp: OperationType = curOps.coleta ? 'coleta' : curOps.entrega ? 'entrega' : curOps.troca ? 'troca' : 'coleta';

      // 1. SNAPPING INTELIGENTE EM LOCAL CADASTRADO (<= 45 metros)
      try {
        const nearbyFb = placeService.getClosestLocalSync(coords.lat, coords.lng, 45);
        if (nearbyFb && nearbyFb.local) {
          const l = nearbyFb.local;
          const fullAddr = l.endereco || [l.rua, l.numero, l.setor, l.cidade].filter(Boolean).join(', ') || l.name;
          const isStreet = isStreetOrAddress({ name: l.name, category: l.setor, address: fullAddr });
          const closing = isStreet ? undefined : resolveCommercialClosingTime({
            name: l.name,
            category: l.setor,
            address: fullAddr,
            horario: l.horario
          });

          const snappedPlace: Place = {
            id: tempId,
            orderCode,
            name: l.name,
            address: fullAddr,
            coordinates: { lat: Number(l.lat), lng: Number(l.lng) },
            operationType: initialOp,
            vehicleType: 'moto',
            packageType: 'caixa',
            orderDateBadge: 'hoje',
            customerName: '',
            customerPhone: l.telefone || '',
            sellerName: '',
            sellerPhone: '',
            managerName: '',
            managerPhone: '',
            responsibleName: '',
            responsiblePhone: '',
            observations: '',
            driverNotes: `Ponto cadastrado na rede EncomendasZap (${Math.round(nearbyFb.distMeters)}m do toque).`,
            category: isStreet ? 'Via pública / Endereço' : (l.central_coletas ? 'Central de Coletas' : (l.setor ? `${l.setor}` : 'Ponto Comercial')),
            openNow: isStreet ? undefined : true,
            closingTime: isStreet ? undefined : closing,
            imageUrl: (l.icon && typeof l.icon === 'string' && l.icon.startsWith('http')) ? l.icon : undefined,
            photos: (l.icon && typeof l.icon === 'string' && l.icon.startsWith('http')) ? [l.icon] : [],
            pickupAddress: initialOp === 'coleta' ? fullAddr : undefined,
            pickupCoordinates: initialOp === 'coleta' ? { lat: Number(l.lat), lng: Number(l.lng) } : undefined,
            deliveryAddress: initialOp === 'entrega' ? fullAddr : undefined,
            deliveryCoordinates: initialOp === 'entrega' ? { lat: Number(l.lat), lng: Number(l.lng) } : undefined,
            exchangeAddress: initialOp === 'troca' ? fullAddr : undefined,
            exchangeCoordinates: initialOp === 'troca' ? { lat: Number(l.lat), lng: Number(l.lng) } : undefined
          };

          setSelectedPlaceRef.current(snappedPlace);
          map.flyTo([Number(l.lat), Number(l.lng)], Math.max(map.getZoom(), 16), { duration: 0.5 });
          return;
        }
      } catch (err) {
        console.warn('Erro ao verificar local próximo:', err);
      }

      // 2. SNAPPING INTELIGENTE EM CLIENTE COM LOCALIZAÇÃO CADASTRADA (<= 45 metros)
      try {
        const currentCustomers = customersRef.current || [];
        for (const cust of currentCustomers) {
          if (cust.coordinates && typeof cust.coordinates.lat === 'number' && typeof cust.coordinates.lng === 'number') {
            const dist = calculateDistanceMeters(coords, cust.coordinates);
            if (dist <= 45) {
              const custDisplayName = cust.fullName || 'Cliente';
              const custPlaceName = getCustomerPlaceName(custDisplayName);
              const custAddr = cust.address || `${cust.coordinates.lat.toFixed(5)}, ${cust.coordinates.lng.toFixed(5)}`;
              const snappedCustPlace: Place = {
                id: tempId,
                orderCode,
                name: custPlaceName,
                address: custAddr,
                coordinates: cust.coordinates,
                operationType: initialOp,
                vehicleType: 'moto',
                packageType: 'caixa',
                orderDateBadge: 'hoje',
                customerName: custDisplayName,
                customerPhone: cust.phone || '',
                customerId: cust.id,
                sellerName: '',
                sellerPhone: '',
                managerName: '',
                managerPhone: '',
                responsibleName: '',
                responsiblePhone: '',
                observations: '',
                driverNotes: `Localização cadastrada do cliente ${custDisplayName}.`,
                category: 'Local de Cliente',
                openNow: undefined,
                closingTime: undefined,
                pickupAddress: initialOp === 'coleta' ? custAddr : undefined,
                pickupCoordinates: initialOp === 'coleta' ? cust.coordinates : undefined,
                deliveryAddress: initialOp === 'entrega' ? custAddr : undefined,
                deliveryCoordinates: initialOp === 'entrega' ? cust.coordinates : undefined,
                exchangeAddress: initialOp === 'troca' ? custAddr : undefined,
                exchangeCoordinates: initialOp === 'troca' ? cust.coordinates : undefined
              };

              setSelectedPlaceRef.current(snappedCustPlace);
              map.flyTo([cust.coordinates.lat, cust.coordinates.lng], Math.max(map.getZoom(), 16), { duration: 0.5 });
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao verificar cliente próximo:', err);
      }

      // 3. Fallback: cria o rascunho e busca geocodificação reversa
      const newDraftPlace: Place = {
        id: tempId,
        orderCode,
        name: 'Localizando endereço...',
        address: coordStr,
        coordinates: coords,
        operationType: initialOp,
        vehicleType: 'moto',
        packageType: 'caixa',
        orderDateBadge: 'hoje',
        customerName: '',
        customerPhone: '',
        sellerName: '',
        sellerPhone: '',
        managerName: '',
        managerPhone: '',
        responsibleName: '',
        responsiblePhone: '',
        observations: '',
        driverNotes: '',
        openNow: undefined,
        closingTime: undefined,
        pickupAddress: initialOp === 'coleta' ? coordStr : undefined,
        pickupCoordinates: initialOp === 'coleta' ? coords : undefined,
        deliveryAddress: initialOp === 'entrega' ? coordStr : undefined,
        deliveryCoordinates: initialOp === 'entrega' ? coords : undefined,
        exchangeAddress: initialOp === 'troca' ? coordStr : undefined,
        exchangeCoordinates: initialOp === 'troca' ? coords : undefined
      };

      setSelectedPlaceRef.current(newDraftPlace);
      map.flyTo([coords.lat, coords.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });

      // Busca o endereço real via geocodificação reversa
      try {
        const geoPlace = await reverseGeocode(coords);
        if (geoPlace) {
          const finalName = geoPlace.name || (initialOp === 'coleta' ? 'Ponto de Coleta' : initialOp === 'troca' ? 'Ponto de Troca' : 'Ponto de Entrega');
          const finalAddr = geoPlace.address || coordStr;
          const isStreet = isStreetOrAddress({
            name: finalName,
            category: geoPlace.category,
            address: finalAddr
          });
          const closing = isStreet ? undefined : (geoPlace.closingTime || resolveCommercialClosingTime({
            ...geoPlace,
            name: finalName,
            address: finalAddr
          }));

          const updatedPlace: Place = {
            ...newDraftPlace,
            name: finalName,
            address: finalAddr,
            coordinates: geoPlace.coordinates || coords,
            originCity: geoPlace.originCity || 'Goiânia - GO',
            destinationCity: geoPlace.destinationCity || 'Goiânia - GO',
            category: isStreet ? 'Via pública / Endereço' : (geoPlace.category || newDraftPlace.category),
            rating: geoPlace.rating ?? newDraftPlace.rating,
            reviewsCount: geoPlace.reviewsCount ?? newDraftPlace.reviewsCount,
            openNow: isStreet ? undefined : true,
            closingTime: isStreet ? undefined : closing,
            imageUrl: geoPlace.imageUrl,
            photos: geoPlace.photos || (geoPlace.imageUrl ? [geoPlace.imageUrl] : []),
            pickupAddress: initialOp === 'coleta' ? finalAddr : undefined,
            pickupCoordinates: initialOp === 'coleta' ? (geoPlace.coordinates || coords) : undefined,
            deliveryAddress: initialOp === 'entrega' ? finalAddr : undefined,
            deliveryCoordinates: initialOp === 'entrega' ? (geoPlace.coordinates || coords) : undefined,
            exchangeAddress: initialOp === 'troca' ? finalAddr : undefined,
            exchangeCoordinates: initialOp === 'troca' ? (geoPlace.coordinates || coords) : undefined
          };
          setSelectedPlaceRef.current(updatedPlace);
        }
      } catch (err) {
        console.error('Erro na geocodificação reversa ao adicionar no local:', err);
      }
    };

    handleAddPlaceAtCoordsRef.current = handleAddPlaceAtCoords;

    // 1. Clique com o botão direito no mapa (contextmenu) para adicionar encomenda / local no ponto:
    // Funciona no Desktop (clique botão direito) e em telas Touch/Mobile (long press / toque e segura)
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      if (e.originalEvent) {
        e.originalEvent.stopPropagation();
        e.originalEvent.preventDefault();
      }
      handleAddPlaceAtCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // 2. Duplo clique como atalho adicional para adicionar no ponto
    map.on('dblclick', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      if (e.originalEvent) {
        e.originalEvent.stopPropagation();
        e.originalEvent.preventDefault();
      }
      handleAddPlaceAtCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // 3. Clique normal com o botão esquerdo no mapa:
    // - Se clicar em um marcador ou perto de um marcador existente, seleciona o marcador.
    // - Se clicar no espaço vazio do mapa, apenas fecha/desmarca o card ativo (NÃO abre novo pedido!).
    map.on('click', (e: L.LeafletMouseEvent) => {
      // Ignora se o clique foi em um marcador ou botão existente do mapa
      const targetElem = e.originalEvent?.target as HTMLElement | null;
      if (targetElem && (
        targetElem.closest('.leaflet-marker-icon') ||
        targetElem.closest('.custom-place-marker-icon') ||
        targetElem.closest('.completed-waypoint-x-marker') ||
        targetElem.closest('[data-action]')
      )) {
        return;
      }

      // SNAPPING DE MARCADOR EXISTENTE POR PROXIMIDADE DE TOQUE (Tolerância confortável para toques próximos)
      const clickPt = map.latLngToContainerPoint(e.latlng);
      let nearestMarkerPlace: Place | null = null;
      let nearestPlacesGroup: Place[] = [];
      let minDistancePx = Infinity;
      const CLICK_TOLERANCE_PX = 28;

      placeMarkersRef.current.forEach((marker) => {
        try {
          const markerPos = marker.getLatLng();
          const markerPt = map.latLngToContainerPoint(markerPos);
          const distPx = Math.hypot(clickPt.x - markerPt.x, clickPt.y - markerPt.y);

          if (distPx <= CLICK_TOLERANCE_PX && distPx < minDistancePx) {
            minDistancePx = distPx;
            nearestMarkerPlace = (marker as any)._customPlaceData || null;
            nearestPlacesGroup = (marker as any)._customPlacesAtLocation || (nearestMarkerPlace ? [nearestMarkerPlace] : []);
          }
        } catch {}
      });

      if (nearestMarkerPlace) {
        // Clicou perto de um marcador existente: seleciona o local existente
        if (nearestPlacesGroup.length > 1) {
          setMarkerSelectionModal({
            placeName: (nearestMarkerPlace as Place).name || 'Local',
            places: nearestPlacesGroup
          });
        } else {
          setSelectedPlaceRef.current(nearestMarkerPlace);
        }
        return;
      }

      // Clique normal no mapa em espaço vazio: apenas fecha a encomenda/local atualmente selecionado
      setSelectedPlaceRef.current(null);
    });

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      if (driverFocusHintTimerRef.current) {
        clearTimeout(driverFocusHintTimerRef.current);
        driverFocusHintTimerRef.current = null;
      }
      resizeObserver.disconnect();
      map.remove();
      setMapInstance(null);
    };
  }, []);

  useEffect(() => {
    if (currentRole === 'motorista' && isDriverOnline) return;

    isUserManuallyPanningRef.current = false;
    setShowDriverFocusHint(false);
    if (driverFocusHintTimerRef.current) {
      clearTimeout(driverFocusHintTimerRef.current);
      driverFocusHintTimerRef.current = null;
    }
  }, [currentRole, isDriverOnline]);

  // Sync active layer
  const { mapInstance } = useMapStore();
  useEffect(() => {
    if (!mapInstance) return;

    if (activeTileLayerRef.current) {
      mapInstance.removeLayer(activeTileLayerRef.current);
    }

    const tileConfig = TILE_LAYERS[mapLayer];
    const newLayer = new CachedTileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
      subdomains: tileConfig.subdomains || ['a', 'b', 'c']
    }).addTo(mapInstance);

    activeTileLayerRef.current = newLayer;
  }, [mapLayer, mapInstance]);

  // Sync visible places on map (Popular & Saved places highlighted in blue)
  useEffect(() => {
    if (!mapInstance) return;

    // Regra para motorista: Ele NÃO pode ver markers que não foram destinados a ele!
    // Apenas vê pontos atribuídos especificamente a ele (assignedDriverId ou assignedDriverPhone)
    const isDriverRole = currentRole === 'motorista';

    // Helper em tempo real para checar se a encomenda foi direcionada a este motorista
    const isPlaceAssignedToDriver = (p: Place): boolean => {
      return realtimeAssignmentService.isPlaceAssignedToUser(p, user);
    };

    // Combine unique places (somente as encomendas reais buscadas do servidor)
    const rawPlacesMap = new Map<string, Place>();
    const sourcePlaces = allPlaces || [];
    sourcePlaces.forEach(p => rawPlacesMap.set(p.id, p));
    savedPlaces.forEach(p => rawPlacesMap.set(p.id, p));

    // Regra Multi-Empresa e Transportadoras:
    // - Locais físicos de mapa (POIs) estão disponíveis para todos.
    // - Pedidos e encomendas são filtrados por empresa (Master Admin 62996157340 vê tudo).
    // - Motoboys vêem apenas os pedidos das empresas que os autorizarem.
    const companyFilteredPlaces = Array.from(rawPlacesMap.values()).filter(p => 
      companyService.canUserAccessPlace(p, user?.phone, currentRole)
    );

    // Regra Estrita de Sequência EncomendasZap:
    // 1. Para a entrega depois que fizer a coleta.
    // 2. E a troca também. Só pode mostrar a troca depois que fizer a coleta.
    // 3. Aí nesse caso, só pode mostrar a entrega depois que fizer a troca. Tem uma sequência.
    // Também respeita filtros explícitos de operações para visualização e marcas concluídas
    const sequencedPlacesList = filterPlacesBySequence(
      companyFilteredPlaces,
      completedWaypointMarks,
      isDriverRole ? undefined : operationsFilter
    );
    const allPlacesMap = new Map<string, Place>();
    sequencedPlacesList.forEach(p => allPlacesMap.set(p.id, p));

    // Clear removed markers (incluindo etapas futuras que ainda não devem aparecer)
    placeMarkersRef.current.forEach((marker, id) => {
      if (!allPlacesMap.has(id)) {
        mapInstance.removeLayer(marker);
        placeMarkersRef.current.delete(id);
      }
    });

    // Agrupa pedidos no mesmo ponto mesmo quando o nome do local varia entre registros.
    const getGroupKey = (p: Place): string => {
      const latRounded = Math.round(p.coordinates.lat * 10000) / 10000;
      const lngRounded = Math.round(p.coordinates.lng * 10000) / 10000;
      return `${latRounded}_${lngRounded}`;
    };

    const locationGroupsMap = new Map<string, Place[]>();
    allPlacesMap.forEach(p => {
      // 1. Finalizada: quando entrega já foi finalizada (concluída), NÃO PODE APARECER no mapa
      if (p.orderStage === 'concluido' || (p.operationType as any) === 'concluido') return;

      // 2. Filtro de Calendário / Período
      if (dateRangeFilter.startDate || dateRangeFilter.endDate) {
        const placeDate = getPlaceCalendarDate(p);
        if (!isDateInInterval(placeDate, dateRangeFilter.startDate, dateRangeFilter.endDate)) {
          return;
        }
      }

      // Se for motorista, verifica atribuição
      if (isDriverRole) {
        if (!isPlaceAssignedToDriver(p)) return;
      }
      const op = p.operationType || 'entrega';
      if (!operationsFilter[op]) return;

      const key = getGroupKey(p);
      const existing = locationGroupsMap.get(key) || [];
      existing.push(p);
      locationGroupsMap.set(key, existing);
    });

    // Add or update markers with vivid blue pins and labels
    allPlacesMap.forEach((place) => {
      // 1. Se a encomenda estiver concluída/entregue, remove do mapa se existir e pula
      if (place.orderStage === 'concluido' || (place.operationType as any) === 'concluido') {
        if (placeMarkersRef.current.has(place.id)) {
          mapInstance.removeLayer(placeMarkersRef.current.get(place.id)!);
          placeMarkersRef.current.delete(place.id);
        }
        return;
      }

      // 2. Filtro de Calendário / Período
      if (dateRangeFilter.startDate || dateRangeFilter.endDate) {
        const placeDate = getPlaceCalendarDate(place);
        if (!isDateInInterval(placeDate, dateRangeFilter.startDate, dateRangeFilter.endDate)) {
          if (placeMarkersRef.current.has(place.id)) {
            mapInstance.removeLayer(placeMarkersRef.current.get(place.id)!);
            placeMarkersRef.current.delete(place.id);
          }
          return;
        }
      }

      // Se for motorista, só vê se for destinado a ele
      if (isDriverRole) {
        if (!isPlaceAssignedToDriver(place)) {
          if (placeMarkersRef.current.has(place.id)) {
            mapInstance.removeLayer(placeMarkersRef.current.get(place.id)!);
            placeMarkersRef.current.delete(place.id);
          }
          return;
        }
      }

      // Filtra por operações marcadas no topo (Coleta, Entrega, Troca - persistido na memória)
      const op = place.operationType || 'entrega';
      if (!operationsFilter[op]) {
        if (placeMarkersRef.current.has(place.id)) {
          mapInstance.removeLayer(placeMarkersRef.current.get(place.id)!);
          placeMarkersRef.current.delete(place.id);
        }
        return;
      }

      const key = getGroupKey(place);
      const placesAtLocation = locationGroupsMap.get(key) || [place];

      // Se há mais de uma encomenda neste local, apenas a primeira cria/mantém o marcador mestre
      if (placesAtLocation.length > 1 && placesAtLocation[0].id !== place.id) {
        if (placeMarkersRef.current.has(place.id)) {
          mapInstance.removeLayer(placeMarkersRef.current.get(place.id)!);
          placeMarkersRef.current.delete(place.id);
        }
        return;
      }

      const isSelected = placesAtLocation.some(p => p.id === selectedPlace?.id);
          const isPublicForDriver = isDriverRole && placesAtLocation.some(p => !isCollectionCenterPlace(p) && realtimeAssignmentService.isPublicOrder(p));
      const distanceLabel = isPublicForDriver ? formatClaimDistance(userLocationRef.current, place.coordinates) : '';
      const driverStatus = isDriverRole ? null : getDriverStatusInfo(placesAtLocation, driversRef.current);
      const icon = createPlaceMarkerIcon(place, isSelected, placesAtLocation, customers, isPublicForDriver, distanceLabel, driverStatus, isDriverRole);

      if (placeMarkersRef.current.has(place.id)) {
        const marker = placeMarkersRef.current.get(place.id)!;
        marker.setIcon(icon);
        (marker as any)._driverStatusText = driverStatus?.text || '';
        (marker as any)._distanceLabel = distanceLabel;
        marker.setLatLng([place.coordinates.lat, place.coordinates.lng]);
        marker.setZIndexOffset(isPublicForDriver ? 600 : isSelected ? 500 : 100);
        (marker as any)._customPlaceData = place;
        (marker as any)._customPlacesAtLocation = placesAtLocation;
        (marker as any)._isPublicForDriver = isPublicForDriver;
      } else {
        const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
          icon,
          zIndexOffset: isPublicForDriver ? 600 : isSelected ? 500 : 100
        }).addTo(mapInstance);

        (marker as any)._customPlaceData = place;
        (marker as any)._customPlacesAtLocation = placesAtLocation;
        (marker as any)._isPublicForDriver = isPublicForDriver;
        (marker as any)._distanceLabel = distanceLabel;
        (marker as any)._driverStatusText = driverStatus?.text || '';

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }

          const currentPlace = (marker as any)._customPlaceData || place;
          const currentGroup: Place[] = (marker as any)._customPlacesAtLocation || [currentPlace];

          // Modo "Passar rota": o clique apenas marca/desmarca os locais deste marcador
          if (routeSelectModeRef.current) {
            const ids = currentGroup.filter(p => !isCollectionCenterPlace(p)).map(p => p.id);
            if (ids.length > 0) toggleRouteSelectionRef.current(ids);
            return;
          }

          // Se clicou no botão de alerta para cadastrar localização do cliente
          const alertTarget = (e.originalEvent?.target as HTMLElement)?.closest('[data-action="set-customer-location"]');
          if (alertTarget) {
            const targetId = alertTarget.getAttribute('data-place-id') || place.id;
            const targetPlace = (currentGroup.find(p => p.id === targetId)) || currentPlace;
            openCustomerLocationModal({
              place: targetPlace,
              placeId: targetPlace.id,
              customerName: targetPlace.customerName || 'Cliente',
              customerPhone: targetPlace.customerPhone,
              customerId: targetPlace.customerId
            });
            return;
          }

          // Em locais compartilhados, o motorista escolhe qual pedido público deseja aceitar.
          if (isDriverRole) {
            const availablePublicPlaces = currentGroup.filter(p => !isCollectionCenterPlace(p) && realtimeAssignmentService.isPublicOrder(p));
            if (availablePublicPlaces.length > 0) {
              if (currentGroup.length > 1) {
                setMarkerSelectionModal({
                  placeName: currentPlace.name || 'Local',
                  places: currentGroup,
                  driverClaimMode: true
                });
              } else {
                setPublicOrderToClaim(availablePublicPlaces[0]);
              }
              return;
            }
          }

          // Quando tiver mais de uma encomenda no mesmo local (onmaker):
          // "Coloca um onmaker. Quando clicar nela, deve abrir uma janelinha perguntando qual que a pessoa quer acessar."
          if (currentGroup.length > 1) {
            setMarkerSelectionModal({
              placeName: currentPlace.name || 'Local',
              places: currentGroup
            });
            return;
          }

          // Abre sempre os detalhes da encomenda ao clicar (nunca abre a foto diretamente)
          // A foto só abre automaticamente quando o motorista chega fisicamente ao local (raio de 75m)
          setSelectedPlace(currentPlace);
        });

        marker.on('dblclick', (e) => {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }
        });

        marker.on('contextmenu', (e) => {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }
          if (currentRole === 'motorista') return;
          // Clique com botão direito no marcador abre criação de novo pedido neste local
          handleAddPlaceAtCoordsRef.current?.({ lat: place.coordinates.lat, lng: place.coordinates.lng });
        });

        placeMarkersRef.current.set(place.id, marker);
      }
    });
  }, [mapInstance, savedPlaces, allPlaces, selectedPlace, operationsFilter, flyToLocation, setSelectedPlace, openPhotoViewer, currentRole, completedWaypointMarks, customers, openCustomerLocationModal, dateRangeFilter]);

  // Atualiza o status do motorista (aceito/indo + distância) dentro da label quando ele se move
  useEffect(() => {
    if (currentRole === 'motorista') return;
    placeMarkersRef.current.forEach((marker) => {
      const m = marker as any;
      if (!m._customPlaceData || m._isPublicForDriver) return;
      const status = getDriverStatusInfo(m._customPlacesAtLocation || [m._customPlaceData], drivers);
      const text = status?.text || '';
      if (text === (m._driverStatusText || '')) return;
      m._driverStatusText = text;
      marker.setIcon(createPlaceMarkerIcon(
        m._customPlaceData,
        selectedPlace?.id === m._customPlaceData.id,
        m._customPlacesAtLocation || [m._customPlaceData],
        customers,
        false,
        '',
        status
      ));
    });
  }, [drivers, currentRole, customers, selectedPlace?.id]);

  // Atualiza a distância mostrada no botão "Aceitar" quando o GPS do motoboy muda
  useEffect(() => {
    placeMarkersRef.current.forEach((marker) => {
      const m = marker as any;
      if (!m._isPublicForDriver || !m._customPlaceData) return;
      const label = formatClaimDistance(userLocation, m._customPlaceData.coordinates);
      if (label === m._distanceLabel) return;
      m._distanceLabel = label;
      marker.setIcon(createPlaceMarkerIcon(
        m._customPlaceData,
        false,
        m._customPlacesAtLocation || [m._customPlaceData],
        customers,
        true,
        label
      ));
    });
  }, [userLocation, customers]);

  // Sincroniza Marcadores de Baixa no Solo (Apenas um 'X' - e ao clicar abre label com detalhes, fotos, motorista e horário)
  useEffect(() => {
    if (!mapInstance) return;

    // Só mostra as baixas feitas pelo próprio usuário logado (nunca as de outros usuários)
    const myId = user?.id ? String(user.id).replace(/\D/g, '') : '';
    const myName = (user?.name || '').trim().toLowerCase();
    const isStaffViewer = currentRole === 'admin_geral' || currentRole === 'atendente' || (currentRole as string) === 'admin';
    const ownMarks = isStaffViewer ? completedWaypointMarks : completedWaypointMarks.filter(m => {
      if (m.driverId) return Boolean(myId) && String(m.driverId).replace(/\D/g, '') === myId;
      return Boolean(myName) && (m.driverName || '').trim().toLowerCase() === myName;
    });

    const currentMarkIds = new Set(ownMarks.map(m => m.id));

    // Remove marcadores antigos excluídos
    completedMarkersRef.current.forEach((marker, id) => {
      if (!currentMarkIds.has(id)) {
        mapInstance.removeLayer(marker);
        completedMarkersRef.current.delete(id);
      }
    });

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const hasDateFilter = Boolean(dateRangeFilter.startDate || dateRangeFilter.endDate);

    // Renderiza cada marcação com APENAS UM 'X' no chão
    ownMarks.forEach((mark) => {
      const markDate = (mark.completedDate || '').slice(0, 10);

      // Regra EncomendasZap estrita:
      // "makers finalizadas so pode mostrar as do dia atual ou se filtrar"
      if (hasDateFilter) {
        if (markDate && !isDateInInterval(markDate, dateRangeFilter.startDate, dateRangeFilter.endDate)) {
          if (completedMarkersRef.current.has(mark.id)) {
            mapInstance.removeLayer(completedMarkersRef.current.get(mark.id)!);
            completedMarkersRef.current.delete(mark.id);
          }
          return;
        }
      } else {
        // Sem filtro: SÓ PODE MOSTRAR AS DO DIA ATUAL!
        if (markDate && markDate !== todayStr) {
          if (completedMarkersRef.current.has(mark.id)) {
            mapInstance.removeLayer(completedMarkersRef.current.get(mark.id)!);
            completedMarkersRef.current.delete(mark.id);
          }
          return;
        }
      }
      if (!completedMarkersRef.current.has(mark.id)) {
        const isFailed = mark.status === 'failed' || Boolean(mark.receiverName?.toLowerCase().includes('insucesso'));
        const opColor = isFailed ? '#E11D48' : mark.operationType === 'coleta' ? '#0B5187' : mark.operationType === 'troca' ? '#7C3AED' : '#FF5E00';
        const opLabel = isFailed 
          ? (mark.receiverName || 'Tentativa sem sucesso')
          : mark.operationType === 'coleta' ? 'Coleta concluída' : mark.operationType === 'troca' ? 'Troca realizada' : 'Entrega concluída';

        // 1. MARCADOR NO MAPA: APENAS UM 'X' COMPACTO (Discreto, nítido e elegante no solo)
        const completedIcon = L.divIcon({
          className: 'completed-waypoint-x-marker',
          html: `
            <div class="completed-x-marker-wrap" style="position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; cursor: pointer; transition: transform 0.15s ease;" title="${opLabel} às ${mark.timeStr || ''} • Clique para ver detalhes e fotos">
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));">
                <ellipse cx="17" cy="30" rx="9" ry="2.6" fill="rgba(0, 0, 0, 0.25)" />
                <path d="M17 4 L28 9.5 V21.5 L17 27 L6 21.5 V9.5 Z" fill="${opColor}" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round" />
                <path d="M6 9.5 L17 15 L28 9.5 M17 15 V27" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="1.4" stroke-linejoin="round" />
                <path d="M11.5 7 L22.5 12.5" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="1.4" />
                <circle cx="26" cy="9" r="6" fill="#FFFFFF" stroke="${opColor}" stroke-width="1.6" />
                ${isFailed
                  ? `<path d="M23.4 6.4 L28.6 11.6 M23.4 11.6 L28.6 6.4" stroke="${opColor}" stroke-width="2" stroke-linecap="round" />`
                  : `<path d="M23.2 9.2 L25.3 11.2 L28.9 6.9" stroke="${opColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`}
              </svg>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 24]
        });

        // 2. FOTOS DA COLETA / BAIXA
        const photosList = Array.isArray(mark.photos) && mark.photos.length > 0 
          ? mark.photos 
          : (mark.imageUrl ? [mark.imageUrl] : []);

        const photosHtml = photosList.length > 0
          ? `
            <div style="margin-top: 8px;">
              <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                <span>📸 Fotos da Coleta (${photosList.length})</span>
                <span style="font-size: 9.5px; color: #0B5187; font-weight: bold;">Toque para ampliar</span>
              </div>
              <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin;">
                ${photosList.map((url) => `
                  <div onclick="window.openCompletedMarkPhoto('${url.replace(/'/g, "\\'")}', '${encodeURIComponent(mark.placeName)}')" style="cursor: pointer; position: relative; width: 72px; height: 72px; border-radius: 10px; overflow: hidden; border: 1.5px solid #CBD5E1; flex-shrink: 0; background: #0F172A; transition: transform 0.15s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <img src="${url}" alt="Foto da Coleta" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'" />
                  </div>
                `).join('')}
              </div>
            </div>
          `
          : `
            <div style="margin-top: 8px; padding: 6px 8px; background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; font-size: 10px; color: #94A3B8; text-align: center;">
              Sem fotos anexadas no registro
            </div>
          `;

        // 3. POPUP LABEL COMPLETA (DETALHES, FOTOS, MOTORISTA E HORÁRIO)
        const popupContent = `
          <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 250px; max-width: 295px; color: #1E293B;">
            <!-- Cabeçalho -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
              <span style="background: ${opColor}; color: #FFFFFF; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.04em; display: inline-flex; align-items: center; gap: 3px;">
                <span>✔</span>
                <span>${mark.operationType === 'coleta' ? 'Coleta Concluída' : opLabel}</span>
              </span>
              <span style="font-size: 11px; font-weight: 800; color: #0B5187; background: #E8F2FA; padding: 2px 6px; border-radius: 6px;">
                🕒 ${mark.timeStr || '--:--'}
              </span>
            </div>

            <!-- Local e Cliente -->
            <div style="margin-bottom: 6px;">
              <h4 style="margin: 0 0 2px 0; font-size: 13px; font-weight: 900; color: #0F172A; line-height: 1.2;">
                ${mark.placeName}
              </h4>
              ${mark.customerName && mark.customerName !== mark.placeName ? `
                <p style="margin: 0 0 2px 0; font-size: 11px; font-weight: 700; color: #475569;">
                  👤 Cliente: ${mark.customerName}
                </p>
              ` : ''}
              <p style="margin: 0; font-size: 10.5px; color: #64748B; line-height: 1.3;">
                📍 ${mark.address || 'Endereço registrado'}
              </p>
              ${mark.orderCode ? `
                <p style="margin: 3px 0 0 0; font-size: 10px; font-family: monospace; font-weight: 800; color: #0B5187;">
                  📦 ${mark.orderCode}
                </p>
              ` : ''}
            </div>

            <!-- Motorista que Coletou e Hora Exata -->
            <div style="background: #F1F5F9; border-radius: 8px; padding: 6px 8px; margin-top: 6px; display: flex; flex-direction: column; gap: 3px; border: 1px solid #E2E8F0;">
              <div style="font-size: 11px; font-weight: 800; color: #1E293B; display: flex; align-items: center; gap: 4px;">
                <span>🏍️</span>
                <span>Motorista que coletou: <strong style="color: #0B5187;">${mark.driverName || 'Motorista'}</strong></span>
              </div>
              <div style="font-size: 10.5px; font-weight: 600; color: #64748B; display: flex; align-items: center; gap: 4px;">
                <span>⏰</span>
                <span>Hora da coleta: <strong style="color: #0F172A;">${mark.timeStr}</strong></span>
              </div>
            </div>

            <!-- Fotos -->
            ${photosHtml}
            ${isStaffViewer ? `
              <button type="button" onclick="window.revertCompletedMark('${mark.id}', this)" style="margin-top: 10px; width: 100%; padding: 8px 10px; border-radius: 10px; border: 1.5px solid #FDBA74; background: #FFF7ED; color: #C2410C; font-size: 12px; font-weight: 900; cursor: pointer;">↩ Voltar baixa</button>
            ` : ''}
          </div>
        `;

        const marker = L.marker([mark.coordinates.lat, mark.coordinates.lng], {
          icon: completedIcon,
          zIndexOffset: 60,
          opacity: 0.55
        }).addTo(mapInstance);

        marker.on('mouseover', () => marker.setOpacity(1));
        marker.on('mouseout', () => marker.setOpacity(0.55));
        marker.on('popupopen', () => marker.setOpacity(1));
        marker.on('popupclose', () => marker.setOpacity(0.55));

        marker.bindPopup(popupContent, {
          className: 'completed-coleta-popup',
          maxWidth: 310,
          minWidth: 260,
          autoPan: true,
          closeButton: true
        });

        marker.on('click', () => {
          marker.openPopup();
        });

        completedMarkersRef.current.set(mark.id, marker);
      }
    });
  }, [mapInstance, completedWaypointMarks, dateRangeFilter, user?.id, user?.name, currentRole]);

  // Marcadores fixos de galpão para todas as Centrais de Coletas (uma só por local, mesmo se várias cidades usarem a mesma)
  useEffect(() => {
    if (!mapInstance) return;
    const layer = L.layerGroup().addTo(mapInstance);
    let cancelled = false;

    const loadCentrals = async () => {
      try {
        const res = await placeService.getLocais({ central_coletas: true, limit: 1000 });
        if (cancelled || !res.success || !Array.isArray(res.data)) return;
        layer.clearLayers();
        const seen = new Set<string>();
        res.data.forEach((local: any) => {
          const lat = Number(local.lat);
          const lng = Number(local.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
          const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
          if (seen.has(key)) return;
          seen.add(key);
          const name = String(local.name || 'Central de Coletas').replace(/[<>&"]/g, '');
          // Mesmo formato dos demais pins: a pontinha (X) fica exatamente na coordenada (âncora 19,43)
          const icon = L.divIcon({
            className: 'collection-hub-marker',
            iconSize: [160, 80],
            iconAnchor: [80, 75],
            html: `
              <div style="position:relative;width:160px;height:80px;cursor:pointer;pointer-events:auto;">
                <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);max-width:156px;background:#0F766E;color:#FFFFFF;padding:2px 7px;border-radius:6px;border:1px solid #99F6E4;box-shadow:0 1px 3px rgba(0,0,0,0.3);line-height:1.15;text-align:center;">
                  <div style="font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:0.03em;white-space:nowrap;opacity:0.9;">Central de Coletas</div>
                  <div style="font-size:10px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
                </div>
                <svg width="38" height="48" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:61px;top:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
                  <ellipse cx="19" cy="43" rx="7.5" ry="2.2" fill="rgba(0,0,0,0.28)" />
                  <path d="M 14 38 L 24 48 M 14 48 L 24 38" stroke="#FFFFFF" stroke-width="3.8" stroke-linecap="round" />
                  <path d="M 14 38 L 24 48 M 14 48 L 24 38" stroke="#0F766E" stroke-width="2.2" stroke-linecap="round" />
                  <line x1="19" y1="26" x2="19" y2="43" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" />
                  <line x1="19" y1="26" x2="19" y2="43" stroke="#0F766E" stroke-width="1.8" stroke-linecap="round" />
                  <circle cx="19" cy="43" r="1.4" fill="#FFFFFF" />
                  <rect x="5" y="3" width="28" height="23" rx="6" fill="#0F766E" stroke="#FFFFFF" stroke-width="2.4" />
                  <g transform="translate(9 5.5) scale(0.83)" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8"/><path d="M7 16h10"/></g>
                </svg>
              </div>
            `
          });
          L.marker([lat, lng], { icon, zIndexOffset: 40 })
            .on('click', () => {
              setShowHubNavChooser(false);
              setHubToNavigate({ name, address: String(local.endereco || ''), lat, lng });
            })
            .addTo(layer);
        });
      } catch (err) {
        console.warn('Erro ao carregar centrais de coleta:', err);
      }
    };

    loadCentrals();
    const interval = window.setInterval(loadCentrals, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      mapInstance.removeLayer(layer);
    };
  }, [mapInstance]);

  // Sincroniza Marcadores dos Motoristas (com mascotes em moto e carro, cores exclusivas e tag com nome)
  useEffect(() => {
    if (!mapInstance) return;

    // Regra para motorista: Ele NÃO PODE ver os outros motoristas no mapa!
    // Ele só vê a si próprio através do beacon/localização GPS dele.
    if (currentRole === 'motorista') {
      driverMarkersRef.current.forEach((marker) => {
        mapInstance.removeLayer(marker);
      });
      driverMarkersRef.current.clear();
      return;
    }

    const currentDriverIds = new Set(drivers.map(d => d.id));

    // Remove marcadores de motoristas excluídos
    driverMarkersRef.current.forEach((marker, id) => {
      if (!currentDriverIds.has(id)) {
        mapInstance.removeLayer(marker);
        driverMarkersRef.current.delete(id);
      }
    });

    // Se o filtro for 'nenhum', remove todos os motoristas para manter o mapa focado apenas em coletas e entregas
    if (vehicleFilter === 'nenhum') {
      driverMarkersRef.current.forEach((marker) => {
        mapInstance.removeLayer(marker);
      });
      driverMarkersRef.current.clear();
      return;
    }

    // Cria ou atualiza marcador para cada motorista
    drivers.forEach((driver) => {
      // Regra estrita: motoristas inativos/offline há mais de 30 minutos somem do mapa
      if (isDriverStale(driver)) {
        if (driverMarkersRef.current.has(driver.id)) {
          mapInstance.removeLayer(driverMarkersRef.current.get(driver.id)!);
          driverMarkersRef.current.delete(driver.id);
        }
        return;
      }

      // Filtra por tipo de veículo (Todos os veículos, Moto, Carro, Utilitário)
      if (vehicleFilter !== 'todos' && driver.vehicleType !== vehicleFilter) {
        if (driverMarkersRef.current.has(driver.id)) {
          mapInstance.removeLayer(driverMarkersRef.current.get(driver.id)!);
          driverMarkersRef.current.delete(driver.id);
        }
        return;
      }

      const isSelected = selectedDriver?.id === driver.id;
      const icon = createDriverMarkerIcon(driver, isSelected);

      if (driverMarkersRef.current.has(driver.id)) {
        const marker = driverMarkersRef.current.get(driver.id)!;
        marker.setIcon(icon);
        marker.setLatLng([driver.coordinates.lat, driver.coordinates.lng]);
        marker.setZIndexOffset(isSelected ? 900 : 350);
      } else {
        const marker = L.marker([driver.coordinates.lat, driver.coordinates.lng], {
          icon,
          zIndexOffset: isSelected ? 900 : 350
        }).addTo(mapInstance);

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }
          setSelectedDriver(driver);
          flyToLocation(driver.coordinates, 16);
        });

        marker.on('dblclick', (e) => {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }
        });

        driverMarkersRef.current.set(driver.id, marker);
      }
    });
  }, [mapInstance, drivers, selectedDriver, vehicleFilter, flyToLocation, setSelectedDriver, currentRole]);

  // Selo "Aceito por" nas makers para admin/atendente/terminal; com "Indo" + distância quando o motorista clicou no GPS
  const claimBadgeLayerRef = useRef<L.LayerGroup | null>(null);
  const enRouteLinesRef = useRef<Map<string, { line: L.Polyline; lat: number; lng: number; at: number }>>(new Map());

  useEffect(() => {
    if (!mapInstance) return;
    const layer = L.layerGroup().addTo(mapInstance);
    claimBadgeLayerRef.current = layer;
    const lines = enRouteLinesRef.current;
    return () => {
      mapInstance.removeLayer(layer);
      lines.forEach(entry => mapInstance.removeLayer(entry.line));
      lines.clear();
      claimBadgeLayerRef.current = null;
    };
  }, [mapInstance]);

  // Anéis laranjas nos marcadores selecionados no modo "Passar rota"
  useEffect(() => {
    if (!mapInstance) return;
    if (!routeRingLayerRef.current) routeRingLayerRef.current = L.layerGroup().addTo(mapInstance);
    const layer = routeRingLayerRef.current;
    layer.clearLayers();
    if (!routeSelectMode) return;
    const byId = new Map<string, Place>();
    [...(allPlaces || []), ...(savedPlaces || [])].forEach(p => byId.set(p.id, p));
    const seen = new Set<string>();
    routeSelectedIds.forEach(id => {
      const p = byId.get(id);
      if (!p?.coordinates) return;
      const key = `${p.coordinates.lat.toFixed(5)},${p.coordinates.lng.toFixed(5)}`;
      if (seen.has(key)) return;
      seen.add(key);
      L.circleMarker([p.coordinates.lat, p.coordinates.lng], {
        radius: 30,
        color: '#FF5E00',
        weight: 4,
        fillColor: '#FF5E00',
        fillOpacity: 0.18,
        interactive: false
      }).addTo(layer);
    });
  }, [mapInstance, routeSelectMode, routeSelectedIds, allPlaces, savedPlaces]);

  useEffect(() => {
    const layer = claimBadgeLayerRef.current;
    if (!mapInstance || !layer) return;
    layer.clearLayers();

    const lines = enRouteLinesRef.current;
    if (currentRole === 'motorista') {
      lines.forEach(entry => mapInstance.removeLayer(entry.line));
      lines.clear();
      return;
    }

    const digits = (v?: string) => String(v || '').replace(/\D/g, '');
    const activeLineIds = new Set<string>();

    allPlaces.forEach((place) => {
      if (!place.assignedDriverId && !place.assignedDriverName) return;
      if (place.orderStage === 'concluido' || isCollectionCenterPlace(place)) return;

      const live = drivers.find(d => {
        const a = digits(place.assignedDriverId);
        return (a && digits(d.id) === a) || (place.assignedDriverName && d.name === place.assignedDriverName);
      });
      const enRoute = Boolean(place.driverEnRoute);

      // Rota do motorista até o local: só depois que ele clicou no GPS
      if (enRoute && live) {
        activeLineIds.add(place.id);
        const cached = lines.get(place.id);
        const moved = cached ? calculateDistanceMeters({ lat: cached.lat, lng: cached.lng }, live.coordinates) : Infinity;
        if (!cached || (moved > 120 && Date.now() - cached.at > 15000)) {
          const from = { lat: live.coordinates.lat, lng: live.coordinates.lng };
          const apply = (coords: Array<{ lat: number; lng: number }>) => {
            const latlngs = coords.map(c => [c.lat, c.lng] as [number, number]);
            const existing = enRouteLinesRef.current.get(place.id);
            if (existing) existing.line.setLatLngs(latlngs);
            else {
              const line = L.polyline(latlngs, { color: '#2563EB', weight: 5, opacity: 0.85, dashArray: '1 9', lineCap: 'round' }).addTo(mapInstance);
              enRouteLinesRef.current.set(place.id, { line, lat: from.lat, lng: from.lng, at: Date.now() });
            }
            const entry = enRouteLinesRef.current.get(place.id);
            if (entry) { entry.lat = from.lat; entry.lng = from.lng; entry.at = Date.now(); }
          };
          apply([from, place.coordinates]);
          fetchMultiStopRoute([from, place.coordinates]).then(res => {
            if (res && res.coordinates.length > 1 && enRouteLinesRef.current.has(place.id)) apply(res.coordinates);
          }).catch(() => {});
        }
      }
    });

    lines.forEach((entry, id) => {
      if (!activeLineIds.has(id)) {
        mapInstance.removeLayer(entry.line);
        lines.delete(id);
      }
    });
  }, [mapInstance, allPlaces, drivers, currentRole]);

  // Sync selectedPlace marker position (for arbitrary clicks on map)
  useEffect(() => {
    if (!mapInstance) return;

    if (!selectedPlace) {
      if (markerRef.current) {
        mapInstance.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }

    // If it's already represented in placeMarkersRef, avoid duplicating
    if (placeMarkersRef.current.has(selectedPlace.id)) {
      if (markerRef.current) {
        mapInstance.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }

    const { lat, lng } = selectedPlace.coordinates;
    const markerIcon = createPlaceMarkerIcon(selectedPlace, true, [selectedPlace], customers, false, '', null, currentRole === 'motorista');

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(markerIcon);
    } else {
      markerRef.current = L.marker([lat, lng], {
        icon: markerIcon,
        zIndexOffset: 600
      }).addTo(mapInstance);

      markerRef.current.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
        }

        const alertTarget = (e.originalEvent?.target as HTMLElement)?.closest('[data-action="set-customer-location"]');
        if (alertTarget) {
          openCustomerLocationModal({
            place: selectedPlace,
            placeId: selectedPlace.id,
            customerName: selectedPlace.customerName || 'Cliente',
            customerPhone: selectedPlace.customerPhone,
            customerId: selectedPlace.customerId
          });
          return;
        }

        setSelectedPlace(selectedPlace);
      });

      markerRef.current.on('dblclick', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
          e.originalEvent.preventDefault();
        }
      });
    }
  }, [selectedPlace, mapInstance, customers, openCustomerLocationModal, currentRole]);

  // Sync Street Route Highlighting (Vivid Royal & Navy Blue Street Polyline with Uber-style Animated Flow)
  useEffect(() => {
    if (!mapInstance) return;

    // Clean existing route layers
    if (routeLayersRef.current) {
      mapInstance.removeLayer(routeLayersRef.current.outer);
      mapInstance.removeLayer(routeLayersRef.current.inner);
      if (routeLayersRef.current.flow) {
        mapInstance.removeLayer(routeLayersRef.current.flow);
      }
      routeLayersRef.current = null;
    }

    if (!activeRoute || activeRoute.coordinates.length < 2) return;

    const latLngs: [number, number][] = activeRoute.coordinates.map(c => [c.lat, c.lng]);

    // 1. Contorno escuro para alto contraste na rua
    const outer = L.polyline(latLngs, {
      color: '#002B49',
      weight: 9,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(mapInstance);

    // 2. Linha base azul viva e brilhante
    const inner = L.polyline(latLngs, {
      color: '#0066FF',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(mapInstance);

    // 3. Linha animada estilo Uber com traços em movimento contínuo mostrando a direção
    const flow = L.polyline(latLngs, {
      color: '#FFFFFF',
      weight: 3.5,
      opacity: 0.95,
      dashArray: '10, 16',
      className: 'uber-route-flow-line',
      interactive: false
    }).addTo(mapInstance);

    routeLayersRef.current = { outer, inner, flow };
  }, [activeRoute, mapInstance]);

  // Sync live user location marker with ultra-smooth 60fps linear walking motion and camera tracking
  useEffect(() => {
    if (!mapInstance || !userLocation) return;

    const isMotoristaOnline = currentRole === 'motorista' && isDriverOnline;
    const userVehicleType = getUserVehicleType(user);
    const isTracking = isTrackingUser || isMotoristaOnline;
    const targetLat = userLocation.lat;
    const targetLng = userLocation.lng;
    const now = performance.now();

    // Initial marker creation on map
    if (!userMarkerRef.current || !markerCurrentPosRef.current) {
      markerCurrentPosRef.current = { lat: targetLat, lng: targetLng };
      lastFixTimeRef.current = now;
      if (userLocation.heading != null && !isNaN(userLocation.heading)) {
        lastHeadingRef.current = userLocation.heading;
      }
      const initialIcon = createUserLocationIcon(currentRole, userVehicleType, lastHeadingRef.current, isTracking);

      userMarkerRef.current = L.marker([targetLat, targetLng], {
        icon: initialIcon,
        zIndexOffset: 1000
      }).addTo(mapInstance);

      // Ao receber a localização do GPS do navegador pela primeira vez, centraliza o mapa no usuário
      mapInstance.setView([targetLat, targetLng], 16, { animate: true });
      return;
    }

    // Distance calculation in meters
    const currentLat = markerCurrentPosRef.current.lat;
    const currentLng = markerCurrentPosRef.current.lng;
    const dLat = (targetLat - currentLat) * 111320;
    const dLng = (targetLng - currentLng) * 111320 * Math.cos((targetLat * Math.PI) / 180);
    const distMeters = Math.sqrt(dLat * dLat + dLng * dLng);

    // Filtro anti-ruído de GPS estacionário:
    // Se o motorista estiver parado ou com oscilação natural de satélite (< 1.5m),
    // ele fica 100% parado e firme no lugar ("quietinho"), sem girar a seta que nem doido
    if (distMeters < 1.5) {
      // Se tiver heading nativo do sensor do celular com velocidade mínima real, atualiza direção suavemente
      if (userLocation.speed && userLocation.speed > 0.8 && userLocation.heading != null && !isNaN(userLocation.heading)) {
        lastHeadingRef.current = userLocation.heading;
      }
      const updatedIcon = createUserLocationIcon(currentRole, userVehicleType, lastHeadingRef.current, isTracking);
      userMarkerRef.current.setIcon(updatedIcon);
      return;
    }

    // Se houver deslocamento real (>= 1.5m), calcula o rumo em direção ao deslocamento
    const calculatedHeading = computeBearing(currentLat, currentLng, targetLat, targetLng);
    lastHeadingRef.current = calculatedHeading;

    const updatedIcon = createUserLocationIcon(currentRole, userVehicleType, lastHeadingRef.current, isTracking);
    userMarkerRef.current.setIcon(updatedIcon);

    // If teleport/large jump (> 3km), snap immediately without playing long animation
    if (distMeters > 3000) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      markerCurrentPosRef.current = { lat: targetLat, lng: targetLng };
      userMarkerRef.current.setLatLng([targetLat, targetLng]);
      if (isTrackingUser) {
        mapInstance.flyTo([targetLat, targetLng], 18, { duration: 1.0 });
      }
      lastFixTimeRef.current = now;
      return;
    }

    // Calculate dynamic time delta to adapt animation duration to incoming GPS frequency
    const timeDelta = lastFixTimeRef.current > 0 ? (now - lastFixTimeRef.current) : 1200;
    lastFixTimeRef.current = now;

    // Smooth walking duration: matches update frequency with a tiny 10% buffer so it glides continuously
    const animDuration = Math.max(1000, Math.min(3000, timeDelta * 1.08));

    // Cancel running animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startLat = currentLat;
    const startLng = currentLng;
    animationStartPosRef.current = { lat: startLat, lng: startLng };
    animationTargetPosRef.current = { lat: targetLat, lng: targetLng };
    animationStartTimeRef.current = performance.now();

    // Constant-velocity linear interpolation ("andando de verdade, estilo Google Maps")
    const step = (currentTime: number) => {
      const elapsed = currentTime - animationStartTimeRef.current;
      const progress = Math.min(1.0, elapsed / animDuration);

      // Linear progression creates continuous, constant-speed walking without abrupt stop/starts
      const interpLat = startLat + (targetLat - startLat) * progress;
      const interpLng = startLng + (targetLng - startLng) * progress;

      markerCurrentPosRef.current = { lat: interpLat, lng: interpLng };

      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([interpLat, interpLng]);
      }

      // Mantém a câmera acompanhando o GPS apenas até o motorista mover o mapa manualmente.
      const isDriverTracking = isTrackingUser || isMotoristaOnline;
      if (isDriverTracking && mapInstance && !isUserManuallyPanningRef.current) {
        mapInstance.panTo([interpLat, interpLng], { animate: false });
      }

      if (progress < 1.0) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [userLocation, isTrackingUser, isDriverOnline, currentRole, user, mapInstance]);

  // Atualização reativa imediata do marcador quando o usuário altera de papel (Admin/Motorista) ou tipo de veículo
  useEffect(() => {
    if (!userMarkerRef.current) return;
    const isMotoristaOnline = currentRole === 'motorista' && isDriverOnline;
    const userVehicleType = getUserVehicleType(user);
    const isTracking = isTrackingUser || isMotoristaOnline;
    const updatedIcon = createUserLocationIcon(currentRole, userVehicleType, lastHeadingRef.current, isTracking);
    userMarkerRef.current.setIcon(updatedIcon);
  }, [currentRole, user, isDriverOnline, isTrackingUser]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div
        ref={mapContainerRef}
        className="w-full h-full z-0 bg-[#EBF2F7]"
        style={{ cursor: 'grab' }}
      />

      {currentRole === 'motorista' && isDriverOnline && (
        <button
          type="button"
          onClick={() => {
            isUserManuallyPanningRef.current = false;
            setShowDriverFocusHint(false);
            if (driverFocusHintTimerRef.current) {
              clearTimeout(driverFocusHintTimerRef.current);
              driverFocusHintTimerRef.current = null;
            }
            const location = userLocationRef.current || currentCoords;
            mapInstance?.flyTo([location.lat, location.lng], 17, { duration: 1 });
          }}
          aria-label="Focar no motorista"
          title="Focar na minha localização"
          className={`group absolute bottom-20 right-3.5 sm:right-6 z-30 flex h-12 w-12 items-center justify-center rounded-xl border bg-white text-[#0B5187] shadow-xl transition-all hover:bg-[#F0F6FB] active:scale-95 ${
            showDriverFocusHint
              ? 'animate-pulse border-[#FF5E00] ring-4 ring-[#FF5E00]/30'
              : 'border-[#0B5187]/25'
          }`}
        >
          <LocateFixed className="h-5 w-5 stroke-[2.4] transition-transform group-hover:scale-110" />
          {showDriverFocusHint && (
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#FF5E00]" />
          )}
        </button>
      )}

      {/* JANELINHA / DIÁLOGO DE SELEÇÃO DE ENCOMENDA NO LOCAL (ONMAKER) */}
      {markerSelectionModal && (
        <div 
          onClick={() => setMarkerSelectionModal(null)}
          className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
          >
            {/* Cabeçalho da Janelinha */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-[#0B5187] text-white shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1 text-sky-300 font-bold text-xs uppercase tracking-wider">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{markerSelectionModal.placeName}</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight leading-snug">
                    {markerSelectionModal.driverClaimMode ? 'Escolha o pedido para aceitar' : 'Qual encomenda você deseja acessar?'}
                  </h3>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    {markerSelectionModal.driverClaimMode
                      ? 'Há mais de um pedido neste ponto. Confira o cliente e a operação antes de aceitar.'
                      : 'Encomendas registradas neste mesmo local. Toque para abrir:'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMarkerSelectionModal(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/90 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                  title="Fechar janelinha"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Lista das Encomendas no Local */}
            <div className="p-3 sm:p-4 overflow-y-auto space-y-2.5 flex-1 bg-slate-50">
              {markerSelectionModal.places.map((p, idx) => {
                const pVeh = getVehicleInfo(p.vehicleType);
                const op = p.operationType || 'entrega';
                const isCollectionCenter = isCollectionCenterPlace(p);
                const isPublicForDriver = Boolean(markerSelectionModal.driverClaimMode && !isCollectionCenter && realtimeAssignmentService.isPublicOrder(p));
                const isColeta = op === 'coleta';
                const isTroca = op === 'troca';
                const isRetorno = p.orderStage === 'retorno';

                const opConfig = isColeta
                  ? { label: 'Coleta', badgeBg: 'bg-blue-100 text-[#0B5187] border-blue-300' }
                  : isTroca
                  ? { label: 'Troca', badgeBg: 'bg-purple-100 text-[#7C3AED] border-purple-300' }
                  : isRetorno
                  ? { label: 'Retorno', badgeBg: 'bg-amber-100 text-amber-900 border-amber-300' }
                  : { label: 'Entrega', badgeBg: 'bg-orange-100 text-[#FF5E00] border-orange-300' };

                const photo = getPlacePhoto(p);

                return (
                  <div
                    key={p.id || idx}
                    onClick={() => {
                      setMarkerSelectionModal(null);
                      if (isPublicForDriver) {
                        setPublicOrderToClaim(p);
                        return;
                      }
                      setSelectedPlace(p);
                    }}
                    className="p-3 sm:p-3.5 bg-white hover:bg-sky-50/50 rounded-2xl border-2 border-slate-200 hover:border-[#0B5187] shadow-xs hover:shadow-md transition-all cursor-pointer group active:scale-[0.98] flex flex-col gap-2"
                  >
                    {/* Linha superior: Veículo, Operação e Código */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        {/* Veículo na frente com fundo colorido para diferenciar */}
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black inline-flex items-center gap-1 shadow-2xs border ${pVeh.badgeClass}`}>
                          <span>{pVeh.emoji}</span>
                          <span>{pVeh.label}</span>
                        </span>

                        {/* Operação */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border uppercase tracking-wide ${opConfig.badgeBg}`}>
                          {opConfig.label}
                        </span>
                      </div>

                      {p.orderCode && (
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {p.orderCode}
                        </span>
                      )}
                      {isPublicForDriver && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800 ring-1 ring-amber-200">
                          <Zap className="h-3 w-3 fill-current" />
                          Público
                        </span>
                      )}
                    </div>

                    {/* Dados do Cliente e Foto */}
                    <div className="flex items-start gap-2.5">
                      {photo ? (
                        <img 
                          src={photo} 
                          alt="Foto" 
                          className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200 bg-slate-100" 
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0 font-black text-sm">
                          #{idx + 1}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <h4 className="text-sm font-black text-slate-900 truncate group-hover:text-[#0B5187] transition-colors">
                            {p.customerName || 'Cliente não informado'}
                          </h4>
                        </div>

                        {p.customerPhone && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{p.customerPhone}</span>
                          </div>
                        )}

                        <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5" title={p.address}>
                          {p.address}
                        </p>
                      </div>
                    </div>

                    {/* Alerta: Cliente sem localização cadastrada */}
                    {!isPublicForDriver && isCustomerMissingLocation(p, customers) && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setMarkerSelectionModal(null);
                          openCustomerLocationModal({
                            place: p,
                            placeId: p.id,
                            customerName: p.customerName || 'Cliente',
                            customerPhone: p.customerPhone,
                            customerId: p.customerId
                          });
                        }}
                        className="py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100/90 border border-amber-300 text-amber-900 text-[10px] font-black flex items-center justify-between gap-1 shadow-2xs transition-all cursor-pointer"
                        title="Cliente sem localização cadastrada! Toque para definir local."
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Cliente Sem Localização</span>
                        </span>
                        <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wide">
                          Cadastrar
                        </span>
                      </div>
                    )}

                    {/* Barra de ação dentro do card */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">
                        {isPublicForDriver ? 'Disponível para você' : isCollectionCenter ? 'Ponto de operação' : 'Toque para abrir detalhes'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-black transition-transform group-hover:translate-x-0.5 ${isPublicForDriver ? 'text-emerald-700' : 'text-[#0B5187]'}`}>
                        <span>{isPublicForDriver ? 'Aceitar pedido' : 'Acessar'}</span>
                        {isPublicForDriver ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rodapé da Janelinha */}
            <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMarkerSelectionModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO DE NAVEGAÇÃO ATÉ A CENTRAL DE COLETAS */}
      {hubToNavigate && (
        <div
          className="fixed inset-0 z-[140] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-200"
          onClick={() => { setHubToNavigate(null); setShowHubNavChooser(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-visible rounded-t-[28px] sm:rounded-[28px] bg-white shadow-2xl text-slate-900 p-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-400 to-teal-700 text-white flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wide text-teal-700">Central de Coletas</p>
                <h3 className="text-base font-black leading-tight truncate">{hubToNavigate.name}</h3>
                {hubToNavigate.address && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{hubToNavigate.address}</p>}
              </div>
              <button
                type="button"
                onClick={() => { setHubToNavigate(null); setShowHubNavChooser(false); }}
                className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative mt-4">
              {showHubNavChooser && (
                <div className="absolute bottom-14 right-0 z-10 w-full bg-white rounded-2xl shadow-2xl border border-slate-200 p-2.5 space-y-2 animate-in zoom-in-95 fade-in duration-150">
                  {(['google_maps', 'waze'] as const).map((app) => (
                    <button
                      key={app}
                      type="button"
                      onClick={() => {
                        setDefaultNavApp(app);
                        setShowHubNavChooser(false);
                        openExternalNavigation(app, hubToNavigate.lat, hubToNavigate.lng);
                        setHubToNavigate(null);
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        defaultNavApp === app ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400' : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {app === 'google_maps' ? <GoogleMapsIcon className="w-7 h-7 shrink-0" /> : <WazeIcon className="w-7 h-7 shrink-0" />}
                      <span className="text-xs font-black flex-1">{app === 'google_maps' ? 'Google Maps' : 'Waze'}</span>
                      {defaultNavApp === app && (
                        <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-md">Padrão</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center h-12 rounded-2xl bg-[#1A73E8] text-white shadow-md border border-blue-400/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    openExternalNavigation(defaultNavApp || 'google_maps', hubToNavigate.lat, hubToNavigate.lng);
                    setHubToNavigate(null);
                    setShowHubNavChooser(false);
                  }}
                  className="flex-1 h-full px-4 hover:bg-[#1557b0] font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {defaultNavApp === 'waze' ? <WazeIcon className="w-5 h-5" /> : <GoogleMapsIcon className="w-5 h-5" />}
                  <span>Navegar</span>
                </button>
                <div className="w-[1px] h-6 bg-white/30" />
                <button
                  type="button"
                  onClick={() => setShowHubNavChooser(prev => !prev)}
                  className="h-full px-3 hover:bg-[#1557b0] flex items-center justify-center cursor-pointer"
                  title="Mudar aplicativo de navegação GPS (Google Maps / Waze)"
                  aria-label="Escolher aplicativo de GPS"
                >
                  <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST DE SUCESSO AO ASSUMIR PEDIDO PÚBLICO */}
      {claimToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] px-4 py-2.5 bg-slate-900/95 text-white text-xs font-black rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-500/50 backdrop-blur-md animate-in slide-in-from-top-3 duration-200">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
          <span>{claimToast}</span>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA MOTORISTA ASSUMIR PEDIDO PÚBLICO */}
      {publicOrderToClaim && (
        <div 
          className="fixed inset-0 z-[140] bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-200"
          onClick={() => !isClaiming && setPublicOrderToClaim(null)}
        >
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-order-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-t-[28px] sm:rounded-[28px] bg-white shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 text-slate-900"
          >
            <div className="h-1.5 bg-gradient-to-r from-[#FFB01F] via-[#FF7A1A] to-[#FF5E00]" />

            <div className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                    {publicOrderToClaim.operationType === 'coleta' ? (
                      <Package className="h-7 w-7 stroke-[2.2]" />
                    ) : publicOrderToClaim.operationType === 'troca' ? (
                      <RefreshCw className="h-7 w-7 stroke-[2.2]" />
                    ) : (
                      <Navigation className="h-7 w-7 stroke-[2.2]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                      <Zap className="h-3 w-3 fill-current" />
                      Disponível para aceitar
                    </span>
                    <h2 id="public-order-title" className="mt-1.5 text-lg font-black leading-tight text-slate-950 sm:text-xl">
                      Novo pedido
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={() => setPublicOrderToClaim(null)}
                  aria-label="Fechar pedido"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 border-y border-slate-200 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                    publicOrderToClaim.operationType === 'coleta'
                      ? 'bg-blue-100 text-blue-800'
                      : publicOrderToClaim.operationType === 'troca'
                      ? 'bg-violet-100 text-violet-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {publicOrderToClaim.operationType === 'coleta'
                      ? 'Coleta'
                      : publicOrderToClaim.operationType === 'troca'
                      ? 'Troca'
                      : 'Entrega'}
                  </span>
                  {publicOrderToClaim.orderCode && (
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      {publicOrderToClaim.orderCode}
                    </span>
                  )}
                  {formatClaimDistance(userLocation, publicOrderToClaim.coordinates) && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800">
                      <MapPin className="h-3 w-3" />
                      {formatClaimDistance(userLocation, publicOrderToClaim.coordinates)} de você
                    </span>
                  )}
                </div>

                <h3 className="mt-3 break-words text-xl font-black leading-snug text-slate-950 sm:text-2xl">
                  {publicOrderToClaim.name || 'Local do pedido'}
                </h3>
                {publicOrderToClaim.address && (
                  <p className="mt-1.5 break-words text-sm leading-relaxed text-slate-600">
                    {publicOrderToClaim.address}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200">
                  <User className="h-4 w-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Cliente</p>
                    <p className="break-words text-sm font-bold text-slate-900">
                      {publicOrderToClaim.customerName || 'Não informado'}
                    </p>
                  </div>
                  {publicOrderToClaim.customerPhone && (
                    <a
                      href={`tel:${publicOrderToClaim.customerPhone.replace(/[^\d+]/g, '')}`}
                      onClick={(event) => event.stopPropagation()}
                      className="ml-auto flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-[#0B5187] ring-1 ring-slate-200 hover:bg-blue-50"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Ligar
                    </a>
                  )}
                </div>

                {(() => {
                  const o = publicOrderToClaim;
                  const details = [
                    o.scheduledTime ? { k: 'Horário', v: `${o.scheduledTimeMode === 'partir' ? 'a partir das' : 'até'} ${o.scheduledTime}` } : null,
                    o.packageSize ? { k: 'Tamanho', v: o.packageSize } : null,
                    o.volumesCount ? { k: 'Volumes', v: String(o.volumesCount) } : null,
                    o.weightKg ? { k: 'Peso', v: `${o.weightKg} kg` } : null,
                    o.vehicleType ? { k: 'Veículo', v: String(o.vehicleType) } : null,
                    o.originCity || o.destinationCity ? { k: 'Cidades', v: [o.originCity, o.destinationCity].filter(Boolean).join(' → ') } : null
                  ].filter(Boolean) as Array<{ k: string; v: string }>;
                  const notes = o.observations || o.driverNotes || o.pickupNotes || o.deliveryNotes;
                  return (
                    <>
                      <ClaimRouteMap order={o} driverLocation={userLocation} />

                      {details.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {details.map(d => (
                            <div key={d.k} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{d.k}</p>
                              <p className="break-words text-sm font-bold text-slate-900">{d.v}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {o.isFragile && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          Frágil: manuseie com cuidado
                        </div>
                      )}

                      {notes && (
                        <div className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Observações</p>
                          <p className="mt-0.5 break-words text-sm text-amber-900">{notes}</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Ao aceitar, o pedido ficará vinculado a você e deixará de aparecer para os outros motoristas.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-[0.8fr_1.2fr]">
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={() => setPublicOrderToClaim(null)}
                  className="order-2 min-h-12 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 sm:order-1"
                >
                  Agora não
                </button>
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleConfirmClaimPublicOrder}
                  className="order-1 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#0B7A58] px-4 text-base font-black text-white shadow-lg shadow-emerald-900/15 transition-colors hover:bg-[#096548] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 sm:order-2"
                >
                  {isClaiming ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Reservando pedido...
                    </>
                  ) : (
                    <>
                      <Check className="h-5 w-5 stroke-[3]" />
                      Aceitar pedido
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
