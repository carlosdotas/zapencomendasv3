import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, User, Phone, ChevronRight, AlertTriangle, Zap, Check, LocateFixed } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { reverseGeocode } from '../../services/geocodingService';
import { MapLayerType, Place, OperationType, Driver, CompletedWaypointMark } from '../../types/map';
import { Customer } from '../../types/customer';
import { isCustomerMissingLocation, getCustomerPlaceName } from '../../utils/customerLocationUtils';
import { isStreetOrAddress, calculateDistanceMeters, resolveCommercialClosingTime } from '../../utils/placeUtils';
import { firebasePlaceService } from '../../services/firebasePlaceService';
import { getSavedLocation, saveLocationToStorage } from '../../utils/storage';
import { tileCache } from '../../services/tileCache';
import { formatLastSeen } from '../../utils/driverUtils';
import { formatDriverLastSeen, isDriverStale } from '../../services/driverTrackingClient';
import { formatPhotoUrl } from '../../services/apiAdapters';
import { UserRole } from '../../data/authAccounts';
import { filterPlacesBySequence } from '../../utils/orderSequence';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { getPlaceCalendarDate, isDateInInterval } from '../../utils/dateFilterUtils';
import { firebaseCompanyService } from '../../services/firebaseCompanyService';

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

// Place Marker com caixinha 3D ou Foto da Encomenda, risquinho fininho, xizinho na ponta e legenda translúcida
export const createPlaceMarkerIcon = (
  place: Place, 
  isSelected: boolean = false, 
  placesAtLocation: Place[] = [place],
  customers: Customer[] = [],
  isPublicForDriver: boolean = false
) => {
  const isMultiple = placesAtLocation.length > 1;
  const opType: OperationType = place.operationType || 'entrega';
  const isSingleMissing = !isMultiple && isCustomerMissingLocation(place, customers);
  
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
  const singleClientName = place.customerName 
    ? (place.customerName.length > 26 ? place.customerName.slice(0, 24) + '...' : place.customerName) 
    : 'Cliente';

  // Montagem do conteúdo dos clientes:
  // Se houver mais de uma encomenda no mesmo lugar:
  // "embaixo tem o nome dos clientes. Lá vai ter as cores, nas cores de coleta e entrega, ou troca. Aí ele vem com a cor de fundo, com a borda e a cor de fundo."
  // "e quando tiver mais de uma, tem que estar na frente se é carro ou moto, lá na maker mesmo."
  const customerContentHtml = isMultiple ? `
    <div class="place-marker-customers-list">
      ${placesAtLocation.slice(0, 4).map((p, idx) => {
        const cName = p.customerName ? (p.customerName.length > 20 ? p.customerName.slice(0, 18) + '..' : p.customerName) : `Cliente ${idx + 1}`;
        const pVeh = getVehicleInfo(p.vehicleType);

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

        const isLineMissing = isCustomerMissingLocation(p, customers);

        return `
          <div 
            class="place-marker-customer-line" 
            data-customer-idx="${idx}"
            style="background: ${opBg}; border: 1.2px solid ${opBorder}; border-radius: 6px; padding: 2px 5px; display: flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.12s ease;"
            title="${opLabel}: ${cName} (${pVeh.label})"
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
            <span class="place-marker-customer-name" style="color: #ffffff; font-size: 10.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">
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

            <!-- Nome da operação (Coleta, Entrega, Troca) -->
            <span style="margin-left: auto; font-size: 8.5px; font-weight: 900; text-transform: uppercase; color: #ffffff; opacity: 0.95; letter-spacing: 0.02em; padding-left: 2px;">
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
      <span class="place-marker-customer" style="color: #ffffff; font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 155px;">
        ${singleClientName}
      </span>
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
        <div class="place-marker-label ${isMultiple ? 'type-multiple is-multiple' : `type-${opType}`} ${placePhoto ? 'has-photo' : 'no-photo'}">
          <!-- BADGE FLUTUANTE NO CANTO SUPERIOR DIREITO -->
          <span class="place-marker-date-badge badge-${dateBadge.type}">
            ${dateBadge.iconSvg}
            <span>${dateBadge.label}</span>
          </span>

          ${placePhoto ? `
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
            <div class="place-marker-header-row">
              <span class="place-marker-place">${cleanPlaceName}</span>
              ${isPublicForDriver
                ? `<span class="place-marker-op-badge" style="background: linear-gradient(135deg, #F59E0B, #D97706); border: 1.2px solid #FDE68A; color: #FFFFFF; font-size: 9px; font-weight: 900; padding: 1.5px 5px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.02em;">⚡ DISPONÍVEL</span>`
                : isMultiple 
                ? `<span class="place-marker-count-pill" style="background: #475569; border: 1px solid #CBD5E1; color: #ffffff; font-size: 9px; font-weight: 900; padding: 1px 6px; border-radius: 9999px;">${placesAtLocation.length} no local</span>` 
                : `<span class="place-marker-op-badge" style="background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.45); border-radius: 4px; padding: 1px 4px; font-size: 9px; font-weight: 900; text-transform: uppercase;">${opType === 'coleta' ? 'Coleta' : opType === 'troca' ? 'Troca' : place.orderStage === 'retorno' ? 'Retorno' : 'Entrega'}</span>`
              }
            </div>
            <!-- 2. NOME DO CLIENTE EMBAIXO COM VEÍCULO NA FRENTE OU LISTAGEM COM FUNDO E BORDA -->
            ${customerContentHtml}
            ${isPublicForDriver ? `
              <!-- AVISO DE CONFIRMAÇÃO DO MOTORISTA -->
              <div 
                class="place-marker-claim-prompt" 
                style="background: linear-gradient(135deg, #10B981, #059669); color: #FFFFFF; font-size: 9.5px; font-weight: 900; padding: 2.5px 7px; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 3.5px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); border: 1.2px solid #6EE7B7; text-transform: uppercase; letter-spacing: 0.02em;"
              >
                <span>⚡ TOQUE P/ CONFIRMAR E ASSUMIR</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `,
    iconSize: [360, isMultiple ? (placesAtLocation.length > 2 ? 120 : 96) : (isPublicForDriver ? 104 : isSingleMissing ? 96 : 74)],
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

            <!-- Guidão e Retrovisores -->
            <path d="M 20 22 L 44 22" stroke="#334155" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="19" cy="20" r="2.2" fill="#94A3B8" stroke="#1E293B" stroke-width="1" />
            <circle cx="45" cy="20" r="2.2" fill="#94A3B8" stroke="#1E293B" stroke-width="1" />
            <!-- Farol Central -->
            <circle cx="32" cy="18" r="3" fill="#FEF08A" stroke="#F59E0B" stroke-width="1.2" />

            <!-- Chassi / Tanque -->
            <path d="M 27 23 L 37 23 L 36 34 L 28 34 Z" fill="${safeColor}" stroke="#FFFFFF" stroke-width="1" />

            <!-- Piloto (Ombros e Capacete 3D com Viseira) -->
            <ellipse cx="32" cy="29" rx="8.5" ry="4" fill="#334155" stroke="#1E293B" stroke-width="1" />
            <circle cx="32" cy="28" r="6" fill="url(#moto-helmet-${uid})" stroke="#FFFFFF" stroke-width="1.2" />
            <path d="M 29 25.5 Q 32 24 35 25.5" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" />

            <!-- Baú de Carga Traseiro (3D) -->
            <rect x="21" y="37" width="22" height="18" rx="3.5" fill="url(#moto-box-${uid})" stroke="#FFFFFF" stroke-width="1.5" />
            <line x1="21" y1="42" x2="43" y2="42" stroke="rgba(255,255,255,0.7)" stroke-width="1" />
            <rect x="29" y="52" width="6" height="3" rx="1" fill="#FEF08A" stroke="#B45309" stroke-width="0.8" />
            <text x="32" y="49" font-size="7.5" font-weight="900" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif">EZ</text>

            <!-- Lanterna Traseira Vermelha -->
            <rect x="30" y="55.5" width="4" height="2" rx="1" fill="#EF4444" />
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
    customers,
    openCustomerLocationModal,
    dateRangeFilter,
    claimPublicOrder
  } = useMapStore();

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

  // Ação de confirmar e assumir pedido público pelo motorista
  const handleConfirmClaimPublicOrder = async () => {
    if (!publicOrderToClaim) return;
    setIsClaiming(true);
    try {
      await claimPublicOrder(publicOrderToClaim.id);
      setClaimToast(`Pedido aceito! Você é o responsável.`);
      setTimeout(() => setClaimToast(null), 3500);

      const updatedPlace: Place = {
        ...publicOrderToClaim,
        assignedDriverId: user.id || 'usr-mot-04',
        assignedDriverName: user.name || 'Motorista Parceiro',
        assignedDriverPhone: user.phone,
        orderVisibility: 'privado'
      };

      setSelectedPlace(updatedPlace);
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

      // 1. SNAPPING INTELIGENTE EM LOCAL CADASTRADO NO FIREBASE (<= 45 metros)
      try {
        const nearbyFb = firebasePlaceService.getClosestLocalSync(coords.lat, coords.lng, 45);
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
        console.warn('Erro ao verificar local próximo no Firebase:', err);
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
      firebaseCompanyService.canUserAccessPlace(p, user?.phone, currentRole)
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

    // Agrupamento por localização (mesmas coordenadas exatas e mesmo nome de local)
    const getGroupKey = (p: Place): string => {
      const latRounded = Math.round(p.coordinates.lat * 10000) / 10000;
      const lngRounded = Math.round(p.coordinates.lng * 10000) / 10000;
      const cleanName = (p.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return `${latRounded}_${lngRounded}_${cleanName}`;
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
      const isPublicForDriver = isDriverRole && realtimeAssignmentService.isPublicOrder(place);
      const icon = createPlaceMarkerIcon(place, isSelected, placesAtLocation, customers, isPublicForDriver);

      if (placeMarkersRef.current.has(place.id)) {
        const marker = placeMarkersRef.current.get(place.id)!;
        marker.setIcon(icon);
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

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }

          const currentPlace = (marker as any)._customPlaceData || place;
          const currentGroup: Place[] = (marker as any)._customPlacesAtLocation || [currentPlace];

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

          // Se for motorista e a corrida for pública/aberta, solicita confirmação para assumir o pedido!
          if (isDriverRole && realtimeAssignmentService.isPublicOrder(currentPlace)) {
            setPublicOrderToClaim(currentPlace);
            return;
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

  // Sincroniza Marcadores de Baixa no Solo (Apenas um 'X' - e ao clicar abre label com detalhes, fotos, motorista e horário)
  useEffect(() => {
    if (!mapInstance) return;

    const currentMarkIds = new Set(completedWaypointMarks.map(m => m.id));

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
    completedWaypointMarks.forEach((mark) => {
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
            <div class="completed-x-marker-wrap" style="position: relative; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; cursor: pointer; transition: transform 0.15s ease;" title="${opLabel} às ${mark.timeStr || ''} • Clique para ver detalhes e fotos">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="filter: drop-shadow(0 1.5px 3px rgba(0,0,0,0.35));">
                <ellipse cx="10" cy="11.5" rx="6" ry="2" fill="rgba(0, 0, 0, 0.2)" />
                <circle cx="10" cy="10" r="7.5" fill="#FFFFFF" stroke="${opColor}" stroke-width="2" />
                <path d="M 6.8 6.8 L 13.2 13.2 M 6.8 13.2 L 13.2 6.8" stroke="${opColor}" stroke-width="2.2" stroke-linecap="round" />
              </svg>
            </div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
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
          </div>
        `;

        const marker = L.marker([mark.coordinates.lat, mark.coordinates.lng], {
          icon: completedIcon,
          zIndexOffset: 60
        }).addTo(mapInstance);

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
  }, [mapInstance, completedWaypointMarks, dateRangeFilter]);

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
    const markerIcon = createPlaceMarkerIcon(selectedPlace, true, [selectedPlace], customers);

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
  }, [selectedPlace, mapInstance, customers, openCustomerLocationModal]);

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
                    Qual encomenda você deseja acessar?
                  </h3>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    Encomendas registradas neste mesmo local. Toque para abrir:
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
                    {isCustomerMissingLocation(p, customers) && (
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
                        Toque para abrir detalhes
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-black text-[#0B5187] group-hover:translate-x-0.5 transition-transform">
                        <span>Acessar</span>
                        <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
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
          className="fixed inset-0 z-[140] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !isClaiming && setPublicOrderToClaim(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-amber-200 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-orange-500/25 ring-4 ring-amber-100">
              <Zap className="w-7 h-7 fill-current animate-bounce" />
            </div>

            <div className="text-center space-y-1">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                ⚡ Pedido Público Disponível
              </span>
              <h3 className="text-base font-black text-slate-900 pt-1">
                Deseja assumir esta corrida?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Ao confirmar, você se torna o <strong className="text-slate-700">responsável oficial</strong> por esta encomenda. Ela sumirá para outros motoristas e entrará no seu itinerário.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold text-[11px]">Operação:</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                  publicOrderToClaim.operationType === 'coleta' 
                    ? 'bg-blue-100 text-blue-800' 
                    : publicOrderToClaim.operationType === 'troca'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {publicOrderToClaim.operationType || 'Entrega'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold text-[11px]">Cliente:</span>
                <span className="font-bold text-slate-800 truncate max-w-[190px]">{publicOrderToClaim.customerName || 'Cliente'}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-slate-400 font-semibold text-[11px]">Local:</span>
                <span className="font-bold text-slate-800 truncate max-w-[190px] text-right">{publicOrderToClaim.name}</span>
              </div>
              {publicOrderToClaim.address && (
                <div className="flex justify-between items-start pt-1 border-t border-slate-200/60">
                  <span className="text-slate-400 font-semibold text-[11px]">Endereço:</span>
                  <span className="text-[11px] text-slate-600 truncate max-w-[190px] text-right">{publicOrderToClaim.address}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isClaiming}
                onClick={() => setPublicOrderToClaim(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClaiming}
                onClick={handleConfirmClaimPublicOrder}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs cursor-pointer shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isClaiming ? 'Confirmando...' : '✅ Confirmar e Pegar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
