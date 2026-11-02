import { Place, LocationCoordinates, OperationType, Driver, OrderDateBadgeType, VehicleCollectionType } from '../types/map';
import { Customer } from '../types/customer';
import { isStreetOrAddress, resolveCommercialClosingTime } from '../utils/placeUtils';
import { resolveCustomerCity } from '../utils/addressUtils';
import { 
  BackendLocal, 
  BackendPedido, 
  BackendUser, 
  BackendMotorista, 
  BackendLiveLocation,
  BackendOrderMarker 
} from './apiTypes';

export function getOrderDateBadgeFromDate(dateStr?: string): OrderDateBadgeType {
  if (!dateStr) return 'hoje';
  
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const cleanDate = dateStr.slice(0, 10);
  if (cleanDate === todayStr) return 'hoje';
  if (cleanDate === yesterdayStr) return 'ontem';
  
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (cleanDate === twoDaysAgo) return '2_dias_atras';
  
  const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (cleanDate === threeDaysAgo) return '3_dias_atras';

  if (cleanDate < threeDaysAgo) {
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return '3_dias_atras';
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (cleanDate === tomorrowStr) return 'amanha';

  const parts = cleanDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }

  return 'hoje';
}

export function extractCoordsFromString(str?: string | null): LocationCoordinates | null {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
  }
  return null;
}

// Geocodificação inteligente de endereços conhecidos nos pedidos de Goiás
export function resolveKnownAddressCoordinates(addr?: string | null): LocationCoordinates | null {
  if (!addr || typeof addr !== 'string') return null;
  const lower = addr.toLowerCase();
  
  if (lower.includes('virgílio xavier') || lower.includes('virgilio xavier') || lower.includes('crimeia leste')) {
    return { lat: -16.642796, lng: -49.261818 };
  }
  if (lower.includes('martins borges') || lower.includes('kiras')) {
    return { lat: -16.644320, lng: -49.262011 };
  }
  if (lower.includes('joão luiz de almeida') || lower.includes('joao luiz de almeida') || lower.includes('guimarães natal') || lower.includes('guimaraes natal')) {
    return { lat: -16.648841, lng: -49.262825 };
  }
  if (lower.includes('goiás norte, 4066') || lower.includes('goias norte, 4066') || lower.includes('crimeia oeste')) {
    return { lat: -16.623669, lng: -49.279572 };
  }
  if (lower.includes('goiás norte') || lower.includes('goias norte') || lower.includes('urias magalhães') || lower.includes('urias magalhaes') || lower.includes('urias')) {
    return { lat: -16.649073, lng: -49.264584 };
  }
  if (lower.includes('anhanguera') || lower.includes('aeroviario')) {
    return { lat: -16.665380, lng: -49.305693 };
  }
  if (lower.includes('santo antônio') || lower.includes('santo antonio') || lower.includes('sao jose') || lower.includes('são josé')) {
    return { lat: -16.665205, lng: -49.308033 };
  }
  if (lower.includes('rua do comércio') || lower.includes('rua do comercio') || lower.includes('centro oeste')) {
    return { lat: -16.667362, lng: -49.286129 };
  }
  if (lower.includes('vila santa helena') || lower.includes('rua g') || lower.includes('pontojo')) {
    return { lat: -16.656294, lng: -49.284550 };
  }
  if (lower.includes('rio branco') || lower.includes('panorama')) {
    return { lat: -16.653226, lng: -49.282353 };
  }
  if (lower.includes('leopoldo de bulhões') || lower.includes('leopoldo de bulhoes') || lower.includes('75190-000')) {
    return { lat: -16.631970, lng: -48.735088 };
  }
  if (lower.includes('flamboyant') || lower.includes('jamel cecílio') || lower.includes('jamel cecilio')) {
    return { lat: -16.7118, lng: -49.2346 };
  }
  if (lower.includes('parque amazonia') || lower.includes('parque amazônia') || lower.includes('leandro da cruz')) {
    return { lat: -16.7258, lng: -49.2842 };
  }
  if (lower.includes('capital encomendas')) {
    return { lat: -16.673504, lng: -49.291186 };
  }
  if (lower.includes('lacerda')) {
    return { lat: -16.626585, lng: -48.740288 };
  }
  return null;
}

import { getApiBaseUrl, getImageServerUrl } from './api';

export type PhotoVariantSize = 'icon' | 'thumb' | 'md' | 'lg';

/**
 * Retorna o sufixo de tamanho de acordo com a documentação do servidor:
 * - icon: _icon.jpg (48 x 48 px, q=60)
 * - thumb: _thumb.jpg (200 x 200 px, q=70)
 * - md: _md.jpg (400 x 400 px, q=80 - exibição padrão)
 * - lg: _lg.jpg (800 x 800 px, q=85 - ampliação / fullscreen)
 */
export function getVariantSuffix(size: PhotoVariantSize = 'md'): string {
  switch (size) {
    case 'icon': return '_icon.jpg';
    case 'thumb': return '_thumb.jpg';
    case 'lg': return '_lg.jpg';
    case 'md':
    default:
      return '_md.jpg';
  }
}

/**
 * Normaliza um caminho ou URL de foto para a variante de tamanho especificada:
 * - icon: _icon.jpg (48 x 48 px)
 * - thumb: _thumb.jpg (200 x 200 px)
 * - md: _md.jpg (400 x 400 px - exibição padrão)
 * - lg: _lg.jpg (800 x 800 px - ampliação / fullscreen)
 * 
 * Trata tanto caminhos relativos (/uploads/pedidos/mercadoria/...),
 * URLs completas (https://host/uploads/pedidos/mercadoria/..._lg.jpg),
 * caminhos sem sufixo, e URLs legadas base64 data:.
 */
export function normalizePhotoPath(item: any, size: PhotoVariantSize = 'md'): string {
  if (!item || typeof item !== 'string') return '';
  const trimmed = item.trim();
  if (
    !trimmed || 
    trimmed === 'null' || 
    trimmed === 'undefined' || 
    trimmed === '[]' || 
    trimmed.startsWith('[{') || 
    trimmed.startsWith('{"') ||
    trimmed.includes('maps.app.goo.gl') ||
    trimmed.includes('google.com/maps')
  ) {
    return '';
  }

  // Imagem legada data: URL (base64)
  if (trimmed.startsWith('data:')) return trimmed;

  // 1. OBTÉM O LINK DO SERVIDOR DE IMAGENS CADASTRADO NAS CONFIGURAÇÕES
  const configuredServer = getImageServerUrl();
  const cleanServerEndpoint = (configuredServer || 'http://localhost/imagens/images.php')
    .split('?')[0]
    .trim()
    .replace(/\/+$/, '');
  const phpEndpoint = cleanServerEndpoint.endsWith('.php') 
    ? cleanServerEndpoint 
    : `${cleanServerEndpoint}/images.php`;
  let resolvedPhpEndpoint = phpEndpoint;
  const defaultImageServer = 'http://localhost/imagens/images.php';
  const hasConfiguredImageServer = Boolean(cleanServerEndpoint && cleanServerEndpoint !== defaultImageServer);

  try {
    const sourceUrl = new URL(trimmed);
    if (/^https?:$/.test(sourceUrl.protocol) && sourceUrl.pathname.toLowerCase().endsWith('.php')) {
      resolvedPhpEndpoint = `${sourceUrl.origin}${sourceUrl.pathname}`;
    }
  } catch {}

  // 2. DETECTA SE A FOTO PERTENCE AO SERVIDOR PHP DE IMAGENS
  const isPhpImageServer = 
    trimmed.includes('images.php') ||
    /[?&](?:f|file|img)=/i.test(trimmed) ||
    trimmed.includes('/uploads/images/') ||
    trimmed.includes('uploads/images/') ||
    trimmed.includes('/uploads/cache/') ||
    trimmed.includes('_perfil_') ||
    /^\d{9,12}_[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(trimmed) ||
    (cleanServerEndpoint && trimmed.startsWith(cleanServerEndpoint));

  if (isPhpImageServer) {
    // Extrai o nome do arquivo limpo (ex: 1793541270_perfil_86f90433.png)
    let filename = '';
    const paramMatch = trimmed.match(/[?&](?:f|file|img)=([^&#]+)/i);
    if (paramMatch) {
      filename = decodeURIComponent(paramMatch[1]);
    } else if (trimmed.includes('/uploads/images/')) {
      filename = trimmed.split('/uploads/images/').pop()?.split(/[?&#]/)[0] || '';
    } else if (trimmed.includes('/uploads/cache/')) {
      const rawCacheName = trimmed.split('/uploads/cache/').pop()?.split(/[?&#]/)[0] || '';
      const parts = rawCacheName.split('_');
      filename = parts.length > 4 ? parts.slice(4).join('_') : rawCacheName;
    } else if (trimmed.includes('/')) {
      filename = trimmed.split('/').pop()?.split(/[?&#]/)[0] || '';
    } else {
      filename = trimmed.split(/[?&#]/)[0];
    }
    filename = decodeURIComponent(filename.trim());

    if (filename && filename.length >= 3 && filename.includes('.')) {
      const sizeParam = size === 'icon' ? '&w=64&h=64&fit=crop'
                      : size === 'thumb' ? '&w=200&h=200&fit=crop'
                      : size === 'md' ? '&w=480'
                      : '&w=1200';

      return `${resolvedPhpEndpoint}?f=${encodeURIComponent(filename)}${sizeParam}`;
    }
  }

  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const suffix = getVariantSuffix(size);

  // Fotos de usuário enviadas ao servidor PHP devem usar o endpoint configurado.
  if (trimmed.includes('/uploads/users/') || trimmed.includes('/avatar')) {
    if (hasConfiguredImageServer) {
      const filename = trimmed.split('/').pop()?.split(/[?&#]/)[0] || '';
      const sizeParam = size === 'icon' ? '&w=64&h=64&fit=crop'
        : size === 'thumb' ? '&w=200&h=200&fit=crop'
          : size === 'md' ? '&w=480'
            : '&w=1200';
      if (filename) {
        return `${phpEndpoint}?f=${encodeURIComponent(decodeURIComponent(filename))}${sizeParam}`;
      }
    }

    // Fallback para fotos armazenadas diretamente no servidor Node.
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
  }

  // Se for URL externa completa que NÃO é do servidor de uploads (ex: Google, Unsplash, CDN externa)
  if (!trimmed.includes('/uploads/')) {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    // Se for apenas o identificador da foto do dotas legado (ex: 1792778632832_be079bf20802)
    const cleanId = trimmed.replace(/^\/+/, '');
    if (!cleanId || cleanId.length < 5) return '';
    return `${baseUrl}/uploads/pedidos/mercadoria/${cleanId}${suffix}`;
  }

  // Remove qualquer sufixo e extensão existente (_icon, _thumb, _md, _lg, .jpg, .jpeg, .png, etc.)
  let cleaned = trimmed
    .replace(/_(icon|thumb|md|lg)\.(jpe?g|png|webp)$/i, '')
    .replace(/_(icon|thumb|md|lg)$/i, '')
    .replace(/\.(jpe?g|png|webp)$/i, '');

  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return `${cleaned}${suffix}`;
  }

  const cleanPath = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return `${baseUrl}${cleanPath}${suffix}`;
}

/**
 * Converte um campo de foto retornado pelo backend em URL pública resolvida no tamanho desejado:
 * https://<API_BASE_URL><caminho-base>_<sufixo>.jpg
 */
export function formatPhotoUrl(rawPhoto: any, size: PhotoVariantSize = 'md'): string | null {
  if (!rawPhoto) return null;
  const urls = extractPhotoUrls(rawPhoto, size);
  return urls.length > 0 ? urls[0] : null;
}

/**
 * Extrai todos os caminhos-base ou fotos de um campo (string, array ou JSON serializado)
 * e devolve a lista de URLs completas prontas para exibição no tamanho solicitado.
 */
export function extractPhotoUrls(rawPhoto: any, size: PhotoVariantSize = 'md'): string[] {
  if (!rawPhoto) return [];

  let rawList: string[] = [];

  if (Array.isArray(rawPhoto)) {
    rawList = rawPhoto.map(p => String(p).trim()).filter(Boolean);
  } else if (typeof rawPhoto === 'string') {
    const trimmed = rawPhoto.trim();
    if (
      !trimmed || 
      trimmed === '[]' || 
      trimmed === 'null' || 
      trimmed === 'undefined' ||
      trimmed.includes('maps.app.goo.gl')
    ) {
      return [];
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          rawList = parsed.map(p => {
            if (typeof p === 'string') return p.trim();
            if (p && typeof p === 'object' && p.url) return String(p.url).trim();
            return '';
          }).filter(Boolean);
        }
      } catch {
        const cleaned = trimmed.replace(/[\[\]"']/g, '').split(',');
        rawList = cleaned.map(p => p.trim()).filter(Boolean);
      }
    } else {
      rawList = [trimmed];
    }
  }

  const results: string[] = [];
  for (const item of rawList) {
    const normalized = normalizePhotoPath(item, size);
    if (normalized && !results.includes(normalized)) {
      results.push(normalized);
    }
  }

  return results;
}

/**
 * Converte um Local retornado pelo endpoint GET /locais em um Place do mapa
 */
export function backendLocalToPlace(local: BackendLocal): Place {
  const lat = typeof local.lat === 'string' ? parseFloat(local.lat) : local.lat;
  const lng = typeof local.lng === 'string' ? parseFloat(local.lng) : local.lng;

  const validLat = isNaN(lat) ? -16.686891 : lat;
  const validLng = isNaN(lng) ? -49.264794 : lng;

  const fullAddress = local.endereco || 
    (local.rua ? `${local.rua}${local.numero ? `, ${local.numero}` : ''}${local.setor ? ` - ${local.setor}` : ''}${local.cidade ? `, ${local.cidade}` : ''}` : local.name);

  // Somente usa imageUrl se for uma imagem real válida (ex: .png ou .jpg), NUNCA link web do Google Maps
  const validImage = (local.icon && typeof local.icon === 'string' && local.icon.startsWith('http') && !local.icon.includes('maps.app.goo.gl')) 
    ? local.icon 
    : undefined;

  const isStreet = isStreetOrAddress({
    name: local.name,
    category: local.setor,
    address: fullAddress
  });

  // Extrai ou calcula horário de fechamento para estabelecimento comercial
  const extractedClosing = isStreet ? undefined : resolveCommercialClosingTime({
    name: local.name,
    category: local.setor,
    address: fullAddress,
    horario: local.horario
  });

  return {
    id: `local-${local.id}`,
    name: local.name,
    category: isStreet ? 'Via pública / Endereço' : (local.central_coletas ? 'Central de Coletas' : 'Ponto Comercial'),
    address: fullAddress,
    coordinates: { lat: validLat, lng: validLng },
    phone: local.telefone,
    website: local.site,
    openNow: isStreet ? undefined : true,
    closingTime: isStreet ? undefined : extractedClosing,
    description: `Ponto cadastrado na rede EncomendasZap${local.cidade ? ` • ${local.cidade}` : ''}${local.setor ? ` (${local.setor})` : ''}`,
    imageUrl: validImage,
    originCity: local.cidade || 'Goiânia - GO',
    destinationCity: local.cidade || 'Goiânia - GO',
    operationType: 'coleta',
    orderStage: 'coleta',
    pickupName: local.name,
    pickupAddress: fullAddress,
    pickupCoordinates: { lat: validLat, lng: validLng }
  };
}

/**
 * Converte um Pedido retornado por POST /pedidos/list_pedidos em um Place ativo no mapa
 * Respeitando a dinâmica exata:
 * 1. Inicial / Pendente / Coletando -> marcador ativo na COLETA
 * 2. Coletado -> se troca, vai para TROCA; se entrega, vai para ENTREGA
 * 3. Trocado -> vai para a ENTREGA final
 * 4. Entregue / Finalizado -> orderStage: 'concluido'
 */
export interface ExtractedDriverAssignment {
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
}

/** Valor total e situação de pagamento do pedido, como gravados no banco. */
export function pedidoPaymentFields(pedido?: Partial<BackendPedido> | null): Pick<Place, 'price' | 'paymentStatus' | 'isPaid'> {
  const anyPedido = (pedido || {}) as any;
  const price = Number(anyPedido.total ?? anyPedido.valor_total ?? anyPedido.valor ?? 0) || 0;
  const isPaid = String(anyPedido.status_pagamento || '').toLowerCase().trim() === 'pago';
  return { price, paymentStatus: isPaid ? 'pago' : 'pendente', isPaid };
}

/**
 * Extrai o motorista atribuído à encomenda a partir dos campos do banco de dados de acordo com a operação:
 * - Para COLETA: coleta_user_id, coleta_user_nome, coleta_motoristas
 * - Para ENTREGA: entrega_user_id, entrega_user_nome, entrega_motoristas
 * - Para TROCA: troca_user_id ou entrega_user_id
 * 
 * Regra de Ouro EncomendasZap: O motorista que faz a coleta NÃO é o da entrega.
 * Cada maker tem seu próprio motorista definido individualmente.
 */
export function extractDriverAssignmentFromPedido(
  pedido?: any, 
  operationType?: OperationType | string
): ExtractedDriverAssignment {
  if (!pedido) return {};

  const op = operationType || 'coleta';
  let rawId: string | number | undefined;
  let rawName: string | undefined;

  if (op === 'coleta') {
    rawId = pedido.coleta_user_id;
    rawName = pedido.coleta_user_nome;
    if (!rawId && pedido.coleta_motoristas) {
      try {
        const motoristasStr = String(pedido.coleta_motoristas).trim();
        if (motoristasStr.startsWith('[')) {
          const parsed = JSON.parse(motoristasStr);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]) {
            rawId = parsed[0];
          }
        }
      } catch {}
    }
  } else if (op === 'entrega' || op === 'retorno') {
    rawId = pedido.entrega_user_id;
    rawName = pedido.entrega_user_nome;
    if (!rawId && pedido.entrega_motoristas) {
      try {
        const motoristasStr = String(pedido.entrega_motoristas).trim();
        if (motoristasStr.startsWith('[')) {
          const parsed = JSON.parse(motoristasStr);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]) {
            rawId = parsed[0];
          }
        }
      } catch {}
    }
  } else if (op === 'troca') {
    rawId = pedido.troca_user_id || pedido.entrega_user_id;
    rawName = pedido.troca_user_nome || pedido.entrega_user_nome;
    if (!rawId && pedido.troca_motoristas) {
      try {
        const motoristasStr = String(pedido.troca_motoristas).trim();
        if (motoristasStr.startsWith('[')) {
          const parsed = JSON.parse(motoristasStr);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]) {
            rawId = parsed[0];
          }
        }
      } catch {}
    }
  }

  // Verifica cache local por chave específica do marcador (ex: pedido-123-coleta ou 123_coleta)
  if (!rawId && pedido.id) {
    try {
      const rawLocal = localStorage.getItem('encomendaszap_order_driver_assignments');
      if (rawLocal) {
        const map = JSON.parse(rawLocal);
        const specificKey = `pedido-${pedido.id}-${op}`;
        const opKey = `${pedido.id}_${op}`;
        const saved = map[specificKey] || map[opKey];
        if (saved && saved.driverId) {
          rawId = saved.driverId;
          if (!rawName) rawName = saved.driverName;
          if (saved.driverPhone && !pedido.motorista_telefone) {
            pedido.motorista_telefone = saved.driverPhone;
          }
        }
      }
    } catch {}
  }

  const cleanId = rawId ? String(rawId).replace(/\D/g, '') : undefined;
  const rawPhone = pedido.motorista_telefone || pedido.motorista_phone || undefined;

  return {
    driverId: cleanId,
    driverName: rawName || (cleanId ? `Motorista #${cleanId}` : undefined),
    driverPhone: rawPhone ? String(rawPhone) : undefined
  };
}

type RoutePointKey = 'pickup' | 'exchange' | 'delivery';

function parseOrderExtraItems(pedido?: BackendPedido | null): Record<string, unknown> {
  const raw = pedido?.itens_extras;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function getRoutePointMetadata(pedido: BackendPedido, point: RoutePointKey, includeLegacySeller = false) {
  const extra = parseOrderExtraItems(pedido);
  const visibilityValue = pedido[`${point}Visibility`] ?? extra[`${point}Visibility`] ??
    pedido.orderVisibility ?? extra.orderVisibility;
  const operation = point === 'pickup' ? 'coleta' : point === 'exchange' ? 'troca' : 'entrega';
  const visibility = visibilityValue === 'privado' ? 'privado' as const : visibilityValue === 'publico' ? 'publico' as const : undefined;
  const legacyDriver = extractDriverAssignmentFromPedido(pedido, operation);
  const sharedDriverId = point !== 'exchange' ? extra.assignedDriverId : undefined;
  const driverId = pedido[`${point}AssignedDriverId`] ?? extra[`${point}AssignedDriverId`] ??
    sharedDriverId ??
    legacyDriver.driverId;
  const driverName = pedido[`${point}AssignedDriverName`] ?? extra[`${point}AssignedDriverName`] ??
    legacyDriver.driverName;
  const driverPhone = pedido[`${point}AssignedDriverPhone`] ?? extra[`${point}AssignedDriverPhone`] ??
    (point !== 'exchange' ? extra.assignedDriverPhone : undefined) ??
    legacyDriver.driverPhone;
  // Ponto público fica disponível para qualquer motorista: não pode carregar motorista atribuído
  const isPublic = visibility === 'publico';

  const sellerName = pedido[`${point}SellerName`] ?? extra[`${point}SellerName`] ??
    (includeLegacySeller ? extra.sellerName : undefined) ??
    (point === 'pickup' ? pedido.coleta_responsavel || pedido.coleta_contato
      : point === 'exchange' ? pedido.troca_responsavel || pedido.troca_contato
        : pedido.entrega_responsavel || pedido.entrega_contato);
  const sellerPhone = pedido[`${point}SellerPhone`] ?? extra[`${point}SellerPhone`] ??
    (includeLegacySeller ? extra.sellerPhone : undefined) ??
    (point === 'pickup' ? pedido.coleta_responsavel_phone || pedido.coleta_phone
      : point === 'exchange' ? pedido.troca_responsavel_phone || pedido.troca_phone
        : pedido.entrega_responsavel_phone || pedido.entrega_phone);

  return {
    visibility,
    driverId: isPublic || driverId == null ? undefined : String(driverId),
    driverName: isPublic || driverName == null ? undefined : String(driverName),
    driverPhone: isPublic || driverPhone == null ? undefined : String(driverPhone),
    sellerName: sellerName == null ? undefined : String(sellerName),
    sellerPhone: sellerPhone == null ? undefined : String(sellerPhone)
  };
}

export function backendPedidoToPlace(pedido: BackendPedido): Place {
  const isExchange = pedido.tipo_encomenda === 'troca' || Boolean(pedido.troca_lat);
  
  const rawColetaLat = pedido.coleta_locais_lat ?? pedido.coleta_lat;
  const rawColetaLng = pedido.coleta_locais_lng ?? pedido.coleta_lng;
  const rawEntregaLat = pedido.entrega_locais_lat ?? pedido.entrega_lat;
  const rawEntregaLng = pedido.entrega_locais_lng ?? pedido.entrega_lng;

  const hasRealColeta = rawColetaLat != null && rawColetaLng != null && !isNaN(Number(rawColetaLat));
  const hasRealEntrega = rawEntregaLat != null && rawEntregaLng != null && !isNaN(Number(rawEntregaLat));

  const parsedColetaLat = typeof rawColetaLat === 'string' ? parseFloat(rawColetaLat) : Number(rawColetaLat);
  const parsedColetaLng = typeof rawColetaLng === 'string' ? parseFloat(rawColetaLng) : Number(rawColetaLng);
  const parsedEntregaLat = typeof rawEntregaLat === 'string' ? parseFloat(rawEntregaLat) : Number(rawEntregaLat);
  const parsedEntregaLng = typeof rawEntregaLng === 'string' ? parseFloat(rawEntregaLng) : Number(rawEntregaLng);

  const fallbackLat = !isNaN(parsedColetaLat) ? parsedColetaLat : (!isNaN(parsedEntregaLat) ? parsedEntregaLat : -16.686891);
  const fallbackLng = !isNaN(parsedColetaLng) ? parsedColetaLng : (!isNaN(parsedEntregaLng) ? parsedEntregaLng : -49.264794);

  const coletaLat = !isNaN(parsedColetaLat) ? parsedColetaLat : fallbackLat;
  const coletaLng = !isNaN(parsedColetaLng) ? parsedColetaLng : fallbackLng;
  const entregaLat = !isNaN(parsedEntregaLat) ? parsedEntregaLat : fallbackLat;
  const entregaLng = !isNaN(parsedEntregaLng) ? parsedEntregaLng : fallbackLng;
  
  const trocaLat = pedido.troca_lat ? (typeof pedido.troca_lat === 'string' ? parseFloat(pedido.troca_lat) : Number(pedido.troca_lat)) : undefined;
  const trocaLng = pedido.troca_lng ? (typeof pedido.troca_lng === 'string' ? parseFloat(pedido.troca_lng) : Number(pedido.troca_lng)) : undefined;

  const pickupCoords: LocationCoordinates = { lat: coletaLat, lng: coletaLng };
  const deliveryCoords: LocationCoordinates = { lat: entregaLat, lng: entregaLng };
  const exchangeCoords: LocationCoordinates | undefined = trocaLat !== undefined && trocaLng !== undefined && !isNaN(trocaLat) && !isNaN(trocaLng)
    ? { lat: trocaLat, lng: trocaLng }
    : undefined;

  const etapaNormalized = (pedido.etapa || 'aprovado').toLowerCase().trim();

  const coletaLocalName = pedido.coleta_local || pedido.coleta_locais_name || pedido.local || 'Ponto de Coleta';
  const entregaLocalName = pedido.entrega_local || pedido.entrega_locais_name || 'Ponto de Entrega';
  const coletaFullAddress = pedido.coleta_cidade ? `${coletaLocalName} - ${pedido.coleta_cidade}` : coletaLocalName;
  const entregaFullAddress = pedido.entrega_cidade ? `${entregaLocalName} - ${pedido.entrega_cidade}` : entregaLocalName;

  let activeOperationType: OperationType = 'coleta';
  let activeStage: 'coleta' | 'troca' | 'entrega' | 'retorno' | 'concluido' = 'coleta';
  let activeCoords = pickupCoords;
  let activeAddress = coletaFullAddress;
  let activeName = coletaLocalName;

  if (etapaNormalized === 'entregue' || etapaNormalized === 'finalizado' || etapaNormalized === 'concluido' || etapaNormalized === 'cancelado') {
    // Pedido totalmente concluído
    activeStage = 'concluido';
    activeOperationType = isExchange ? 'troca' : 'entrega';
    activeCoords = isExchange ? pickupCoords : deliveryCoords;
    activeAddress = isExchange ? coletaFullAddress : entregaFullAddress;
    activeName = isExchange ? `Retorno: ${coletaLocalName}` : entregaLocalName;
  } else if (isExchange) {
    if (etapaNormalized === 'trocado' || etapaNormalized === 'retornando' || etapaNormalized === 'segunda_entrega' || etapaNormalized === 'retorno') {
      activeStage = 'retorno';
      activeOperationType = 'entrega';
      activeCoords = pickupCoords;
      activeAddress = coletaFullAddress;
      activeName = `2ª Entrega (Retorno à Coleta): ${coletaLocalName}`;
    } else if (etapaNormalized === 'coletado' || etapaNormalized === 'trocando') {
      activeStage = 'troca';
      activeOperationType = 'troca';
      activeCoords = exchangeCoords || deliveryCoords;
      activeAddress = entregaFullAddress;
      activeName = entregaLocalName;
    } else {
      activeStage = 'coleta';
      activeOperationType = 'coleta';
      activeCoords = pickupCoords;
      activeAddress = coletaFullAddress;
      activeName = coletaLocalName;
    }
  } else {
    if (etapaNormalized === 'coletado' || etapaNormalized === 'entregando') {
      activeStage = 'entrega';
      activeOperationType = 'entrega';
      activeCoords = deliveryCoords;
      activeAddress = entregaFullAddress;
      activeName = entregaLocalName;
    } else {
      activeStage = 'coleta';
      activeOperationType = 'coleta';
      activeCoords = pickupCoords;
      activeAddress = coletaFullAddress;
      activeName = coletaLocalName;
    }
  }

  const vType = pedido.tipo_veiculo === 'carro' ? 'carro' : pedido.tipo_veiculo === 'utilitario' ? 'utilitario' : 'moto';

  const orderPhotos = activeOperationType === 'coleta'
    ? extractPhotoUrls(pedido.coleta_foto, 'md').concat(extractPhotoUrls(pedido.mercadoria_foto, 'md'))
    : extractPhotoUrls(pedido.entrega_foto, 'md');
  const uniquePhotos = Array.from(new Set(orderPhotos));

  const activeObsRaw = activeOperationType === 'coleta'
    ? (pedido.coleta_obs ?? pedido.detalhes)
    : activeOperationType === 'troca' 
    ? (pedido.troca_obs ?? pedido.detalhes)
    : (pedido.entrega_obs ?? pedido.detalhes);
  const activeObs = (activeObsRaw || '').trim() || undefined;

  const activeResp = (activeOperationType === 'coleta' 
    ? (pedido.coleta_responsavel || pedido.coleta_contato) 
    : activeOperationType === 'troca' 
    ? (pedido.troca_responsavel || pedido.troca_contato) 
    : (pedido.entrega_responsavel || pedido.entrega_contato)) || undefined;

  const activeRespPhoneRaw = activeOperationType === 'coleta' 
    ? (pedido.coleta_responsavel_phone || pedido.coleta_phone) 
    : activeOperationType === 'troca' 
    ? (pedido.troca_responsavel_phone || pedido.troca_phone) 
    : (pedido.entrega_responsavel_phone || pedido.entrega_phone);
  const activeRespPhone = activeRespPhoneRaw ? String(activeRespPhoneRaw) : undefined;
  const activePointKey: RoutePointKey = activeOperationType === 'coleta'
    ? 'pickup'
    : activeOperationType === 'troca'
      ? 'exchange'
      : 'delivery';
  const activePointMetadata = getRoutePointMetadata(pedido, activePointKey, true);
  const pickupMetadata = getRoutePointMetadata(pedido, 'pickup');
  const exchangeMetadata = getRoutePointMetadata(pedido, 'exchange');
  const deliveryMetadata = getRoutePointMetadata(pedido, 'delivery');

  return {
    id: `pedido-${pedido.id}-${activeOperationType}`,
    ...pedidoPaymentFields(pedido),
    orderCode: `EZ-${pedido.id}-GO`,
    name: activeName,
    address: activeAddress,
    coordinates: activeCoords,
    category: isExchange ? 'Troca de Mercadoria' : activeOperationType === 'coleta' ? 'Coleta Expressa' : 'Entrega Expressa',
    operationType: activeOperationType,
    orderStage: activeStage,
    isExchangeOrder: isExchange,
    pickupVisibility: pickupMetadata.visibility,
    pickupAssignedDriverId: pickupMetadata.driverId,
    pickupAssignedDriverPhone: pickupMetadata.driverPhone,
    pickupAssignedDriverName: pickupMetadata.driverName,
    pickupSellerName: pickupMetadata.sellerName,
    pickupSellerPhone: pickupMetadata.sellerPhone,
    exchangeVisibility: exchangeMetadata.visibility,
    exchangeAssignedDriverId: exchangeMetadata.driverId,
    exchangeAssignedDriverPhone: exchangeMetadata.driverPhone,
    exchangeAssignedDriverName: exchangeMetadata.driverName,
    exchangeSellerName: exchangeMetadata.sellerName,
    exchangeSellerPhone: exchangeMetadata.sellerPhone,
    deliveryVisibility: deliveryMetadata.visibility,
    deliveryAssignedDriverId: deliveryMetadata.driverId,
    deliveryAssignedDriverPhone: deliveryMetadata.driverPhone,
    deliveryAssignedDriverName: deliveryMetadata.driverName,
    deliverySellerName: deliveryMetadata.sellerName,
    deliverySellerPhone: deliveryMetadata.sellerPhone,
    customerName: pedido.cliente || 'Cliente EncomendasZap',
    customerPhone: pedido.phone ? String(pedido.phone) : undefined,
    originCity: pedido.coleta_cidade || pedido.cidade || 'Goiânia - GO',
    destinationCity: pedido.entrega_cidade || pedido.cidade || 'Goiânia - GO',
    vehicleType: vType,
    packageType: 'caixa',
    driverNotes: activeObs,
    observations: activeObs,
    responsibleName: activeResp,
    responsiblePhone: activeRespPhone,
    managerName: activeResp,
    managerPhone: activeRespPhone,
    sellerName: activePointMetadata.sellerName || activeResp,
    sellerPhone: activePointMetadata.sellerPhone || activeRespPhone,
    orderVisibility: activePointMetadata.visibility,
    assignedDriverId: activePointMetadata.driverId,
    assignedDriverName: activePointMetadata.driverName || extractDriverAssignmentFromPedido(pedido, activeOperationType).driverName,
    assignedDriverPhone: activePointMetadata.driverPhone || extractDriverAssignmentFromPedido(pedido, activeOperationType).driverPhone,
    imageUrl: uniquePhotos[0] || undefined,
    photos: uniquePhotos.length > 0 ? uniquePhotos : undefined,
    
    // Dados completos dos pontos da encomenda
    pickupName: coletaLocalName,
    pickupAddress: coletaFullAddress,
    pickupCoordinates: pickupCoords,
    pickupContact: pedido.coleta_contato,
    pickupPhone: pedido.coleta_phone,
    pickupNotes: pedido.coleta_obs,

    exchangeName: pedido.troca_nome || entregaLocalName,
    exchangeAddress: pedido.troca_endereco || entregaFullAddress,
    exchangeCoordinates: exchangeCoords || deliveryCoords,
    exchangeContact: pedido.troca_contato,
    exchangePhone: pedido.troca_phone,
    exchangeNotes: pedido.troca_obs,

    deliveryName: entregaLocalName,
    deliveryAddress: entregaFullAddress,
    deliveryCoordinates: deliveryCoords,
    deliveryContact: pedido.entrega_contato,
    deliveryPhone: pedido.entrega_phone,
    deliveryNotes: pedido.entrega_obs,
    orderDateBadge: getOrderDateBadgeFromDate(pedido.data || pedido.created_at || (pedido as any).coleta_data)
  };
}

/**
 * Converte um Pedido em todas as suas paradas ativas no mapa (Coleta e/ou Entrega/Troca)
 * - Se etapa for 'aprovado'/'coletando': gera parada de Coleta E parada de Entrega
 * - Se etapa for 'coletado'/'trocando': a coleta já acabou, gera apenas parada de Entrega/Troca
 * - Se etapa for 'trocado': gera parada de 2ª entrega (retorno à coleta)
 * - Se etapa for 'entregue'/'finalizado': não gera nada (já finalizado)
 */
export function backendPedidoToPlaces(pedido: BackendPedido): Place[] {
  const etapaNormalized = (pedido.etapa || 'aprovado').toLowerCase().trim();
  if (etapaNormalized === 'entregue' || etapaNormalized === 'finalizado' || etapaNormalized === 'concluido' || etapaNormalized === 'cancelado') {
    return [];
  }

  const isExchange = pedido.tipo_encomenda === 'troca' || Boolean(pedido.troca_lat);
  
  const rawColetaLat = pedido.coleta_locais_lat ?? pedido.coleta_lat;
  const rawColetaLng = pedido.coleta_locais_lng ?? pedido.coleta_lng;
  const rawEntregaLat = pedido.entrega_locais_lat ?? pedido.entrega_lat;
  const rawEntregaLng = pedido.entrega_locais_lng ?? pedido.entrega_lng;

  // 1. Tenta coordenadas explícitas nos campos do pedido
  let parsedColetaLat = typeof rawColetaLat === 'string' ? parseFloat(rawColetaLat) : Number(rawColetaLat);
  let parsedColetaLng = typeof rawColetaLng === 'string' ? parseFloat(rawColetaLng) : Number(rawColetaLng);
  let parsedEntregaLat = typeof rawEntregaLat === 'string' ? parseFloat(rawEntregaLat) : Number(rawEntregaLat);
  let parsedEntregaLng = typeof rawEntregaLng === 'string' ? parseFloat(rawEntregaLng) : Number(rawEntregaLng);

  // 2. Se coletaLat ou coletaLng estiver ausente, extrai do texto do endereço ou busca local conhecido
  if (isNaN(parsedColetaLat) || isNaN(parsedColetaLng) || parsedColetaLat === 0) {
    const extractedColeta = extractCoordsFromString(pedido.coleta_endereco) || 
                            extractCoordsFromString(pedido.coleta_local) || 
                            extractCoordsFromString(pedido.local) ||
                            resolveKnownAddressCoordinates(pedido.coleta_endereco) ||
                            resolveKnownAddressCoordinates(pedido.coleta_local) ||
                            resolveKnownAddressCoordinates(pedido.local);
    if (extractedColeta) {
      parsedColetaLat = extractedColeta.lat;
      parsedColetaLng = extractedColeta.lng;
    }
  }

  // 3. Se entregaLat ou entregaLng estiver ausente, extrai do texto do endereço ou busca local conhecido
  if (isNaN(parsedEntregaLat) || isNaN(parsedEntregaLng) || parsedEntregaLat === 0) {
    const extractedEntrega = extractCoordsFromString(pedido.entrega_endereco) || 
                             extractCoordsFromString(pedido.entrega_local) ||
                             resolveKnownAddressCoordinates(pedido.entrega_endereco) ||
                             resolveKnownAddressCoordinates(pedido.entrega_local);
    if (extractedEntrega) {
      parsedEntregaLat = extractedEntrega.lat;
      parsedEntregaLng = extractedEntrega.lng;
    }
  }

  // 4. Jitter determinístico para fallback de modo que cada pedido fique visível e individual no mapa
  const numId = typeof pedido.id === 'number' ? pedido.id : (parseInt(String(pedido.id).replace(/\D/g, '').slice(-6), 10) || 1234);
  const jitterLat = (((numId * 17) % 50) - 25) * 0.00035;
  const jitterLng = (((numId * 31) % 50) - 25) * 0.00035;
  const fallbackLat = -16.686891 + jitterLat;
  const fallbackLng = -49.264794 + jitterLng;

  const hasColetaAddressOrName = Boolean((pedido.coleta_endereco && pedido.coleta_endereco.trim()) || (pedido.coleta_local && pedido.coleta_local.trim()) || (pedido.local && pedido.local.trim()));
  const hasEntregaAddressOrName = Boolean((pedido.entrega_endereco && pedido.entrega_endereco.trim()) || (pedido.entrega_local && pedido.entrega_local.trim()) || (pedido.entrega_nome && pedido.entrega_nome.trim()));

  const hasRealColeta = !isNaN(parsedColetaLat) && !isNaN(parsedColetaLng) && parsedColetaLat !== 0 && hasColetaAddressOrName;
  const hasRealEntrega = !isNaN(parsedEntregaLat) && !isNaN(parsedEntregaLng) && parsedEntregaLat !== 0 && hasEntregaAddressOrName;

  const coletaLat = hasRealColeta ? parsedColetaLat : (hasRealEntrega ? parsedEntregaLat : fallbackLat);
  const coletaLng = hasRealColeta ? parsedColetaLng : (hasRealEntrega ? parsedEntregaLng : fallbackLng);
  const entregaLat = hasRealEntrega ? parsedEntregaLat : (hasRealColeta ? parsedColetaLat : fallbackLat);
  const entregaLng = hasRealEntrega ? parsedEntregaLng : (hasRealColeta ? parsedColetaLng : fallbackLng);

  const pickupCoords: LocationCoordinates = { lat: coletaLat, lng: coletaLng };
  const deliveryCoords: LocationCoordinates = { lat: entregaLat, lng: entregaLng };

  const rawColetaName = pedido.coleta_local || pedido.coleta_locais_name || pedido.local;
  const coletaLocalName = (rawColetaName && rawColetaName !== 'Ponto de Coleta')
    ? rawColetaName
    : (pedido.cliente ? `Coleta: ${pedido.cliente}` : (pedido.coleta_endereco?.slice(0, 30) || 'Ponto de Coleta'));

  const rawEntregaName = pedido.entrega_local || pedido.entrega_locais_name;
  const entregaLocalName = (rawEntregaName && rawEntregaName !== 'Ponto de Entrega')
    ? rawEntregaName
    : (pedido.cliente ? `Entrega: ${pedido.cliente}` : (pedido.entrega_endereco?.slice(0, 30) || 'Ponto de Entrega'));

  const coletaFullAddress = pedido.coleta_cidade ? `${coletaLocalName} - ${pedido.coleta_cidade}` : (pedido.coleta_endereco || coletaLocalName);
  const entregaFullAddress = pedido.entrega_cidade ? `${entregaLocalName} - ${pedido.entrega_cidade}` : (pedido.entrega_endereco || entregaLocalName);

  const vType: VehicleCollectionType = pedido.tipo_veiculo === 'carro' ? 'carro' : pedido.tipo_veiculo === 'utilitario' ? 'utilitario' : 'moto';
  const dateBadge = getOrderDateBadgeFromDate(pedido.data || pedido.created_at);
  const cleanOrderDate = String(pedido.data || pedido.created_at || '').slice(0, 10) || undefined;
  const pickupMetadata = getRoutePointMetadata(pedido, 'pickup');
  const exchangeMetadata = getRoutePointMetadata(pedido, 'exchange');
  const deliveryMetadata = getRoutePointMetadata(pedido, 'delivery');

  const baseShared = {
    ...pedidoPaymentFields(pedido),
    id: `pedido-${pedido.id}`,
    orderId: String(pedido.id),
    pedido_id: pedido.id,
    orderCode: `EZ-${pedido.id}-GO`,
    customerName: pedido.cliente || 'Cliente EncomendasZap',
    customerPhone: pedido.phone ? String(pedido.phone) : undefined,
    originCity: pedido.coleta_cidade || pedido.cidade || 'Goiânia - GO',
    destinationCity: pedido.entrega_cidade || pedido.cidade || 'Goiânia - GO',
    vehicleType: vType,
    packageType: 'caixa' as const,
    openNow: true,
    isExchangeOrder: isExchange,
    orderDateBadge: dateBadge,
    scheduledDate: cleanOrderDate,
    data: cleanOrderDate,
    orderDate: cleanOrderDate,
    driverNotes: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
    observations: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
    pickupVisibility: pickupMetadata.visibility,
    pickupAssignedDriverId: pickupMetadata.driverId,
    pickupAssignedDriverPhone: pickupMetadata.driverPhone,
    pickupAssignedDriverName: pickupMetadata.driverName,
    pickupSellerName: pickupMetadata.sellerName,
    pickupSellerPhone: pickupMetadata.sellerPhone,
    exchangeVisibility: exchangeMetadata.visibility,
    exchangeAssignedDriverId: exchangeMetadata.driverId,
    exchangeAssignedDriverPhone: exchangeMetadata.driverPhone,
    exchangeAssignedDriverName: exchangeMetadata.driverName,
    exchangeSellerName: exchangeMetadata.sellerName,
    exchangeSellerPhone: exchangeMetadata.sellerPhone,
    deliveryVisibility: deliveryMetadata.visibility,
    deliveryAssignedDriverId: deliveryMetadata.driverId,
    deliveryAssignedDriverPhone: deliveryMetadata.driverPhone,
    deliveryAssignedDriverName: deliveryMetadata.driverName,
    deliverySellerName: deliveryMetadata.sellerName,
    deliverySellerPhone: deliveryMetadata.sellerPhone,
    pickupName: coletaLocalName,
    pickupAddress: coletaFullAddress,
    pickupCoordinates: hasRealColeta ? pickupCoords : undefined,
    pickupContact: pedido.coleta_contato,
    pickupPhone: pedido.coleta_phone,
    pickupNotes: pedido.coleta_obs ?? pedido.detalhes,
    deliveryName: entregaLocalName,
    deliveryAddress: entregaFullAddress,
    deliveryCoordinates: hasRealEntrega ? deliveryCoords : undefined,
    deliveryContact: pedido.entrega_contato,
    deliveryPhone: pedido.entrega_phone,
    deliveryNotes: pedido.entrega_obs ?? pedido.detalhes,
    exchangeName: pedido.troca_nome || entregaLocalName,
    exchangeAddress: pedido.troca_endereco || entregaFullAddress,
    exchangeCoordinates: isExchange && hasRealEntrega ? deliveryCoords : undefined,
    exchangeContact: pedido.troca_contato,
    exchangePhone: pedido.troca_phone,
    exchangeNotes: pedido.troca_obs ?? pedido.detalhes,
  };

  const coletaDriver = extractDriverAssignmentFromPedido(pedido, 'coleta');
  const entregaDriver = extractDriverAssignmentFromPedido(pedido, 'entrega');
  const trocaDriver = extractDriverAssignmentFromPedido(pedido, 'troca');

  const coletaPhotos = Array.from(new Set(extractPhotoUrls(pedido.coleta_foto, 'md').concat(extractPhotoUrls(pedido.mercadoria_foto, 'md'))));
  const entregaPhotos = extractPhotoUrls(pedido.entrega_foto, 'md');

  const places: Place[] = [];

  const isColetaAtiva = etapaNormalized === 'aprovado' || etapaNormalized === 'pendente' || etapaNormalized === 'coletando';
  const isColetado = etapaNormalized === 'coletado' || etapaNormalized === 'trocando' || etapaNormalized === 'trocado' || etapaNormalized === 'retornando' || etapaNormalized === 'entregando';
  const isTrocado = etapaNormalized === 'trocado' || etapaNormalized === 'retornando' || etapaNormalized === 'segunda_entrega' || etapaNormalized === 'retorno';

  // REGRA 1: "se nao tiver local de coleta so aparece o local de entrega ou troca"
  if (!hasRealColeta) {
    if (isExchange) {
      if (!isTrocado && etapaNormalized !== 'entregue' && etapaNormalized !== 'finalizado') {
        places.push({
          ...baseShared,
          id: `pedido-${pedido.id}-troca`,
          name: entregaLocalName,
          address: entregaFullAddress,
          coordinates: deliveryCoords,
          imageUrl: undefined,
          photos: undefined,
          category: 'Troca de Mercadoria',
          operationType: 'troca',
          orderStage: 'troca',
          assignedDriverId: exchangeMetadata.driverId,
          assignedDriverName: exchangeMetadata.driverName,
          assignedDriverPhone: exchangeMetadata.driverPhone,
          orderVisibility: exchangeMetadata.visibility,
          sellerName: exchangeMetadata.sellerName,
          sellerPhone: exchangeMetadata.sellerPhone,
          observations: (pedido.troca_obs ?? pedido.detalhes ?? '').trim() || undefined,
          driverNotes: (pedido.troca_obs ?? pedido.detalhes ?? '').trim() || undefined,
          responsibleName: pedido.troca_responsavel || pedido.troca_contato || undefined,
          responsiblePhone: (pedido.troca_responsavel_phone || pedido.troca_phone) ? String(pedido.troca_responsavel_phone || pedido.troca_phone) : undefined,
          managerName: pedido.troca_responsavel || pedido.troca_contato || undefined,
          managerPhone: (pedido.troca_responsavel_phone || pedido.troca_phone) ? String(pedido.troca_responsavel_phone || pedido.troca_phone) : undefined,
        });
      }
    } else {
      if (etapaNormalized !== 'entregue' && etapaNormalized !== 'finalizado') {
        places.push({
          ...baseShared,
          id: `pedido-${pedido.id}-entrega`,
          name: entregaLocalName,
          address: entregaFullAddress,
          coordinates: deliveryCoords,
          imageUrl: entregaPhotos[0] || undefined,
          photos: entregaPhotos.length > 0 ? entregaPhotos : undefined,
          category: 'Entrega Expressa',
          operationType: 'entrega',
          orderStage: 'entrega',
          assignedDriverId: deliveryMetadata.driverId,
          assignedDriverName: deliveryMetadata.driverName,
          assignedDriverPhone: deliveryMetadata.driverPhone,
          orderVisibility: deliveryMetadata.visibility,
          sellerName: deliveryMetadata.sellerName,
          sellerPhone: deliveryMetadata.sellerPhone,
          observations: (pedido.entrega_obs ?? pedido.detalhes ?? '').trim() || undefined,
          driverNotes: (pedido.entrega_obs ?? pedido.detalhes ?? '').trim() || undefined,
          responsibleName: pedido.entrega_responsavel || pedido.entrega_contato || undefined,
          responsiblePhone: (pedido.entrega_responsavel_phone || pedido.entrega_phone) ? String(pedido.entrega_responsavel_phone || pedido.entrega_phone) : undefined,
          managerName: pedido.entrega_responsavel || pedido.entrega_contato || undefined,
          managerPhone: (pedido.entrega_responsavel_phone || pedido.entrega_phone) ? String(pedido.entrega_responsavel_phone || pedido.entrega_phone) : undefined,
        });
      }
    }
    return places;
  }

  // REGRA 2: "primeiro aparece o local de coleta, se nao tiver local de entrega ela some"
  if (!hasRealEntrega && !isExchange) {
    if (isColetado) {
      // Ao coletar, como não tem entrega, ELA SOME!
      return [];
    }
    places.push({
      ...baseShared,
      id: `pedido-${pedido.id}-coleta`,
      name: coletaLocalName,
      address: coletaFullAddress,
      coordinates: pickupCoords,
      imageUrl: coletaPhotos[0] || undefined,
      photos: coletaPhotos.length > 0 ? coletaPhotos : undefined,
      category: 'Coleta Expressa',
      operationType: 'coleta',
      orderStage: 'coleta',
      assignedDriverId: pickupMetadata.driverId,
      assignedDriverName: pickupMetadata.driverName,
      assignedDriverPhone: pickupMetadata.driverPhone,
      orderVisibility: pickupMetadata.visibility,
      sellerName: pickupMetadata.sellerName,
      sellerPhone: pickupMetadata.sellerPhone,
      observations: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
      driverNotes: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
      responsibleName: pedido.coleta_responsavel || pedido.coleta_contato || undefined,
      responsiblePhone: (pedido.coleta_responsavel_phone || pedido.coleta_phone) ? String(pedido.coleta_responsavel_phone || pedido.coleta_phone) : undefined,
      managerName: pedido.coleta_responsavel || pedido.coleta_contato || undefined,
      managerPhone: (pedido.coleta_responsavel_phone || pedido.coleta_phone) ? String(pedido.coleta_responsavel_phone || pedido.coleta_phone) : undefined,
    });
    return places;
  }

  // REGRAS 3 e 4: Tem Coleta E Entrega (ou Troca):
  // "se tiver os dois deve seguir assim:
  // primeiro aparece so o local de coleta ao coletar aparece o local de entrega
  // se for troca primeiro e coleta, depois e local de troca, por ultimo o local de coleta vira o local de entrega"
  if (isColetaAtiva) {
    // 1ª Etapa: aparece SÓ o local de coleta
    places.push({
      ...baseShared,
      id: `pedido-${pedido.id}-coleta`,
      name: coletaLocalName,
      address: coletaFullAddress,
      coordinates: pickupCoords,
      imageUrl: coletaPhotos[0] || undefined,
      photos: coletaPhotos.length > 0 ? coletaPhotos : undefined,
      category: isExchange ? 'Troca de Mercadoria' : 'Coleta Expressa',
      operationType: 'coleta',
      orderStage: 'coleta',
      assignedDriverId: pickupMetadata.driverId,
      assignedDriverName: pickupMetadata.driverName,
      assignedDriverPhone: pickupMetadata.driverPhone,
      orderVisibility: pickupMetadata.visibility,
      sellerName: pickupMetadata.sellerName,
      sellerPhone: pickupMetadata.sellerPhone,
      observations: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
      driverNotes: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
      responsibleName: pedido.coleta_responsavel || pedido.coleta_contato || undefined,
      responsiblePhone: (pedido.coleta_responsavel_phone || pedido.coleta_phone) ? String(pedido.coleta_responsavel_phone || pedido.coleta_phone) : undefined,
      managerName: pedido.coleta_responsavel || pedido.coleta_contato || undefined,
      managerPhone: (pedido.coleta_responsavel_phone || pedido.coleta_phone) ? String(pedido.coleta_responsavel_phone || pedido.coleta_phone) : undefined,
    });
  } else if (isExchange) {
    // Pedido com Troca:
    if (isTrocado) {
      // 3ª Etapa: Troca já feita! "por ultimo o local de coleta vira o local de entrega"
      places.push({
        ...baseShared,
        id: `pedido-${pedido.id}-retorno`,
        name: `2ª Entrega (Retorno à Coleta): ${coletaLocalName}`,
        address: coletaFullAddress,
        coordinates: pickupCoords,
        imageUrl: undefined,
        photos: undefined,
        category: 'Troca de Mercadoria',
        operationType: 'entrega',
        orderStage: 'retorno',
        assignedDriverId: deliveryMetadata.driverId,
        assignedDriverName: deliveryMetadata.driverName,
        assignedDriverPhone: deliveryMetadata.driverPhone,
        orderVisibility: deliveryMetadata.visibility || pickupMetadata.visibility,
        sellerName: deliveryMetadata.sellerName || pickupMetadata.sellerName,
        sellerPhone: deliveryMetadata.sellerPhone || pickupMetadata.sellerPhone,
        observations: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
        driverNotes: (pedido.coleta_obs ?? pedido.detalhes ?? '').trim() || undefined,
        responsibleName: pedido.coleta_responsavel || pedido.coleta_contato || undefined,
        responsiblePhone: (pedido.coleta_responsavel_phone || pedido.coleta_phone) ? String(pedido.coleta_responsavel_phone || pedido.coleta_phone) : undefined,
      });
    } else if (isColetado) {
      // 2ª Etapa: Coleta já foi feita! "depois e local de troca"
      places.push({
        ...baseShared,
        id: `pedido-${pedido.id}-troca`,
        name: entregaLocalName,
        address: entregaFullAddress,
        coordinates: deliveryCoords,
        imageUrl: undefined,
        photos: undefined,
        category: 'Troca de Mercadoria',
        operationType: 'troca',
        orderStage: 'troca',
        assignedDriverId: exchangeMetadata.driverId,
        assignedDriverName: exchangeMetadata.driverName,
        assignedDriverPhone: exchangeMetadata.driverPhone,
        orderVisibility: exchangeMetadata.visibility,
        sellerName: exchangeMetadata.sellerName,
        sellerPhone: exchangeMetadata.sellerPhone,
        observations: (pedido.troca_obs ?? pedido.detalhes ?? '').trim() || undefined,
        driverNotes: (pedido.troca_obs ?? pedido.detalhes ?? '').trim() || undefined,
        responsibleName: pedido.troca_responsavel || pedido.troca_contato || undefined,
        responsiblePhone: (pedido.troca_responsavel_phone || pedido.troca_phone) ? String(pedido.troca_responsavel_phone || pedido.troca_phone) : undefined,
        managerName: pedido.troca_responsavel || pedido.troca_contato || undefined,
        managerPhone: (pedido.troca_responsavel_phone || pedido.troca_phone) ? String(pedido.troca_responsavel_phone || pedido.troca_phone) : undefined,
      });
    }
  } else {
    // Pedido normal: "ao coletar aparece o local de entrega"
    if (isColetado) {
      places.push({
        ...baseShared,
        id: `pedido-${pedido.id}-entrega`,
        name: entregaLocalName,
        address: entregaFullAddress,
        coordinates: deliveryCoords,
        imageUrl: entregaPhotos[0] || undefined,
        photos: entregaPhotos.length > 0 ? entregaPhotos : undefined,
        category: 'Entrega Expressa',
        operationType: 'entrega',
        orderStage: 'entrega',
        assignedDriverId: deliveryMetadata.driverId,
        assignedDriverName: deliveryMetadata.driverName,
        assignedDriverPhone: deliveryMetadata.driverPhone,
        orderVisibility: deliveryMetadata.visibility,
        sellerName: deliveryMetadata.sellerName,
        sellerPhone: deliveryMetadata.sellerPhone,
        observations: (pedido.entrega_obs ?? pedido.detalhes ?? '').trim() || undefined,
        driverNotes: (pedido.entrega_obs ?? pedido.detalhes ?? '').trim() || undefined,
        responsibleName: pedido.entrega_responsavel || pedido.entrega_contato || undefined,
        responsiblePhone: (pedido.entrega_responsavel_phone || pedido.entrega_phone) ? String(pedido.entrega_responsavel_phone || pedido.entrega_phone) : undefined,
        managerName: pedido.entrega_responsavel || pedido.entrega_contato || undefined,
        managerPhone: (pedido.entrega_responsavel_phone || pedido.entrega_phone) ? String(pedido.entrega_responsavel_phone || pedido.entrega_phone) : undefined,
      });
    }
  }

  return places;
}

/**
 * Converte um marcador retornado por POST /tracking/order_markers em um Place no mapa.
 * Garante que:
 * 1. Marcador com tipo === 'coleta' é SEMPRE Coleta (coordenadas, nome do local e operação da coleta)
 * 2. Marcador com tipo === 'entrega' é SEMPRE Entrega ou Troca (coordenadas, nome do local e operação de entrega)
 * 3. Nome do Local fica SEMPRE em destaque no topo do marcador
 */
export function backendOrderMarkerToPlace(
  marker: BackendOrderMarker,
  dateBadge: OrderDateBadgeType = 'hoje',
  fullPedido?: BackendPedido
): Place {
  const lat = typeof marker.lat === 'string' ? parseFloat(marker.lat) : marker.lat;
  const lng = typeof marker.lng === 'string' ? parseFloat(marker.lng) : marker.lng;
  const validLat = isNaN(lat) ? -16.686891 : lat;
  const validLng = isNaN(lng) ? -49.264794 : lng;

  const etapaNormalized = (fullPedido?.etapa || marker.etapa || 'aprovado').toLowerCase().trim();
  const isExchange = marker.tipo === 'troca' || fullPedido?.tipo_encomenda === 'troca' || Boolean(fullPedido?.troca_lat);

  // IDENTIFICAÇÃO ESTRITA DA OPERAÇÃO:
  // Se o marcador veio como 'coleta', ele é ESTRITAMENTE 'coleta'!
  // Se o marcador veio como 'entrega', se o pedido for 'troca' é 'troca', senão 'entrega'!
  // Para trocas: 1º Coleta -> 2º Troca -> 3º Entrega (retorno à coleta) -> Concluído (some do mapa)
  const isColetaMarker = marker.tipo === 'coleta';
  let activeOp: OperationType = isColetaMarker 
    ? 'coleta' 
    : (isExchange || marker.tipo === 'troca' ? 'troca' : 'entrega');

  let activeStage: 'coleta' | 'troca' | 'entrega' | 'retorno' | 'concluido' = isColetaMarker
    ? 'coleta'
    : (isExchange ? 'troca' : 'entrega');

  if (etapaNormalized === 'entregue' || etapaNormalized === 'finalizado' || etapaNormalized === 'concluido' || etapaNormalized === 'cancelado') {
    activeStage = 'concluido';
  } else if (isExchange && (etapaNormalized === 'trocado' || etapaNormalized === 'retornando' || etapaNormalized === 'segunda_entrega' || etapaNormalized === 'retorno')) {
    activeStage = 'retorno';
    activeOp = 'entrega'; // 3ª Etapa: Retorno ao ponto de coleta é uma Entrega!
  }

  // Nome do Local SEMPRE em cima (em todas as makers)
  const clientName = fullPedido?.cliente || marker.cliente || `Pedido #${marker.pedido_id}`;
  
  const localName = marker.local_name || 
    (isColetaMarker
      ? (fullPedido?.coleta_local || fullPedido?.coleta_locais_name || 'Ponto de Coleta')
      : (fullPedido?.entrega_local || fullPedido?.entrega_locais_name || 'Ponto de Entrega'));

  const city = isColetaMarker
    ? (fullPedido?.coleta_cidade || fullPedido?.coleta_locais_cidade || fullPedido?.cidade)
    : (fullPedido?.entrega_cidade || fullPedido?.entrega_locais_cidade || fullPedido?.cidade);

  const fullAddress = city && !localName.toLowerCase().includes(city.toLowerCase())
    ? `${localName} - ${city}`
    : localName;

  // Extrai fotos do pedido: na entrega NÃO pode mostrar foto do local, apenas na coleta
  let photoUrl: string | undefined = undefined;
  let markerPhotos: string[] = [];
  if (fullPedido) {
    const rawPhotos = isColetaMarker
      ? extractPhotoUrls(fullPedido.coleta_foto, 'md').concat(extractPhotoUrls(fullPedido.mercadoria_foto, 'md'))
      : extractPhotoUrls(fullPedido.entrega_foto, 'md');
    markerPhotos = Array.from(new Set(rawPhotos));
    photoUrl = markerPhotos[0] || undefined;
  }

  const vType = fullPedido?.tipo_veiculo === 'carro' ? 'carro' : fullPedido?.tipo_veiculo === 'utilitario' ? 'utilitario' : 'moto';

  // Coordenadas dos pontos de coleta e entrega (para cálculo de rota e detalhes)
  const rawColetaLat = fullPedido?.coleta_locais_lat ?? fullPedido?.coleta_lat ?? (isColetaMarker ? validLat : undefined);
  const rawColetaLng = fullPedido?.coleta_locais_lng ?? fullPedido?.coleta_lng ?? (isColetaMarker ? validLng : undefined);
  const rawEntregaLat = fullPedido?.entrega_locais_lat ?? fullPedido?.entrega_lat ?? (!isColetaMarker ? validLat : undefined);
  const rawEntregaLng = fullPedido?.entrega_locais_lng ?? fullPedido?.entrega_lng ?? (!isColetaMarker ? validLng : undefined);

  const parsedColetaLat = typeof rawColetaLat === 'string' ? parseFloat(rawColetaLat) : Number(rawColetaLat);
  const parsedColetaLng = typeof rawColetaLng === 'string' ? parseFloat(rawColetaLng) : Number(rawColetaLng);
  const parsedEntregaLat = typeof rawEntregaLat === 'string' ? parseFloat(rawEntregaLat) : Number(rawEntregaLat);
  const parsedEntregaLng = typeof rawEntregaLng === 'string' ? parseFloat(rawEntregaLng) : Number(rawEntregaLng);

  const coletaLat = !isNaN(parsedColetaLat) ? parsedColetaLat : (isColetaMarker ? validLat : -16.686891);
  const coletaLng = !isNaN(parsedColetaLng) ? parsedColetaLng : (isColetaMarker ? validLng : -49.264794);
  const entregaLat = !isNaN(parsedEntregaLat) ? parsedEntregaLat : (!isColetaMarker ? validLat : coletaLat);
  const entregaLng = !isNaN(parsedEntregaLng) ? parsedEntregaLng : (!isColetaMarker ? validLng : coletaLng);

  const pickupName = fullPedido?.coleta_local || fullPedido?.coleta_locais_name || (isColetaMarker ? localName : 'Ponto de Coleta');
  const deliveryName = fullPedido?.entrega_local || fullPedido?.entrega_locais_name || (!isColetaMarker ? localName : 'Ponto de Entrega');

  // Se for o retorno da troca (3ª etapa), o ponto de destino é o retorno ao ponto de coleta
  const isRetornoStage = activeStage === 'retorno';
  const finalCoords = isRetornoStage ? { lat: coletaLat, lng: coletaLng } : { lat: validLat, lng: validLng };
  const finalName = isRetornoStage ? `2ª Entrega (Retorno à Coleta): ${pickupName}` : localName;
  const finalAddress = isRetornoStage 
    ? (fullPedido?.coleta_cidade ? `${pickupName} - ${fullPedido.coleta_cidade}` : pickupName)
    : fullAddress;
  const activePointKey: RoutePointKey = activeOp === 'coleta' ? 'pickup' : activeOp === 'troca' ? 'exchange' : 'delivery';
  const pointMetadata = fullPedido
    ? getRoutePointMetadata(fullPedido, activePointKey, true)
    : { visibility: undefined, driverId: undefined, driverName: undefined, driverPhone: undefined, sellerName: undefined, sellerPhone: undefined };
  const pickupMetadata = fullPedido ? getRoutePointMetadata(fullPedido, 'pickup') : undefined;
  const exchangeMetadata = fullPedido ? getRoutePointMetadata(fullPedido, 'exchange') : undefined;
  const deliveryMetadata = fullPedido ? getRoutePointMetadata(fullPedido, 'delivery') : undefined;
  const legacyDriver = extractDriverAssignmentFromPedido(
    fullPedido || { id: marker.pedido_id },
    isColetaMarker ? 'coleta' : activeOp === 'troca' ? 'troca' : 'entrega'
  );
  const activeNotes = isColetaMarker
    ? (fullPedido?.coleta_obs ?? fullPedido?.detalhes)
    : activeOp === 'troca'
      ? (fullPedido?.troca_obs ?? fullPedido?.detalhes)
      : (fullPedido?.entrega_obs ?? fullPedido?.detalhes);
  const activeResponsible = activeOp === 'coleta'
    ? (fullPedido?.coleta_responsavel || fullPedido?.coleta_contato)
    : activeOp === 'troca'
      ? (fullPedido?.troca_responsavel || fullPedido?.troca_contato)
      : (fullPedido?.entrega_responsavel || fullPedido?.entrega_contato);
  const activeResponsiblePhone = activeOp === 'coleta'
    ? (fullPedido?.coleta_responsavel_phone || fullPedido?.coleta_phone)
    : activeOp === 'troca'
      ? (fullPedido?.troca_responsavel_phone || fullPedido?.troca_phone)
      : (fullPedido?.entrega_responsavel_phone || fullPedido?.entrega_phone);

  return {
    id: `pedido-${marker.pedido_id}-${marker.tipo}`,
    ...pedidoPaymentFields(fullPedido),
    orderId: String(marker.pedido_id),
    pedido_id: marker.pedido_id,
    orderCode: `EZ-${marker.pedido_id}-GO`,
    name: finalName,
    address: finalAddress,
    coordinates: finalCoords,
    category: isExchange ? 'Troca de Mercadoria' : activeOp === 'coleta' ? 'Coleta Expressa' : 'Entrega Expressa',
    operationType: activeOp,
    orderStage: activeStage,
    orderDateBadge: dateBadge,
    scheduledDate: (fullPedido?.data ? String(fullPedido.data).slice(0, 10) : (marker as any).data ? String((marker as any).data).slice(0, 10) : undefined),
    data: (fullPedido?.data ? String(fullPedido.data).slice(0, 10) : (marker as any).data ? String((marker as any).data).slice(0, 10) : undefined),
    orderDate: (fullPedido?.data ? String(fullPedido.data).slice(0, 10) : (marker as any).data ? String((marker as any).data).slice(0, 10) : undefined),
    isExchangeOrder: isExchange,
    customerName: clientName,
    customerPhone: fullPedido?.phone ? String(fullPedido.phone) : undefined,
    originCity: fullPedido?.coleta_cidade || fullPedido?.cidade || 'Goiânia - GO',
    destinationCity: fullPedido?.entrega_cidade || fullPedido?.cidade || 'Goiânia - GO',
    vehicleType: vType,
    packageType: 'caixa',
    openNow: true,
    imageUrl: photoUrl,
    photos: markerPhotos.length > 0 ? markerPhotos : undefined,
    assignedDriverId: pointMetadata.driverId,
    assignedDriverName: pointMetadata.driverName,
    assignedDriverPhone: pointMetadata.driverPhone,
    orderVisibility: pointMetadata.visibility,
    sellerName: pointMetadata.sellerName || activeResponsible || undefined,
    sellerPhone: pointMetadata.sellerPhone || (activeResponsiblePhone ? String(activeResponsiblePhone) : undefined),
    responsibleName: activeResponsible || undefined,
    responsiblePhone: activeResponsiblePhone ? String(activeResponsiblePhone) : undefined,
    managerName: activeResponsible || undefined,
    managerPhone: activeResponsiblePhone ? String(activeResponsiblePhone) : undefined,
    pickupVisibility: pickupMetadata?.visibility,
    pickupAssignedDriverId: pickupMetadata?.driverId,
    pickupAssignedDriverName: pickupMetadata?.driverName,
    pickupAssignedDriverPhone: pickupMetadata?.driverPhone,
    pickupSellerName: pickupMetadata?.sellerName,
    pickupSellerPhone: pickupMetadata?.sellerPhone,
    exchangeVisibility: exchangeMetadata?.visibility,
    exchangeAssignedDriverId: exchangeMetadata?.driverId,
    exchangeAssignedDriverName: exchangeMetadata?.driverName,
    exchangeAssignedDriverPhone: exchangeMetadata?.driverPhone,
    exchangeSellerName: exchangeMetadata?.sellerName,
    exchangeSellerPhone: exchangeMetadata?.sellerPhone,
    deliveryVisibility: deliveryMetadata?.visibility,
    deliveryAssignedDriverId: deliveryMetadata?.driverId,
    deliveryAssignedDriverName: deliveryMetadata?.driverName,
    deliveryAssignedDriverPhone: deliveryMetadata?.driverPhone,
    deliverySellerName: deliveryMetadata?.sellerName,
    deliverySellerPhone: deliveryMetadata?.sellerPhone,
    observations: (activeNotes ?? (marker as any).obs ?? (marker as any).observacao ?? (marker as any).detalhes ?? '').trim() || undefined,
    driverNotes: (activeNotes ?? (marker as any).obs ?? (marker as any).detalhes ?? '').trim() || undefined,
    pickupName,
    pickupAddress: fullPedido?.coleta_cidade ? `${pickupName} - ${fullPedido.coleta_cidade}` : pickupName,
    pickupCoordinates: { lat: coletaLat, lng: coletaLng },
    pickupContact: fullPedido?.coleta_contato,
    pickupPhone: fullPedido?.coleta_phone,
    pickupNotes: fullPedido?.coleta_obs ?? fullPedido?.detalhes,
    exchangeName: fullPedido?.troca_nome,
    exchangeAddress: fullPedido?.troca_endereco,
    exchangeCoordinates: fullPedido?.troca_lat && fullPedido?.troca_lng
      ? { lat: Number(fullPedido.troca_lat), lng: Number(fullPedido.troca_lng) }
      : undefined,
    exchangeContact: fullPedido?.troca_contato,
    exchangePhone: fullPedido?.troca_phone,
    exchangeNotes: fullPedido?.troca_obs ?? fullPedido?.detalhes,
    deliveryName,
    deliveryAddress: fullPedido?.entrega_cidade ? `${deliveryName} - ${fullPedido.entrega_cidade}` : deliveryName,
    deliveryCoordinates: { lat: entregaLat, lng: entregaLng },
    deliveryContact: fullPedido?.entrega_contato,
    deliveryPhone: fullPedido?.entrega_phone,
    deliveryNotes: fullPedido?.entrega_obs ?? fullPedido?.detalhes
  };
}

/**
 * Converte um User retornado por POST /users/list ou POST /pedidos/list_users em Customer
 */
export function backendUserToCustomer(user: BackendUser): Customer {
  const rawCoordinates = user.coordinates as { lat?: unknown; lng?: unknown } | undefined;
  const lat = Number(rawCoordinates?.lat);
  const lng = Number(rawCoordinates?.lng);
  const coordinates = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
    ? { lat, lng }
    : undefined;
  const additionalAddresses = Array.isArray(user.additionalAddresses)
    ? user.additionalAddresses
    : Array.isArray(user.additional_addresses)
      ? user.additional_addresses
      : [];
  const city = resolveCustomerCity({
    city: user.city,
    cidade: user.cidade,
    address: user.address || user.endereco
  });
  return {
    id: String(user.id),
    fullName: user.full_name || user.name_completo || user.name,
    contactName: user.name,
    phone: user.phone,
    cpf: user.cpf || (user as any).cnpj || '',
    cnpj: (user as any).cnpj,
    personType: (user as any).person_type,
    city,
    cidade: city,
    address: user.address || user.endereco || '',
    coordinates,
    additionalAddresses,
    email: user.email,
    notes: user.notes || (user.cliente_especial ? 'Cliente Especial' : undefined),
    companyId: user.companyId,
    orderCount: Number(user.orderCount ?? user.order_count ?? user.pedidos_count ?? 0),
    createdAt: user.created_at ? new Date(user.created_at).getTime() : Date.now()
  };
}

/**
 * Converte um Motorista retornado por POST /motoristas/list com localização em tempo real
 */
export function backendMotoristaToDriver(motorista: BackendMotorista, liveLocation?: BackendLiveLocation): Driver {
  const vType = motorista.tipo_veiculo === 'carro' ? 'carro' : motorista.tipo_veiculo === 'utilitario' ? 'utilitario' : 'moto';
  
  return {
    id: String(motorista.id),
    name: motorista.nome,
    phone: motorista.telefone,
    vehicleType: vType,
    vehicleModel: motorista.modelo_veiculo || (vType === 'moto' ? 'Honda CG 160 Cargo' : vType === 'carro' ? 'Fiat Strada' : 'Renault Master Utilitário'),
    vehiclePlate: motorista.placa || 'BRA-2026',
    avatarUrl: (motorista.foto ? formatPhotoUrl(motorista.foto, 'thumb') : null) || motorista.foto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
    color: '#0B5187',
    rating: 4.9,
    status: motorista.status === 'ativo' ? (liveLocation?.speed && liveLocation.speed > 5 ? 'em_rota' : 'disponivel') : 'em_pausa',
    deliveriesCompleted: 120,
    coordinates: liveLocation ? { lat: liveLocation.lat, lng: liveLocation.lng } : { lat: -16.686891, lng: -49.264794 },
    speedKmH: liveLocation?.speed ?? undefined,
    heading: liveLocation?.heading ?? undefined,
    lastSeenTimestamp: liveLocation?.updated_at ? new Date(liveLocation.updated_at).getTime() : Date.now(),
    signalStrength: liveLocation ? 'excelente' : 'bom'
  };
}
