import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { initializeApp as initFirebaseServerApp, getApps as getServerApps, getApp as getServerApp } from 'firebase/app';
import { getFirestore as getServerFirestore, doc as serverDoc, setDoc as serverSetDoc } from 'firebase/firestore';
import { sanitizeForFirestore } from './src/services/firestoreUtils';

const serverFirebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'zapencomendas-507212',
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBRAUyrUVl7bPXGeYGf6bEOtrUDtLP3Ir8',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'zapencomendas-507212.firebaseapp.com',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'zapencomendas-507212.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '661076087159',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:661076087159:web:44d7c03ae20aea5ed75172'
};

const serverFirebaseApp = getServerApps().length > 0 ? getServerApp() : initFirebaseServerApp(serverFirebaseConfig);
const serverFirestore = getServerFirestore(serverFirebaseApp, '(default)');
console.log('[Firebase Server] Conectado com sucesso ao Firestore (default) para o projeto:', serverFirebaseConfig.projectId);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const viteWss = new WebSocketServer({ 
  noServer: true,
  handleProtocols: (protocols) => {
    if (protocols && typeof protocols.has === 'function' && protocols.has('vite-hmr')) {
      return 'vite-hmr';
    }
    const arr = Array.from(protocols || []);
    return arr[0] || 'vite-hmr';
  }
});

// Roteador de upgrades WebSocket
server.on('upgrade', (request, socket, head) => {
  const url = request.url || '/';
  const pathname = url.split('?')[0];

  if (pathname === '/ws/tracking') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    // Gerencia requisições do Vite HMR ou outros clientes graciosamente para evitar 'WebSocket closed without opened'
    viteWss.handleUpgrade(request, socket, head, (ws) => {
      viteWss.emit('connection', ws, request);
    });
  }
});

viteWss.on('connection', (ws) => {
  try {
    ws.send(JSON.stringify({ type: 'connected' }));
  } catch (e) {}

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {}
  });

  ws.on('error', () => {
    // Ignora silenciosamente
  });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const TARGET_API = (process.env.DOTAS_API_URL || 'https://dotas.online').replace(/\/+$/, '');
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod') || (fs.existsSync(path.resolve(__dirname, 'dist', 'index.html')) && process.env.npm_lifecycle_event !== 'dev');

// Configura cabeçalhos de CORS e permite inclusão em iframes em qualquer site
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Content-Security-Policy', "frame-ancestors *;");
  res.setHeader('Permissions-Policy', 'geolocation=*, accelerometer=*, gyroscope=*');
  res.setHeader('Feature-Policy', 'geolocation *; accelerometer *; gyroscope *');
  res.removeHeader('X-Frame-Options');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Suporte a parsing raw body para repassar bodies em POST / PUT com fidelidade total
app.use(express.raw({ type: '*/*', limit: '50mb' }));

// Diretório local de uploads e salvamento de fotos
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Salva imagens em base64 diretamente no disco local (com suporte a variantes e extensões corretas)
function saveBase64Image(dataUrl: string, subfolder: string = 'users'): string | null {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    if (!dataUrl.startsWith('data:image/')) return null;
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    const targetDir = path.resolve(UPLOADS_DIR, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${subfolder}/${filename}`;
  } catch (err) {
    console.error('Erro ao salvar imagem base64 no disco:', err);
    return null;
  }
}

// Encaminha upload de imagem (como foto de perfil) para o servidor PHP de imagens
const PHP_IMAGE_SERVER_URL = process.env.IMAGE_SERVER_URL || 'http://localhost/imagens/images.php';
const PHP_IMAGE_SERVER_PASSWORD = process.env.IMAGE_SERVER_PASSWORD || '821332';

async function uploadToPhpServer(
  dataUrl: string, 
  tipo: string = 'perfil',
  customUrl?: string,
  customPass?: string
): Promise<string | null> {
  try {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
    const targetUrl = (customUrl && customUrl.trim()) ? customUrl.trim() : PHP_IMAGE_SERVER_URL;
    const targetPass = (customPass && customPass.trim()) ? customPass.trim() : PHP_IMAGE_SERVER_PASSWORD;
    const sep = targetUrl.includes('?') ? '&' : '?';
    const url = `${targetUrl}${sep}action=upload&password=${encodeURIComponent(targetPass)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Password': targetPass
      },
      body: JSON.stringify({
        image: dataUrl,
        tipo: tipo,
        password: targetPass
      })
    });
    if (!response.ok) {
      console.warn(`[server.ts] PHP upload retornou status ${response.status}`);
      return null;
    }
    const result: any = await response.json();
    if (result && result.success && (result.url || result.filename)) {
      const filename = result.filename || (result.url ? result.url.match(/[?&]f=([^&#]+)/)?.[1] : '') || '';
      const baseClean = targetUrl.split('?')[0];
      return filename ? `${baseClean}?f=${encodeURIComponent(filename)}` : result.url;
    }
  } catch (err) {
    console.warn('[server.ts] Erro ao comunicar com servidor PHP de fotos:', err);
  }
  return null;
}

// Servir arquivos de uploads locais se existirem fisicamente, permitindo fallback para proxy upstream
app.use(['/uploads', '/api/uploads'], (req: Request, res: Response, next: NextFunction) => {
  let relativePath = req.path;
  if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
  const localFilePath = path.join(UPLOADS_DIR, relativePath);
  
  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
    return res.sendFile(localFilePath);
  }
  // Se requisitou variante (ex: photo_thumb.jpg ou photo_md.jpg) e o arquivo base (photo.jpg) existe
  const withoutVariant = localFilePath.replace(/_(icon|thumb|md|lg)\.(jpe?g|png|webp)$/i, '.$2');
  if (fs.existsSync(withoutVariant) && fs.statSync(withoutVariant).isFile()) {
    return res.sendFile(withoutVariant);
  }
  // Se requisitou sem extensão e com .jpg existe
  const withJpg = `${localFilePath}.jpg`;
  if (fs.existsSync(withJpg) && fs.statSync(withJpg).isFile()) {
    return res.sendFile(withJpg);
  }
  next();
});

// Rotas da API oficial do EncomendasZap / Dotas.online repassadas de forma transparente
// NOTA: '/users', '/pedidos' e '/locais' foram removidos do proxy conforme migração completa para o Firebase
const PROXY_PREFIXES = [
  '/tracking',
  '/motoristas',
  '/cidades',
  '/login',
  '/tabela-precos',
  '/uploads'
];

async function handleProxy(req: Request, res: Response) {
  let subPath = req.originalUrl;
  if (subPath.startsWith('/api/') && !subPath.startsWith('/api/uploads')) {
    subPath = subPath.replace(/^\/api/, '');
  }

  const targetUrl = `${TARGET_API}${subPath}`;

  const forwardHeaders: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.headers)) {
    const lk = key.toLowerCase();
    if (['host', 'connection', 'content-length'].includes(lk)) continue;
    if (val) {
      forwardHeaders[lk] = Array.isArray(val) ? val.join(', ') : val;
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Buffer.isBuffer(req.body) && req.body.length > 0)
        ? new Uint8Array(req.body)
        : undefined
    });

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((val, key) => {
      const lk = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(lk)) {
        res.setHeader(key, val);
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Security-Policy', "frame-ancestors *;");
    res.removeHeader('X-Frame-Options');

    const arrayBuffer = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error(`[Proxy Error] ${req.method} ${targetUrl}:`, err.message);
    res.status(502).json({
      success: false,
      message: `Erro ao conectar com o servidor central (${err.message}).`
    });
  }
}

// =========================================================================
// RASTREAMENTO REAL-TIME DE MOTORISTAS ATIVOS & REGRA DE 30 MINUTOS
// =========================================================================
interface LiveDriverData {
  id: string;
  name: string;
  nickname?: string;
  phone?: string;
  avatarUrl?: string;
  vehicleType: 'moto' | 'carro' | 'utilitario';
  vehicleModel?: string;
  vehiclePlate?: string;
  color: string;
  coordinates: {
    lat: number;
    lng: number;
    heading?: number | null;
    speed?: number | null;
    timestamp?: number;
  };
  heading?: number;
  speedKmH?: number;
  batteryLevel?: number;
  status: 'em_rota' | 'disponivel' | 'em_pausa' | 'offline';
  isOnline: boolean;
  lastSeenTimestamp: number;
  lastUpdatedStr: string;
}

// =========================================================================
// REALTIME ASSIGNMENTS (DIRECIONAMENTO DE ENCOMENDAS EM TEMPO REAL)
// =========================================================================
export interface OrderAssignmentData {
  orderId: string;
  driverId: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  assignedAt: number;
}

const ASSIGNMENTS_FILE = path.resolve(__dirname, 'assignments-realtime.json');
const activeAssignments = new Map<string, OrderAssignmentData>();

// Carrega atribuições salvas em disco
try {
  if (fs.existsSync(ASSIGNMENTS_FILE)) {
    const raw = fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([k, v]) => {
        if (v && typeof v === 'object') {
          activeAssignments.set(k, v as OrderAssignmentData);
        }
      });
      console.log(`[Realtime Assignments] Carregadas ${activeAssignments.size} atribuições persistidas.`);
    }
  }
} catch (e) {
  console.warn('[Realtime Assignments] Erro ao carregar assignments-realtime.json:', e);
}

function saveAssignmentsToDisk() {
  try {
    const obj = Object.fromEntries(activeAssignments);
    fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Realtime Assignments] Erro ao salvar assignments-realtime.json:', e);
  }
}

const activeDrivers = new Map<string, LiveDriverData>();

// Regra estrita solicitada:
// "se tiver mais de 30 minutos offline, eles têm que sumir do mapa lá dos outros."
const MAX_OFFLINE_MS = 30 * 60 * 1000; // 30 minutos

function broadcastTracking(data: any, excludeWs?: WebSocket) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Limpeza automática periódica dos motoristas inativos/offline há mais de 30 minutos
setInterval(() => {
  const now = Date.now();
  activeDrivers.forEach((driver, id) => {
    const elapsed = now - (driver.lastSeenTimestamp || 0);
    if (elapsed > MAX_OFFLINE_MS || (!driver.isOnline && elapsed > MAX_OFFLINE_MS)) {
      console.log(`[Tracking] Motorista ${driver.name} (${id}) sem atualização há >30 min (${Math.round(elapsed / 60000)}m) - removido do mapa.`);
      activeDrivers.delete(id);
      broadcastTracking({ type: 'driver:remove', driverId: id });
    }
  });
}, 30 * 1000);

wss.on('connection', (ws: WebSocket) => {
  const now = Date.now();
  // Envia a lista atual de motoristas ativos (que atualizaram nos últimos 30 min)
  const validDrivers = Array.from(activeDrivers.values()).filter(
    (d) => (now - d.lastSeenTimestamp) <= MAX_OFFLINE_MS && d.isOnline !== false
  );
  ws.send(JSON.stringify({ type: 'drivers:init', drivers: validDrivers }));

  // Envia todas as atribuições em tempo real para sincronização instantânea
  ws.send(JSON.stringify({ 
    type: 'assignments:init', 
    assignments: Object.fromEntries(activeAssignments) 
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'driver:update_location' && msg.driver) {
        const d = msg.driver;
        const now = Date.now();
        const dDate = new Date(now);
        const lastUpdatedStr = dDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const driverData: LiveDriverData = {
          ...d,
          lastSeenTimestamp: now,
          lastUpdatedStr,
          status: d.isOnline === false ? 'offline' : (d.status || 'em_rota')
        };

        if (d.isOnline === false) {
          activeDrivers.set(d.id, driverData);
          broadcastTracking({ type: 'driver:offline', driver: driverData });
        } else {
          activeDrivers.set(d.id, driverData);
          broadcastTracking({ type: 'driver:update', driver: driverData });
        }
      } else if (msg.type === 'assignment:set' && msg.orderId && msg.assignment) {
        const orderIdStr = String(msg.orderId);
        const assignmentData: OrderAssignmentData = {
          ...msg.assignment,
          orderId: orderIdStr,
          assignedAt: Date.now()
        };
        activeAssignments.set(orderIdStr, assignmentData);
        saveAssignmentsToDisk();
        broadcastTracking({
          type: 'assignment:update',
          orderId: orderIdStr,
          assignment: assignmentData
        });
      } else if (msg.type === 'assignment:clear' && msg.orderId) {
        const orderIdStr = String(msg.orderId);
        activeAssignments.delete(orderIdStr);
        saveAssignmentsToDisk();
        broadcastTracking({
          type: 'assignment:remove',
          orderId: orderIdStr
        });
      }
    } catch (e) {
      // Ignora payload mal formatado
    }
  });
});

// Identificador de versão e build da aplicação em execução
const APP_BUILD_ID = process.env.APP_BUILD_ID || `build-${Date.now()}`;

// Endpoint para clientes e PWA consultarem se o servidor possui uma nova versão
app.get('/api/app-version', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.json({
    buildId: APP_BUILD_ID,
    timestamp: new Date().toISOString(),
    isProd
  });
});

// Endpoint para obter a lista de motoristas ativos em tempo real (restrito a quem atualizou nos últimos 30 min)
app.get('/api/tracking/live-drivers', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/json');
  const now = Date.now();
  const valid = Array.from(activeDrivers.values()).filter(
    (d) => (now - d.lastSeenTimestamp) <= MAX_OFFLINE_MS && d.isOnline !== false
  );
  res.json({ success: true, data: valid });
});

// Endpoint para o motorista enviar telemetria em tempo real (fallback HTTP)
app.post('/api/tracking/update-driver', (req: Request, res: Response) => {
  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) {
      body = JSON.parse(body.toString('utf-8'));
    }
    if (body && body.id) {
      const now = Date.now();
      const dDate = new Date(now);
      const lastUpdatedStr = dDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const driverData: LiveDriverData = {
        ...body,
        lastSeenTimestamp: now,
        lastUpdatedStr,
        status: body.isOnline === false ? 'offline' : (body.status || 'em_rota')
      };

      if (body.isOnline === false) {
        activeDrivers.set(body.id, driverData);
        broadcastTracking({ type: 'driver:offline', driver: driverData });
      } else {
        activeDrivers.set(body.id, driverData);
        broadcastTracking({ type: 'driver:update', driver: driverData });
      }

      res.json({ success: true, data: driverData });
      return;
    }
    res.status(400).json({ success: false, message: 'Dados inválidos' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// ENDPOINTS REALTIME PARA DIRECIONAMENTO DE PEDIDOS AOS MOTORISTAS
// =========================================================================
app.get('/api/realtime/assignments', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/json');
  res.json({ success: true, data: Object.fromEntries(activeAssignments) });
});

app.post('/api/realtime/assign-driver', (req: Request, res: Response) => {
  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) {
      body = JSON.parse(body.toString('utf-8'));
    }
    const { orderId, driverId, driverName, driverPhone, vehicleType } = body || {};
    if (!orderId || !driverId) {
      res.status(400).json({ success: false, message: 'orderId e driverId são obrigatórios' });
      return;
    }

    const orderIdStr = String(orderId);
    const assignment: OrderAssignmentData = {
      orderId: orderIdStr,
      driverId: String(driverId),
      driverName: driverName || undefined,
      driverPhone: driverPhone || undefined,
      vehicleType: vehicleType || undefined,
      assignedAt: Date.now()
    };

    activeAssignments.set(orderIdStr, assignment);
    saveAssignmentsToDisk();

    broadcastTracking({
      type: 'assignment:update',
      orderId: orderIdStr,
      assignment
    });

    console.log(`[Realtime Assignment] Encomenda #${orderIdStr} direcionada para ${driverName || 'Motorista'} (ID: ${driverId})`);
    res.json({ success: true, data: assignment });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/realtime/unassign-driver', (req: Request, res: Response) => {
  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) {
      body = JSON.parse(body.toString('utf-8'));
    }
    const { orderId } = body || {};
    if (!orderId) {
      res.status(400).json({ success: false, message: 'orderId é obrigatório' });
      return;
    }

    const orderIdStr = String(orderId);
    activeAssignments.delete(orderIdStr);
    saveAssignmentsToDisk();

    broadcastTracking({
      type: 'assignment:remove',
      orderId: orderIdStr
    });

    console.log(`[Realtime Assignment] Encomenda #${orderIdStr} desvinculada de motorista.`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// GOOGLE MAPS API: BUSCA DE LOCAIS & GEOCODIFICAÇÃO (CHAVE OFICIAL)
// =========================================================================
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyATwFNGYw-Y0TGH3SrjwQelQD4EorVjlg4';

const GOOGLE_TYPE_MAP: Record<string, string> = {
  shopping_mall: 'Shopping Center',
  supermarket: 'Supermercado',
  grocery_or_supermarket: 'Supermercado',
  store: 'Loja Comercial',
  restaurant: 'Restaurante',
  food: 'Alimentação',
  bakery: 'Panificadora',
  pharmacy: 'Farmácia',
  hospital: 'Hospital',
  health: 'Saúde / Clínica',
  doctor: 'Consultório Médico',
  bank: 'Agência Bancária',
  finance: 'Financeiro',
  gas_station: 'Posto de Combustível',
  lodging: 'Hotel / Pousada',
  gym: 'Academia',
  school: 'Escola / Colégio',
  university: 'Universidade',
  church: 'Igreja / Templo',
  place_of_worship: 'Igreja',
  bus_station: 'Terminal Rodoviário',
  transit_station: 'Terminal de Ônibus',
  airport: 'Aeroporto',
  bar: 'Bar / Conveniência',
  cafe: 'Café / Lanchonete',
  car_repair: 'Oficina Mecânica',
  car_dealer: 'Concessionária',
  parking: 'Estacionamento',
  post_office: 'Correios',
  police: 'Polícia / Segurança',
  local_government_office: 'Órgão Público',
  street_address: 'Endereço',
  premise: 'Imóvel / Prédio',
  subpremise: 'Edifício / Apartamento',
  route: 'Rua / Avenida',
  intersection: 'Cruzamento',
  neighborhood: 'Bairro',
  sublocality: 'Bairro / Setor',
  locality: 'Cidade',
  point_of_interest: 'Ponto Comercial',
  establishment: 'Ponto de Interesse'
};

// =========================================================================
// SISTEMA DE CACHE DE BUSCA E GEOCODING (ECONOMIA DE CHAMADAS DE API GOOGLE)
// =========================================================================
interface GoogleCacheItem<T> {
  timestamp: number;
  data: T;
}

const GOOGLE_API_CACHE_FILE = path.resolve(__dirname, 'google-api-cache.json');
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias de validade para locais e endereços

const googlePlacesCache = new Map<string, GoogleCacheItem<any>>();
const googleReverseCache = new Map<string, GoogleCacheItem<any>>();
const googleLinkCache = new Map<string, GoogleCacheItem<any>>();
const googleDirectionsCache = new Map<string, GoogleCacheItem<any>>();

// Carrega cache existente do disco se houver
try {
  if (fs.existsSync(GOOGLE_API_CACHE_FILE)) {
    const raw = fs.readFileSync(GOOGLE_API_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.places && typeof parsed.places === 'object') {
      Object.entries(parsed.places).forEach(([k, v]: [string, any]) => googlePlacesCache.set(k, v));
    }
    if (parsed.reverse && typeof parsed.reverse === 'object') {
      Object.entries(parsed.reverse).forEach(([k, v]: [string, any]) => googleReverseCache.set(k, v));
    }
    if (parsed.links && typeof parsed.links === 'object') {
      Object.entries(parsed.links).forEach(([k, v]: [string, any]) => googleLinkCache.set(k, v));
    }
    if (parsed.directions && typeof parsed.directions === 'object') {
      Object.entries(parsed.directions).forEach(([k, v]: [string, any]) => googleDirectionsCache.set(k, v));
    }
    console.log(`[Google API Cache] Carregados ${googlePlacesCache.size} locais, ${googleReverseCache.size} reversos, ${googleLinkCache.size} links e ${googleDirectionsCache.size} rotas do cache local.`);
  }
} catch (e) {
  console.warn('[Google API Cache] Não foi possível ler google-api-cache.json:', e);
}

// Grava cache em disco com debounce de 2 segundos para não sobrecarregar I/O
let saveCacheTimeout: NodeJS.Timeout | null = null;
function persistGoogleCache() {
  if (saveCacheTimeout) return;
  saveCacheTimeout = setTimeout(() => {
    saveCacheTimeout = null;
    try {
      const obj = {
        places: Object.fromEntries(googlePlacesCache),
        reverse: Object.fromEntries(googleReverseCache),
        links: Object.fromEntries(googleLinkCache),
        directions: Object.fromEntries(googleDirectionsCache)
      };
      fs.writeFileSync(GOOGLE_API_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[Google API Cache] Erro ao gravar google-api-cache.json:', err);
    }
  }, 2000);
}

function normalizeCacheKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =========================================================================
// DATASTORE DE LOCAIS DO FIREBASE (3636 locais importados + locais buscados)
// =========================================================================
const LOCAIS_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'importedLocais.json');
let localLocaisCache: any[] = [];

function loadLocalLocais() {
  try {
    if (fs.existsSync(LOCAIS_FILE_PATH)) {
      const raw = fs.readFileSync(LOCAIS_FILE_PATH, 'utf-8');
      localLocaisCache = JSON.parse(raw);
      console.log(`[Firebase Locais Server] Carregados ${localLocaisCache.length} locais importados.`);
    }
  } catch (err: any) {
    console.warn('[Firebase Locais Server] Erro ao carregar arquivo de locais:', err.message);
  }
}
loadLocalLocais();

let saveLocaisTimeout: NodeJS.Timeout | null = null;
function saveLocalLocais() {
  if (saveLocaisTimeout) return;
  saveLocaisTimeout = setTimeout(() => {
    saveLocaisTimeout = null;
    try {
      fs.writeFileSync(LOCAIS_FILE_PATH, JSON.stringify(localLocaisCache, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[Firebase Locais Server] Erro ao persistir locais:', err.message);
    }
  }, 3000);
}

async function syncLocalToFirebase(local: any) {
  if (!local || !local.id) return;
  try {
    const docId = String(local.id);
    const clean = sanitizeForFirestore(local);
    await serverSetDoc(serverDoc(serverFirestore, 'places', docId), clean, { merge: true });
    console.log(`[Firestore Server] Local #${docId} (${clean.name || ''}) sincronizado no Firestore (default).`);
  } catch (err: any) {
    console.warn(`[Firestore Server] Erro ao sincronizar local #${local.id}:`, err.message);
  }
}

function searchLocaisInMemory(queryStr: string, limit: number = 8): any[] {
  const q = queryStr.toLowerCase().trim();
  if (!q || q.length < 2) return [];

  const words = q.split(/\s+/).filter(Boolean);
  const matches: Array<{ local: any; score: number }> = [];

  for (const p of localLocaisCache) {
    const pLat = Number(p.lat);
    const pLng = Number(p.lng);
    if (isNaN(pLat) || isNaN(pLng) || (pLat === 0 && pLng === 0)) continue;

    const name = (p.name || '').toLowerCase();
    const addr = (p.endereco || p.rua || '').toLowerCase();
    const setor = (p.setor || '').toLowerCase();
    const cidade = (p.cidade || '').toLowerCase();
    const fullText = `${name} ${addr} ${setor} ${cidade}`;

    let score = 0;
    if (name === q) {
      score = 100;
    } else if (name.startsWith(q)) {
      score = 80;
    } else if (name.includes(q)) {
      score = 60;
    } else {
      const allWordsMatch = words.every(w => fullText.includes(w));
      if (allWordsMatch) {
        score = 40;
      } else {
        const matchCount = words.filter(w => fullText.includes(w)).length;
        if (matchCount > 0 && matchCount >= words.length / 2) {
          score = 20 * matchCount;
        }
      }
    }

    if (score > 0) {
      matches.push({ local: p, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit).map(({ local }) => {
    const fullAddr = local.endereco || [local.rua, local.numero, local.setor, local.cidade].filter(Boolean).join(', ');
    return {
      id: `fb-${local.id}`,
      name: local.name,
      category: local.setor ? `${local.setor} (Firebase)` : 'Firebase / Local Cadastrado',
      address: fullAddr || local.name,
      coordinates: {
        lat: Number(local.lat),
        lng: Number(local.lng)
      },
      description: fullAddr
    };
  });
}

app.get('/api/google/places', async (req: Request, res: Response) => {
  const query = String(req.query.q || req.query.query || req.query.input || '').trim();
  if (!query) {
    res.json({ success: true, results: [] });
    return;
  }

  // 0. Verifica se o resultado já está em cache de requisição
  const cacheKey = normalizeCacheKey(query);
  const cached = googlePlacesCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Google API Cache HIT] Places: "${query}" (economizou chamada de API do Google)`);
    res.setHeader('X-Cache', 'HIT');
    res.json({ success: true, results: cached.data, fromCache: true });
    return;
  }

  // 0.1 BUSCA NO FIREBASE PRIMEIRO (ECONOMIZA CHAMADAS DE API DO GOOGLE MAPS)
  const inMemoryMatches = searchLocaisInMemory(query, 8);
  if (inMemoryMatches.length > 0) {
    console.log(`[Firebase Places HIT] Places: "${query}" (${inMemoryMatches.length} itens encontrados no Firebase datastore)`);
    googlePlacesCache.set(cacheKey, { timestamp: Date.now(), data: inMemoryMatches });
    persistGoogleCache();
    res.setHeader('X-Cache', 'HIT');
    res.json({ success: true, results: inMemoryMatches, fromFirebase: true });
    return;
  }

  try {
    // 1. Busca no Google Maps Places TextSearch (estabelecimentos, comércios, pontos turísticos e vias)
    const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&region=br`;
    const placesResp = await fetch(placesUrl);
    const placesData: any = await placesResp.json();

    let items: any[] = [];
    if (placesData.results && Array.isArray(placesData.results) && placesData.results.length > 0) {
      items = placesData.results.slice(0, 10).map((r: any) => {
        const rawType = r.types?.[0] || 'establishment';
        const categoryLabel = GOOGLE_TYPE_MAP[rawType] || rawType.replace(/_/g, ' ');
        return {
          id: `gplace-${r.place_id}`,
          name: r.name || r.formatted_address?.split(',')[0],
          category: categoryLabel,
          address: r.formatted_address,
          coordinates: {
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng
          },
          rating: r.rating,
          reviewsCount: r.user_ratings_total,
          openNow: r.opening_hours?.open_now,
          description: r.formatted_address
        };
      });
    }

    // 2. Se houver poucos resultados de estabelecimentos, complementa com o Google Geocoding API (números prediais e ruas)
    if (items.length < 4) {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&region=br`;
      const geoResp = await fetch(geoUrl);
      const geoData: any = await geoResp.json();
      if (geoData.results && Array.isArray(geoData.results)) {
        geoData.results.slice(0, 6).forEach((g: any) => {
          const exists = items.some(
            it => Math.abs(it.coordinates.lat - g.geometry.location.lat) < 0.0002 &&
                  Math.abs(it.coordinates.lng - g.geometry.location.lng) < 0.0002
          );
          if (!exists) {
            const rawType = g.types?.[0] || 'street_address';
            items.push({
              id: `gcode-${g.place_id}`,
              name: g.formatted_address.split(',')[0],
              category: GOOGLE_TYPE_MAP[rawType] || 'Endereço',
              address: g.formatted_address,
              coordinates: {
                lat: g.geometry.location.lat,
                lng: g.geometry.location.lng
              },
              description: g.formatted_address
            });
          }
        });
      }
    }

    // Salva em cache para economizar requisições futuras
    if (items.length > 0) {
      googlePlacesCache.set(cacheKey, { timestamp: Date.now(), data: items });
      persistGoogleCache();
      console.log(`[Google API Cache STORED] Places: "${query}" (${items.length} itens salvos no cache)`);

      // SALVA NO DATASTORE DO FIREBASE PARA ECONOMIZAR TODAS AS PRÓXIMAS BUSCAS
      for (const item of items) {
        const alreadyInLocal = localLocaisCache.some(p => p.name.toLowerCase() === item.name.toLowerCase());
        if (!alreadyInLocal) {
          const newLocal = {
            id: `gloc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: item.name,
            endereco: item.address,
            cidade: 'Goiânia',
            lat: item.coordinates.lat,
            lng: item.coordinates.lng,
            created_at: new Date().toISOString()
          };
          localLocaisCache.push(newLocal);
          syncLocalToFirebase(newLocal);
        }
      }
      saveLocalLocais();
    }

    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, results: items });
  } catch (err: any) {
    console.warn('[Google Maps API] Falha na busca de locais:', err.message);
    res.status(500).json({ success: false, message: err.message, results: [] });
  }
});

app.get('/api/google/reverse', async (req: Request, res: Response) => {
  const lat = parseFloat(String(req.query.lat));
  const lng = parseFloat(String(req.query.lng));
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ success: false, message: 'Latitude e Longitude inválidas' });
    return;
  }

  // Verifica cache de reverse geocoding
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = googleReverseCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Google API Cache HIT] Reverse: ${cacheKey} (economizou chamada de API do Google)`);
    res.setHeader('X-Cache', 'HIT');
    res.json({ success: true, data: cached.data, fromCache: true });
    return;
  }

  // 0.1 Busca no Firebase Datastore local se há algum local cadastrado muito próximo (<= 45m)
  let closestLocal: any = null;
  let minLocalDistMeters = Infinity;
  for (const loc of localLocaisCache) {
    const lLat = Number(loc.lat);
    const lLng = Number(loc.lng);
    if (isNaN(lLat) || isNaN(lLng) || (lLat === 0 && lLng === 0)) continue;

    const dLat = (lLat - lat) * (Math.PI / 180);
    const dLng = (lLng - lng) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat * (Math.PI / 180)) * Math.cos(lLat * (Math.PI / 180)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distM = 6371e3 * c;
    if (distM <= 45 && distM < minLocalDistMeters) {
      minLocalDistMeters = distM;
      closestLocal = loc;
    }
  }

  if (closestLocal) {
    console.log(`[Firebase Reverse Snap HIT] Ponto próximo a "${closestLocal.name}" (${Math.round(minLocalDistMeters)}m) encontrado no datastore.`);
    const fullAddr = closestLocal.endereco || [closestLocal.rua, closestLocal.numero, closestLocal.setor, closestLocal.cidade].filter(Boolean).join(', ') || closestLocal.name;
    const responseData = {
      formatted_address: fullAddr,
      name: closestLocal.name,
      city: closestLocal.cidade || 'Goiânia - GO',
      neighborhood: closestLocal.setor,
      coordinates: { lat: Number(closestLocal.lat), lng: Number(closestLocal.lng) },
      category: closestLocal.central_coletas ? 'Central de Coletas' : (closestLocal.setor ? `${closestLocal.setor}` : 'Ponto Comercial'),
      phone: closestLocal.telefone,
      imageUrl: closestLocal.icon,
      fromFirebase: true
    };
    googleReverseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
    persistGoogleCache();
    res.setHeader('X-Cache', 'HIT');
    res.json({ success: true, data: responseData, fromFirebase: true });
    return;
  }

  try {
    // 1. Tenta identificar se o clique foi em um Ponto de Interesse (POI) ou estabelecimento comercial
    let poiData: any = null;
    try {
      const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=establishment&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`;
      const nearbyResp = await fetch(nearbyUrl);
      const nearbyJson: any = await nearbyResp.json();
      if (nearbyJson.results && Array.isArray(nearbyJson.results) && nearbyJson.results.length > 0) {
        // Encontra o melhor POI comercial/estabelecimento
        const found = nearbyJson.results.find((r: any) => 
          r.name && r.types && (
            r.types.includes('establishment') || 
            r.types.includes('point_of_interest') || 
            r.types.includes('store') ||
            r.types.includes('shopping_mall') ||
            r.types.includes('restaurant') ||
            r.types.includes('pharmacy')
          )
        ) || nearbyJson.results[0];

        if (found && found.name) {
          const rawType = found.types?.[0] || 'establishment';
          const categoryLabel = GOOGLE_TYPE_MAP[rawType] || 'Ponto de Interesse';
          poiData = {
            name: found.name,
            formatted_address: found.vicinity || found.formatted_address,
            category: categoryLabel,
            rating: found.rating,
            reviewsCount: found.user_ratings_total,
            openNow: found.opening_hours?.open_now,
            place_id: found.place_id,
            imageUrl: found.photos?.[0]?.photo_reference
              ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${found.photos[0].photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
              : undefined
          };
        }
      }
    } catch (e) {
      // Ignora erro no nearbysearch e segue para o geocoding padrão
    }

    const revUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`;
    const revResp = await fetch(revUrl);
    const revData: any = await revResp.json();

    if (revData.results && revData.results.length > 0) {
      const item = revData.results[0];
      const getComp = (type: string) => {
        const c = item.address_components?.find((ac: any) => ac.types.includes(type));
        return c ? c.long_name : '';
      };
      const route = getComp('route');
      const number = getComp('street_number');
      const neighborhood = getComp('sublocality_level_1') || getComp('neighborhood') || getComp('sublocality');
      const city = getComp('administrative_area_level_2') || 'Goiânia';
      const state = getComp('administrative_area_level_1') || 'GO';
      const streetName = route ? `${route}${number ? ', ' + number : ''}` : '';

      const responseData = {
        formatted_address: poiData?.formatted_address || item.formatted_address,
        name: poiData?.name || streetName || neighborhood || city,
        city: `${city}${state ? ' - ' + state : ''}`,
        neighborhood,
        postal_code: getComp('postal_code'),
        coordinates: { lat, lng },
        category: poiData?.category || (route ? 'Via pública' : 'Endereço residencial'),
        rating: poiData?.rating,
        reviewsCount: poiData?.reviewsCount,
        openNow: poiData ? poiData.openNow : undefined,
        imageUrl: poiData?.imageUrl
      };

      googleReverseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
      persistGoogleCache();

      res.setHeader('X-Cache', 'MISS');
      res.json({
        success: true,
        data: responseData
      });
      return;
    }

    if (poiData) {
      const responseData = {
        formatted_address: poiData.formatted_address,
        name: poiData.name,
        city: 'Goiânia - GO',
        coordinates: { lat, lng },
        category: poiData.category,
        rating: poiData.rating,
        reviewsCount: poiData.reviewsCount,
        openNow: poiData.openNow,
        imageUrl: poiData.imageUrl
      };
      googleReverseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
      persistGoogleCache();
      res.json({ success: true, data: responseData });
      return;
    }

    res.json({ success: false, message: 'Nenhum endereço encontrado para essas coordenadas' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// GOOGLE MAPS API: ROTAS & NAVEGAÇÃO (DIRECTIONS API)
// =========================================================================
app.get('/api/google/directions', async (req: Request, res: Response) => {
  const origin = String(req.query.origin || '').trim();
  const destination = String(req.query.destination || '').trim();
  const mode = String(req.query.mode || 'driving').trim();

  if (!origin || !destination) {
    res.status(400).json({ success: false, message: 'origin e destination são obrigatórios (lat,lng)' });
    return;
  }

  const cacheKey = `${origin}->${destination}-${mode}`;
  const cached = googleDirectionsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Google API Cache HIT] Directions: ${cacheKey} (economizou chamada de API do Google)`);
    res.setHeader('X-Cache', 'HIT');
    res.json({ success: true, data: cached.data });
    return;
  }

  try {
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&region=br`;
    const resp = await fetch(directionsUrl);
    const data: any = await resp.json();

    if (data.status === 'OK' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const leg = route.legs?.[0];
      const distanceMeters = leg?.distance?.value || 0;
      const durationSeconds = leg?.duration?.value || 0;

      const responsePayload = {
        encodedPolyline: route.overview_polyline?.points || '',
        distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
        durationMin: Math.max(1, Math.round(durationSeconds / 60)),
        distanceText: leg?.distance?.text || '',
        durationText: leg?.duration?.text || '',
        summary: route.summary || ''
      };

      googleDirectionsCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });
      persistGoogleCache();
      console.log(`[Google API Cache STORED] Directions: ${cacheKey} (${responsePayload.distanceKm} km, ${responsePayload.durationMin} min)`);

      res.setHeader('X-Cache', 'MISS');
      res.json({ success: true, data: responsePayload });
      return;
    }

    res.json({ success: false, message: data.error_message || `Status: ${data.status}` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// RESOLUÇÃO DE LINKS DO GOOGLE MAPS (maps.app.goo.gl, goo.gl/maps, etc.)
// Converte links encurtados, extrai coordenadas e identifica "Local sem nome"
// =========================================================================
app.all('/api/google/resolve-link', async (req: Request, res: Response) => {
  let rawInput = String(req.query.url || req.query.input || req.query.q || '').trim();
  let customerName = String(req.query.customerName || req.query.customer || '').trim();
  if (!rawInput && req.body) {
    try {
      const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      rawInput = String(parsed?.url || parsed?.input || '').trim();
      if (!customerName) {
        customerName = String(parsed?.customerName || parsed?.customer || '').trim();
      }
    } catch {}
  }

  if (!rawInput) {
    res.status(400).json({ success: false, message: 'URL ou texto do link não fornecido.' });
    return;
  }

  // Verifica cache de links resolvidos
  const cacheKey = `${rawInput.trim()}_${customerName || 'nocust'}`;
  const cached = googleLinkCache.get(cacheKey) || googleLinkCache.get(rawInput.trim());
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Google API Cache HIT] Link: "${rawInput.trim()}" (economizou chamada de API do Google)`);
    res.setHeader('X-Cache', 'HIT');
    const dataToReturn = { ...cached.data };
    if (customerName && (dataToReturn.isUnnamed || dataToReturn.name === 'Local sem nome' || dataToReturn.name.toLowerCase().startsWith('local de '))) {
      dataToReturn.name = `Local de ${customerName.trim()}`;
    }
    res.json({ ...dataToReturn, fromCache: true });
    return;
  }

  try {
    // Isola URL removendo texto ao redor e pontuações finais como parênteses, vírgula ou ponto
    const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
    let resolvedUrl = urlMatch ? urlMatch[0].replace(/[)\]'",;.]+$/, '').trim() : rawInput;

    let lat: number | null = null;
    let lng: number | null = null;
    let name = '';
    let address = '';
    let isUnnamed = false;
    let bodyText = '';

    // 1. Se for um link HTTP(S), segue redirecionamentos e lê o conteúdo HTML da resposta
    if (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) {
      try {
        const resp = await fetch(resolvedUrl, {
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          }
        });
        resolvedUrl = resp.url || resolvedUrl;
        bodyText = await resp.text();

        // Se o Google Maps retornou uma página intermediária com og:url, meta refresh ou canonical link
        if (bodyText) {
          const ogMatch = bodyText.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ||
                          bodyText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i) ||
                          bodyText.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
                          bodyText.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
          if (ogMatch && ogMatch[1]) {
            resolvedUrl = ogMatch[1].replace(/&amp;/g, '&');
          }
        }
      } catch (err: any) {
        console.warn('[Google Link Resolver] Falha ao seguir redirecionamento:', err.message);
      }
    }

    let decodedResolved = resolvedUrl;
    try { decodedResolved = decodeURIComponent(resolvedUrl); } catch {}
    let decodedRaw = rawInput;
    try { decodedRaw = decodeURIComponent(rawInput); } catch {}

    const textToScan = [decodedResolved, resolvedUrl, decodedRaw, bodyText].join(' \n ');

    // 2. Extrai CID hexadecimal se presente na URL ou body
    const cidMatch = textToScan.match(/0x[0-9a-fA-F]+:(0x[0-9a-fA-F]+)/);
    if (cidMatch && cidMatch[1]) {
      try {
        const decCid = BigInt(cidMatch[1]).toString();
        const placeResp = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?cid=${decCid}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
        const placeData: any = await placeResp.json();
        if (placeData.status === 'OK' && placeData.result) {
          name = placeData.result.name || '';
          address = placeData.result.formatted_address || '';
          if (placeData.result.geometry?.location) {
            lat = placeData.result.geometry.location.lat;
            lng = placeData.result.geometry.location.lng;
          }
        }
      } catch (e: any) {
        console.warn('[Google Link Resolver] Erro ao buscar dados por CID:', e.message);
      }
    }

    // 3. Extrai coordenadas da URL com múltiplos padrões do Google Maps
    if (lat === null || lng === null) {
      // Padrão !3d... !4d... (coordenadas exatas do pin/marcador no Google Maps)
      const dataCoordMatch = textToScan.match(/!3d(-?\d+(?:\.\d+)?)[!&]4d(-?\d+(?:\.\d+)?)/);
      if (dataCoordMatch) {
        lat = parseFloat(dataCoordMatch[1]);
        lng = parseFloat(dataCoordMatch[2]);
      }
    }

    if (lat === null || lng === null) {
      // Padrão /place/lat,lng ou /place/Nome/@lat,lng
      const placeCoordMatch = textToScan.match(/\/place\/(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/);
      if (placeCoordMatch) {
        lat = parseFloat(placeCoordMatch[1]);
        lng = parseFloat(placeCoordMatch[2]);
      }
    }

    if (lat === null || lng === null) {
      // Padrão destino ou origem: destination=lat,lng / daddr=lat,lng / origin=lat,lng / saddr=lat,lng
      const destCoordMatch = textToScan.match(/[?&](?:destination|daddr|origin|saddr)=(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/);
      if (destCoordMatch) {
        lat = parseFloat(destCoordMatch[1]);
        lng = parseFloat(destCoordMatch[2]);
      }
    }

    if (lat === null || lng === null) {
      // Padrão q=lat,lng / q=loc:lat,lng / ll=lat,lng / query=lat,lng / loc=lat,lng / center=lat,lng
      const qCoordMatch = textToScan.match(/[?&](?:q|ll|query|loc|center)=(?:loc:)?\s*(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/);
      if (qCoordMatch) {
        lat = parseFloat(qCoordMatch[1]);
        lng = parseFloat(qCoordMatch[2]);
      }
    }

    if (lat === null || lng === null) {
      // Padrão @lat,lng
      const atCoordMatch = textToScan.match(/@(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/);
      if (atCoordMatch) {
        lat = parseFloat(atCoordMatch[1]);
        lng = parseFloat(atCoordMatch[2]);
      }
    }

    if (lat === null || lng === null && bodyText) {
      // Coordenadas em arrays JS no HTML retornado pelo Google Maps
      const jsArrayMatch = bodyText.match(/\[(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\]/);
      if (jsArrayMatch) {
        lat = parseFloat(jsArrayMatch[1]);
        lng = parseFloat(jsArrayMatch[2]);
      }
    }

    if (lat === null || lng === null) {
      // Padrão de coordenadas puras no texto (ex: -16.615549, -48.7546005)
      const pureCoordMatch = textToScan.match(/(-?\d{1,2}\.\d{4,})[,\s+]+(-?\d{1,3}\.\d{4,})/);
      if (pureCoordMatch) {
        lat = parseFloat(pureCoordMatch[1]);
        lng = parseFloat(pureCoordMatch[2]);
      }
    }

    // 4. Extrai o nome do local da URL ou HTML caso ainda não tenha sido definido
    if (!name) {
      const pathMatch = decodedResolved.match(/\/maps\/place\/([^/@?]+)/);
      if (pathMatch && pathMatch[1]) {
        name = pathMatch[1].replace(/\+/g, ' ').trim();
      }
    }

    // 5. Verifica se é um local sem nome comercial (dropped pin, marcador inserido, coordenadas puras ou plus code)
    const isCoordPattern = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(name);
    const isGenericDropped = !name || isCoordPattern || 
      /^(dropped pin|marcador inserido|pino inserido|local sem nome|unnamed location|marcador|pino|ponto no mapa|local marcado|local|google maps)$/i.test(name) ||
      /^[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,4}/i.test(name) ||
      name.toLowerCase().startsWith('local de ');

    if (isGenericDropped) {
      isUnnamed = true;
      name = customerName ? `Local de ${customerName.trim()}` : 'Local sem nome';
    }

    // 6. Reverse geocode via Google Geocoding API para obter o endereço formatado e componentes
    if (lat !== null && lng !== null) {
      try {
        const revResp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
        const revData: any = await revResp.json();
        if (revData.status === 'OK' && revData.results && revData.results.length > 0) {
          const revAddress = revData.results[0].formatted_address;
          if (!address || isUnnamed || address.split(',').length < 2) {
            address = revAddress;
          }
        }
      } catch (e: any) {
        console.warn('[Google Link Resolver] Erro no reverse geocoding:', e.message);
      }
    }

    if (!address && lat !== null && lng !== null) {
      address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    if (lat === null || lng === null) {
      res.status(404).json({
        success: false,
        message: 'Não foi possível extrair as coordenadas deste link do Google Maps.'
      });
      return;
    }

    const finalName = name || (customerName ? `Local de ${customerName.trim()}` : 'Local sem nome');
    const resultPayload = {
      success: true,
      name: finalName,
      address: address || finalName,
      coordinates: { lat, lng },
      isUnnamed,
      resolvedUrl
    };

    googleLinkCache.set(cacheKey, { timestamp: Date.now(), data: resultPayload });
    if (resolvedUrl && resolvedUrl !== cacheKey) {
      googleLinkCache.set(resolvedUrl.trim(), { timestamp: Date.now(), data: resultPayload });
    }
    persistGoogleCache();
    console.log(`[Google API Cache STORED] Link: "${rawInput}" -> ${resultPayload.name} (${lat}, ${lng})`);

    res.setHeader('X-Cache', 'MISS');
    res.json(resultPayload);
  } catch (err: any) {
    console.error('[Google Link Resolver Error]:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// GESTÃO DE USUÁRIOS VIA FIREBASE & DATASTORE LOCAL (Substitui endpoints /users)
// =========================================================================
const USERS_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'importedUsers.json');
let localUsersCache: any[] = [];

function loadLocalUsers() {
  try {
    if (fs.existsSync(USERS_FILE_PATH)) {
      const raw = fs.readFileSync(USERS_FILE_PATH, 'utf-8');
      localUsersCache = JSON.parse(raw);
      // Converte e persiste fotos de perfil em base64 diretamente para arquivos no disco
      let changed = false;
      for (const u of localUsersCache) {
        if (u.foto && typeof u.foto === 'string' && u.foto.startsWith('data:image/')) {
          const savedPath = saveBase64Image(u.foto, 'users');
          if (savedPath) {
            u.foto = savedPath;
            u.avatarUrl = savedPath;
            changed = true;
          }
        }
      }
      if (changed) {
        saveLocalUsers();
      }
      console.log(`[Firebase User Server] Carregados ${localUsersCache.length} usuários locais.`);
    }
  } catch (err: any) {
    console.warn('[Firebase User Server] Erro ao carregar arquivo de usuários:', err.message);
  }
}
loadLocalUsers();

function saveLocalUsers() {
  try {
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(localUsersCache, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[Firebase User Server] Erro ao persistir arquivo de usuários:', err.message);
  }
}

async function syncUserToFirebaseRTDB(user: any) {
  const rtdbUrl = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL;
  if (!rtdbUrl || !user || !user.id) return;
  try {
    const cleanUrl = rtdbUrl.replace(/\/+$/, '');
    await fetch(`${cleanUrl}/users/${user.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
  } catch (err: any) {
    console.warn('[Firebase RTDB Sync] Erro:', err.message);
  }
}

function parseRawJsonBody(req: Request): any {
  if (req.body && Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf-8'));
    } catch {
      return {};
    }
  }
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

// Handlers locais de usuários (interceptam /users e /api/users sem repassar ao upstream)
app.all(['/users/reload', '/api/users/reload'], (req: Request, res: Response) => {
  loadLocalUsers();
  res.json({ success: true, message: 'Usuários recarregados com sucesso!', count: localUsersCache.length });
});

app.all(['/users/list', '/api/users/list'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  let all = [...localUsersCache];

  if (body.access_level && typeof body.access_level === 'string') {
    const level = body.access_level.toLowerCase().trim();
    all = all.filter(u => (u.access_level || '').toLowerCase() === level);
  }

  if (body.search && typeof body.search === 'string') {
    const q = body.search.toLowerCase().trim();
    const digits = q.replace(/\D/g, '');
    all = all.filter(u => {
      const name = (u.name || '').toLowerCase();
      const fullName = (u.name_completo || '').toLowerCase();
      const phone = (u.phone || '').replace(/\D/g, '');
      const cpf = (u.cpf || '').replace(/\D/g, '');
      const cidade = (u.cidade || '').toLowerCase();
      if (name.includes(q) || fullName.includes(q) || cidade.includes(q)) return true;
      if (digits && (phone.includes(digits) || cpf.includes(digits))) return true;
      return false;
    });
  }

  // Ordena por quantidade de pedidos (decrescente)
  all.sort((a, b) => (b.pedidos_count || 0) - (a.pedidos_count || 0));

  const total = all.length;
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const limit = Math.max(1, parseInt(body.limit, 10) || 50);
  const start = (page - 1) * limit;
  const paginated = all.slice(start, start + limit);

  res.json({
    success: true,
    data: paginated,
    total
  });
});

app.all(['/users/get', '/api/users/get'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.id || req.query.id || '');
  const user = localUsersCache.find(u => String(u.id) === targetId);

  if (user) {
    res.json({ success: true, data: user });
  } else {
    res.status(404).json({ success: false, message: 'Usuário não encontrado' });
  }
});

app.all(['/users/save', '/api/users/save'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  if (!body) {
    res.status(400).json({ success: false, message: 'Dados inválidos' });
    return;
  }

  let existingIndex = -1;
  const rawId = body.id !== undefined && body.id !== null ? String(body.id).trim() : '';
  if (rawId !== '') {
    existingIndex = localUsersCache.findIndex(u => {
      if (String(u.id) === rawId) return true;
      const numU = String(u.id).replace(/\D/g, '');
      const numB = rawId.replace(/\D/g, '');
      if (numU && numB && numU === numB) return true;
      return false;
    });
  }
  if (existingIndex < 0 && body.phone) {
    const cleanPhone = String(body.phone).replace(/\D/g, '');
    if (cleanPhone.length >= 8) {
      existingIndex = localUsersCache.findIndex(u => {
        const uPhone = String(u.phone || '').replace(/\D/g, '');
        return uPhone && (uPhone === cleanPhone || uPhone.endsWith(cleanPhone) || cleanPhone.endsWith(uPhone));
      });
    }
  }

  // Se foto de perfil enviada em base64, envia prioritariamente ao servidor PHP de imagens; fallback para disco local
  const rawImage = (body.foto && typeof body.foto === 'string' && body.foto.startsWith('data:image/'))
    ? body.foto
    : (body.avatarUrl && typeof body.avatarUrl === 'string' && body.avatarUrl.startsWith('data:image/'))
    ? body.avatarUrl
    : null;

  const clientImgServer = (body.imageServerUrl as string) || (req.headers['x-image-server-url'] as string);
  const clientImgPass = (body.imageServerPassword as string) || (req.headers['x-image-server-password'] as string);

  if (rawImage) {
    let savedUrl = await uploadToPhpServer(rawImage, 'perfil', clientImgServer, clientImgPass);
    if (!savedUrl) {
      savedUrl = saveBase64Image(rawImage, 'users');
    }
    if (savedUrl) {
      body.foto = savedUrl;
      body.avatarUrl = savedUrl;
    }
  } else if (body.foto) {
    body.avatarUrl = body.foto;
  } else if (body.avatarUrl) {
    body.foto = body.avatarUrl;
  }

  let finalUser: any;
  if (existingIndex >= 0) {
    finalUser = {
      ...localUsersCache[existingIndex],
      ...body,
      updated_at: new Date().toISOString()
    };
    localUsersCache[existingIndex] = finalUser;
  } else {
    const maxId = localUsersCache.reduce((max, u) => Math.max(max, Number(u.id) || 0), 2000);
    const newId = maxId + 1;
    finalUser = {
      ...body,
      id: rawId && !isNaN(Number(rawId)) ? Number(rawId) : newId,
      name: body.name || 'Usuário Sem Nome',
      phone: body.phone || '',
      access_level: body.access_level || 'cliente',
      created_at: new Date().toISOString()
    };
    localUsersCache.push(finalUser);
  }

  saveLocalUsers();
  syncUserToFirebaseRTDB(finalUser);
  try {
    const cleanUser = sanitizeForFirestore(finalUser);
    serverSetDoc(serverDoc(serverFirestore, 'users', String(finalUser.id)), cleanUser, { merge: true }).catch(() => {});
  } catch (e) {}

  res.json({
    success: true,
    id: finalUser.id,
    foto: finalUser.foto,
    avatarUrl: finalUser.avatarUrl || finalUser.foto,
    data: finalUser,
    message: 'Usuário salvo com sucesso no Firebase!'
  });
});

app.all(['/users/upload_foto', '/api/users/upload_foto'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const base64Data = body.base64 || body.image || body.foto || body.avatarUrl;
  let photoPath = '';
  const clientImgServer = (body.imageServerUrl as string) || (req.headers['x-image-server-url'] as string);
  const clientImgPass = (body.imageServerPassword as string) || (req.headers['x-image-server-password'] as string);

  if (base64Data && typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
    const phpUrl = await uploadToPhpServer(base64Data, 'perfil', clientImgServer, clientImgPass);
    if (phpUrl) {
      photoPath = phpUrl;
    } else {
      const saved = saveBase64Image(base64Data, 'users');
      if (saved) photoPath = saved;
    }
  }
  if (!photoPath && base64Data && typeof base64Data === 'string' && !base64Data.startsWith('data:')) {
    photoPath = base64Data;
  }
  if (!photoPath) {
    res.status(base64Data ? 500 : 400).json({
      success: false,
      message: base64Data ? 'Não foi possível gravar a foto no servidor.' : 'Nenhuma foto foi enviada.'
    });
    return;
  }

  const rawId = body.user_id !== undefined && body.user_id !== null ? String(body.user_id) : (body.id ? String(body.id) : '');
  const cleanPhone = String(body.phone || '').replace(/\D/g, '');

  if (rawId || cleanPhone) {
    const idx = localUsersCache.findIndex(u => {
      if (rawId && (String(u.id) === rawId || (rawId.replace(/\D/g, '') && String(u.id).replace(/\D/g, '') === rawId.replace(/\D/g, '')))) return true;
      if (cleanPhone && cleanPhone.length >= 8) {
        const uPhone = String(u.phone || '').replace(/\D/g, '');
        if (uPhone && (uPhone === cleanPhone || uPhone.endsWith(cleanPhone) || cleanPhone.endsWith(uPhone))) return true;
      }
      return false;
    });

    if (idx >= 0) {
      localUsersCache[idx].foto = photoPath;
      localUsersCache[idx].avatarUrl = photoPath;
      localUsersCache[idx].updated_at = new Date().toISOString();
      saveLocalUsers();
      syncUserToFirebaseRTDB(localUsersCache[idx]);
      try {
        const cleanUser = sanitizeForFirestore(localUsersCache[idx]);
        serverSetDoc(serverDoc(serverFirestore, 'users', String(localUsersCache[idx].id)), cleanUser, { merge: true }).catch(() => {});
      } catch (e) {}
    }
  }

  res.json({
    success: true,
    data: { path: photoPath, foto: photoPath, avatarUrl: photoPath },
    path: photoPath,
    foto: photoPath,
    avatarUrl: photoPath
  });
});

app.all(['/users/register', '/api/users/register'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const maxId = localUsersCache.reduce((max, u) => Math.max(max, Number(u.id) || 0), 2000);
  const newId = maxId + 1;

  const newUser = {
    id: newId,
    name: (body.name || '').trim(),
    phone: (body.phone || '').trim(),
    access_level: (body.access_level || 'cliente').toLowerCase(),
    cidade: body.cidade || null,
    created_at: new Date().toISOString(),
    cliente_especial: 0,
    paga_semanal: 0,
    pendencias: 0
  };

  localUsersCache.push(newUser);
  saveLocalUsers();
  syncUserToFirebaseRTDB(newUser);
  try {
    const cleanUser = sanitizeForFirestore(newUser);
    serverSetDoc(serverDoc(serverFirestore, 'users', String(newUser.id)), cleanUser, { merge: true }).catch(() => {});
  } catch (e) {}

  res.json({
    success: true,
    data: { id: newId },
    message: 'Usuário registrado com sucesso no Firebase!'
  });
});

// =========================================================================
// GESTÃO DE PEDIDOS VIA FIREBASE & DATASTORE LOCAL (2000 pedidos importados)
// =========================================================================
const PEDIDOS_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'importedPedidos.json');
let localPedidosCache: any[] = [];

function loadLocalPedidos() {
  try {
    if (fs.existsSync(PEDIDOS_FILE_PATH)) {
      const raw = fs.readFileSync(PEDIDOS_FILE_PATH, 'utf-8');
      localPedidosCache = JSON.parse(raw);
      console.log(`[Firebase Pedidos Server] Carregados ${localPedidosCache.length} pedidos importados.`);
    }
  } catch (err: any) {
    console.warn('[Firebase Pedidos Server] Erro ao carregar arquivo de pedidos:', err.message);
  }
}
loadLocalPedidos();

// Ordena a lista de usuários por quem tem mais pedidos no histórico (decrescente)
function sortUsersByOrderCount() {
  const countByName = new Map<string, number>();
  const countByPhone = new Map<string, number>();
  const countById = new Map<string, number>();

  for (const p of localPedidosCache) {
    const nameNorm = (p.cliente || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const phoneDigits = String(p.phone || '').replace(/\D/g, '');
    if (nameNorm) countByName.set(nameNorm, (countByName.get(nameNorm) || 0) + 1);
    if (phoneDigits && phoneDigits.length >= 8) countByPhone.set(phoneDigits, (countByPhone.get(phoneDigits) || 0) + 1);
    if (p.cliente_id) countById.set(String(p.cliente_id), (countById.get(String(p.cliente_id)) || 0) + 1);
  }

  for (const u of localUsersCache) {
    const nameNorm = (u.name_completo || u.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const phoneDigits = String(u.phone || '').replace(/\D/g, '');
    const idStr = String(u.id || '');
    let count = 0;
    if (countById.has(idStr)) count = Math.max(count, countById.get(idStr)!);
    if (nameNorm && countByName.has(nameNorm)) count = Math.max(count, countByName.get(nameNorm)!);
    if (phoneDigits && countByPhone.has(phoneDigits)) count = Math.max(count, countByPhone.get(phoneDigits)!);
    u.pedidos_count = count;
    u.order_count = count;
  }

  localUsersCache.sort((a, b) => (b.pedidos_count || 0) - (a.pedidos_count || 0));
}
sortUsersByOrderCount();

let savePedidosTimeout: NodeJS.Timeout | null = null;
function saveLocalPedidos() {
  if (savePedidosTimeout) return;
  savePedidosTimeout = setTimeout(() => {
    savePedidosTimeout = null;
    try {
      fs.writeFileSync(PEDIDOS_FILE_PATH, JSON.stringify(localPedidosCache, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[Firebase Pedidos Server] Erro ao persistir pedidos:', err.message);
    }
  }, 3000);
}

function extractCleanPedidoId(rawId: any): string {
  if (rawId === undefined || rawId === null || rawId === '') return '';
  const rawStr = String(rawId).trim();
  const stripped = rawStr.replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
  return stripped;
}

function findLocalPedidoIndex(rawId: any): number {
  if (rawId === undefined || rawId === null || rawId === '') return -1;
  const rawStr = String(rawId).trim();
  const cleanId = extractCleanPedidoId(rawStr);
  const digits = rawStr.replace(/\D/g, '');

  return localPedidosCache.findIndex(o => {
    if (!o) return false;
    const oIdStr = String(o.id).trim();
    const oCleanId = extractCleanPedidoId(oIdStr);
    const oDigits = oIdStr.replace(/\D/g, '');

    if (oIdStr === rawStr || oIdStr === cleanId || oCleanId === cleanId) return true;
    if (digits && oDigits && digits === oDigits) return true;
    if (o.codigo && (String(o.codigo) === rawStr || String(o.codigo) === cleanId)) return true;
    if (o.orderCode && (String(o.orderCode) === rawStr || String(o.orderCode) === cleanId)) return true;
    return false;
  });
}

function findLocalPedido(rawId: any): any | undefined {
  const idx = findLocalPedidoIndex(rawId);
  return idx >= 0 ? localPedidosCache[idx] : undefined;
}

async function syncPedidoToFirebase(pedido: any) {
  if (!pedido || !pedido.id) return;
  try {
    const docId = extractCleanPedidoId(pedido.id) || String(pedido.id);
    const clean = sanitizeForFirestore({ ...pedido, id: docId });

    const rtdbUrl = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL;
    if (rtdbUrl) {
      try {
        const cleanUrl = rtdbUrl.replace(/\/+$/, '');
        fetch(`${cleanUrl}/orders/${docId}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clean)
        }).catch(() => {});
      } catch (err: any) {
        console.warn('[Firebase RTDB Pedido Sync] Erro:', err.message);
      }
    }

    await serverSetDoc(serverDoc(serverFirestore, 'orders', docId), clean, { merge: true });
    await serverSetDoc(serverDoc(serverFirestore, 'pedidos', docId), clean, { merge: true }).catch(() => {});
    console.log(`[Firestore Server] Pedido #${docId} sincronizado no Firestore (orders & pedidos).`);
  } catch (err: any) {
    console.warn(`[Firestore Server] Erro ao sincronizar pedido #${pedido.id}:`, err.message);
  }
}

// Handlers locais de pedidos (substitui upstream /pedidos)
app.all(['/pedidos/list_pedidos', '/api/pedidos/list_pedidos'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  let all = [...localPedidosCache];

  if (body.id !== undefined && body.id !== null && body.id !== '') {
    const rawTarget = String(body.id).trim();
    const cleanTarget = extractCleanPedidoId(rawTarget);
    all = all.filter(o => {
      const oIdStr = String(o.id).trim();
      const oCleanId = extractCleanPedidoId(oIdStr);
      return oIdStr === rawTarget || oIdStr === cleanTarget || oCleanId === cleanTarget;
    });
  }

  if (body.motorista_id !== undefined && body.motorista_id !== null && body.motorista_id !== '') {
    const mId = String(body.motorista_id);
    all = all.filter(o => 
      String(o.motorista_id || '') === mId ||
      String(o.coleta_user_id || '') === mId ||
      String(o.entrega_user_id || '') === mId ||
      (o.coleta_motoristas && o.coleta_motoristas.includes(mId)) ||
      (o.entrega_motoristas && o.entrega_motoristas.includes(mId))
    );
  }

  if (body.etapa) {
    const etapas = Array.isArray(body.etapa) 
      ? body.etapa.map((e: string) => e.toLowerCase()) 
      : [String(body.etapa).toLowerCase()];
    all = all.filter(o => o.etapa && etapas.includes(o.etapa.toLowerCase()));
  }

  if (body.tipo_encomenda) {
    const te = String(body.tipo_encomenda).toLowerCase();
    all = all.filter(o => (o.tipo_encomenda || '').toLowerCase() === te);
  }

  if (body.tipo_veiculo) {
    const tv = String(body.tipo_veiculo).toLowerCase();
    all = all.filter(o => (o.tipo_veiculo || '').toLowerCase() === tv);
  }

  if (body.status_pagamento) {
    const sp = String(body.status_pagamento).toLowerCase();
    all = all.filter(o => (o.status_pagamento || '').toLowerCase() === sp);
  }

  if (body.cidade) {
    const cid = String(body.cidade).toLowerCase();
    all = all.filter(o => (o.cidade || o.coleta_cidade || o.entrega_cidade || '').toLowerCase().includes(cid));
  }

  if (body.nome) {
    const q = String(body.nome).toLowerCase().trim();
    all = all.filter(o => 
      (o.cliente || '').toLowerCase().includes(q) ||
      (o.mercadoria_nome || '').toLowerCase().includes(q) ||
      (o.locais_name || '').toLowerCase().includes(q) ||
      (o.phone || '').includes(q)
    );
  }

  if (body.data_ini) {
    const dIni = String(body.data_ini).slice(0, 10);
    all = all.filter(o => (o.data || '').slice(0, 10) >= dIni);
  }

  if (body.data_fim) {
    const dFim = String(body.data_fim).slice(0, 10);
    all = all.filter(o => (o.data || '').slice(0, 10) <= dFim);
  }

  // Ordenação decrescente por ID
  all.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));

  const total = all.length;
  const limit = Math.min(parseInt(body.limit, 10) || 2000, 2000);
  const paginated = all.slice(0, limit);

  res.json({
    success: true,
    data: paginated,
    total
  });
});

app.all(['/pedidos/get', '/api/pedidos/get'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.id || req.query.id || '');
  const pedido = findLocalPedido(targetId);

  if (pedido) {
    res.json({ success: true, data: pedido });
  } else {
    res.status(404).json({ success: false, message: 'Pedido não encontrado' });
  }
});

app.all(['/pedidos/save', '/api/pedidos/save', '/pedidos/save_pedido', '/api/pedidos/save_pedido'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  if (!body) {
    res.status(400).json({ success: false, message: 'Dados inválidos' });
    return;
  }

  // Regra de segurança: Motoristas NÃO possuem permissão para adicionar nem editar pedidos
  const callerRole = (req.headers['x-user-role'] as string) || body.caller_role || body.userRole || body.user_role;
  if (callerRole === 'motorista') {
    res.status(403).json({
      success: false,
      message: 'Motoristas não possuem permissão para adicionar ou editar pedidos.'
    });
    return;
  }

  const rawReqId = body.id !== undefined && body.id !== null && body.id !== '' ? body.id : body.pedido_id;
  const existingIndex = findLocalPedidoIndex(rawReqId);

  let finalPedido: any;
  if (existingIndex >= 0) {
    const existing = localPedidosCache[existingIndex];
    finalPedido = {
      ...existing,
      ...body,
      id: existing.id,
      updated_at: new Date().toISOString()
    };
    localPedidosCache[existingIndex] = finalPedido;
  } else {
    const cleanReqId = extractCleanPedidoId(rawReqId);
    let newId: any = cleanReqId;
    if (!newId) {
      const maxId = localPedidosCache.reduce((max, o) => Math.max(max, Number(o.id) || 0), 10000);
      newId = maxId + 1;
    }
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    finalPedido = {
      id: newId,
      data: dateStr,
      etapa: body.etapa || 'pendente',
      tipo_encomenda: body.tipo_encomenda || 'coleta',
      tipo_veiculo: body.tipo_veiculo || 'moto',
      cliente: body.cliente || 'Cliente',
      phone: body.phone || '',
      cidade: body.cidade || 'Goiânia',
      status_pagamento: body.status_pagamento || 'pendente',
      total: body.total || 0,
      created_at: new Date().toISOString(),
      ...body
    };
    finalPedido.id = newId;
    localPedidosCache.unshift(finalPedido);

    // Incrementa o contador de pedidos nos dados do cliente para acelerar as buscas
    if (finalPedido.phone || finalPedido.cliente) {
      const cleanPhone = String(finalPedido.phone || '').replace(/\D/g, '');
      const cust = localUsersCache.find(u => {
        if (cleanPhone && cleanPhone.length >= 8) {
          const uPhone = String(u.phone || '').replace(/\D/g, '');
          if (uPhone && (uPhone === cleanPhone || uPhone.endsWith(cleanPhone) || cleanPhone.endsWith(uPhone))) return true;
        }
        if (finalPedido.cliente && u.name && finalPedido.cliente.toLowerCase().trim() === u.name.toLowerCase().trim()) return true;
        return false;
      });
      if (cust) {
        cust.pedidos_count = (Number(cust.pedidos_count) || 0) + 1;
        cust.order_count = cust.pedidos_count;
        cust.orderCount = cust.pedidos_count;
        saveLocalUsers();
        try {
          const cleanUser = sanitizeForFirestore(cust);
          serverSetDoc(serverDoc(serverFirestore, 'users', String(cust.id)), cleanUser, { merge: true }).catch(() => {});
        } catch (e) {}
      }
    }
  }

  saveLocalPedidos();
  syncPedidoToFirebase(finalPedido);

  res.json({
    success: true,
    data: { id: finalPedido.id },
    message: 'Pedido salvo com sucesso no Firebase!'
  });
});

app.all(['/pedidos/marcar_coleta_entrega', '/api/pedidos/marcar_coleta_entrega'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.pedido_id || body.id || '');
  const etapa = body.etapa;
  let existing = findLocalPedido(targetId);

  const nowIso = new Date().toISOString();
  const userId = body.user_id;
  const userName = body.usuario_nome || body.user_nome;

  if (existing) {
    existing.etapa = etapa;
    existing.updated_at = nowIso;
    if (etapa === 'coletado') {
      existing.coleta_saida_at = nowIso;
      if (userId) existing.coleta_user_id = userId;
      if (userName) existing.coleta_user_nome = userName;
    } else if (etapa === 'trocado' || etapa === 'troca') {
      existing.troca_saida_at = nowIso;
      existing.troca_at = nowIso;
      if (userId) existing.troca_user_id = userId;
      if (userName) existing.troca_user_nome = userName;
    } else if (etapa === 'entregue') {
      existing.entrega_saida_at = nowIso;
      existing.entrega_at = nowIso;
      if (userId) existing.entrega_user_id = userId;
      if (userName) existing.entrega_user_nome = userName;
      existing.status_pagamento = 'pago';
    }
    saveLocalPedidos();
    syncPedidoToFirebase(existing);
    console.log(`[Server marcarColetaEntrega] Pedido #${existing.id} atualizado para ${etapa}`);
  } else {
    const cleanId = extractCleanPedidoId(targetId) || targetId;
    if (cleanId) {
      const newEntry: any = {
        id: cleanId,
        etapa,
        created_at: nowIso,
        updated_at: nowIso,
        data: nowIso.slice(0, 10),
        status_pagamento: etapa === 'entregue' ? 'pago' : 'pendente'
      };
      if (etapa === 'coletado') {
        newEntry.coleta_saida_at = nowIso;
        if (userId) newEntry.coleta_user_id = userId;
        if (userName) newEntry.coleta_user_nome = userName;
      } else if (etapa === 'trocado' || etapa === 'troca') {
        newEntry.troca_saida_at = nowIso;
        newEntry.troca_at = nowIso;
        if (userId) newEntry.troca_user_id = userId;
        if (userName) newEntry.troca_user_nome = userName;
      } else if (etapa === 'entregue') {
        newEntry.entrega_saida_at = nowIso;
        newEntry.entrega_at = nowIso;
        if (userId) newEntry.entrega_user_id = userId;
        if (userName) newEntry.entrega_user_nome = userName;
      }
      localPedidosCache.unshift(newEntry);
      saveLocalPedidos();
      syncPedidoToFirebase(newEntry);
      existing = newEntry;
      console.log(`[Server marcarColetaEntrega] Pedido #${cleanId} criado e persistido como ${etapa}`);
    }
  }

  res.json({
    success: true,
    data: { pedido_id: existing?.id || targetId, etapa }
  });
});

app.all(['/pedidos/set_etapa', '/api/pedidos/set_etapa'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.pedido_id || body.id || '');
  const existing = findLocalPedido(targetId);

  if (existing) {
    const nextEtapa = existing.etapa === 'pendente' ? 'coletando' 
      : existing.etapa === 'coletando' ? 'coletado' 
      : existing.etapa === 'coletado' ? (existing.tipo_encomenda === 'troca' ? 'trocando' : 'entregando')
      : existing.etapa === 'trocando' ? 'trocado'
      : existing.etapa === 'trocado' ? 'retornando'
      : existing.etapa === 'retornando' ? 'entregue'
      : existing.etapa === 'entregando' ? 'entregue'
      : 'finalizado';
    existing.etapa = nextEtapa;
    existing.updated_at = new Date().toISOString();
    saveLocalPedidos();
    syncPedidoToFirebase(existing);
  }

  res.json({ success: true });
});

app.all(['/pedidos/finalizar_pedido', '/api/pedidos/finalizar_pedido'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.pedido_id || body.id || '');
  const existing = findLocalPedido(targetId);

  if (existing) {
    existing.etapa = 'finalizado';
    existing.status_pagamento = 'pago';
    existing.entrega_saida_at = existing.entrega_saida_at || new Date().toISOString();
    existing.updated_at = new Date().toISOString();
    saveLocalPedidos();
    syncPedidoToFirebase(existing);
  }

  res.json({ success: true });
});

app.all(['/pedidos/upload_foto', '/api/pedidos/upload_foto'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const tipo = body.tipo || 'coleta';
  const base64Data = body.base64 || body.image || body.foto;
  if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
    res.status(400).json({ success: false, message: 'Nenhuma imagem válida foi enviada.' });
    return;
  }

  const photoPath = saveBase64Image(base64Data, `pedidos/${tipo}`);
  if (!photoPath) {
    res.status(500).json({ success: false, message: 'Não foi possível gravar a foto do pedido.' });
    return;
  }

  res.json({
    success: true,
    data: { path: photoPath }
  });
});

app.all(['/pedidos/append_foto', '/api/pedidos/append_foto'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.pedido_id || body.id || '');
  const foto = body.foto;
  const campo = body.campo || 'coleta_foto';

  const existing = findLocalPedido(targetId);
  if (existing && foto) {
    const list: string[] = [];
    try {
      const val = existing[campo];
      if (typeof val === 'string' && val.trim().startsWith('[')) {
        list.push(...JSON.parse(val));
      } else if (val) {
        list.push(val);
      }
    } catch {}
    list.push(foto);
    existing[campo] = JSON.stringify(list);
    saveLocalPedidos();
    syncPedidoToFirebase(existing);
  }

  res.json({ success: true, data: { path: foto } });
});

app.all(['/pedidos/registrar_presenca', '/api/pedidos/registrar_presenca'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.pedido_id || body.id || '');
  const campo = body.campo;
  const ts = body.timestamp || new Date().toISOString();

  const existing = findLocalPedido(targetId);
  if (existing && campo) {
    existing[campo] = ts;
    saveLocalPedidos();
    syncPedidoToFirebase(existing);
  }

  res.json({ success: true });
});

app.all(['/pedidos/delete', '/api/pedidos/delete'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.pedido_id || body.id || req.query.id || '');
  if (!targetId) {
    res.status(400).json({ success: false, message: 'ID do pedido obrigatório' });
    return;
  }

  const cleanId = targetId.replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
  const idx = localPedidosCache.findIndex(p => String(p.id) === targetId || String(p.id) === cleanId);
  if (idx >= 0) {
    const deleted = localPedidosCache.splice(idx, 1)[0];
    saveLocalPedidos();

    // Remove do Firebase RTDB
    const rtdbUrl = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL;
    if (rtdbUrl && deleted?.id) {
      try {
        const cleanUrl = rtdbUrl.replace(/\/+$/, '');
        await fetch(`${cleanUrl}/pedidos/${deleted.id}.json`, { method: 'DELETE' });
      } catch {}
    }

    res.json({ success: true, message: 'Pedido excluído com sucesso!', id: deleted.id });
  } else {
    res.json({ success: true, message: 'Pedido já não constava na base local' });
  }
});

// =========================================================================
// HANDLERS LOCAIS DE LOCAIS (3636 locais importados + sincronização Firebase)
// =========================================================================
app.all(['/locais', '/api/locais'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const query = req.query;

  const search = String(query.search || body.search || '').toLowerCase().trim();
  const cidade = String(query.cidade || body.cidade || '').toLowerCase().trim();
  const setor = String(query.setor || body.setor || '').toLowerCase().trim();
  const central = query.central_coletas !== undefined ? query.central_coletas : body.central_coletas;

  let all = [...localLocaisCache];

  if (search) {
    all = all.filter(p => 
      (p.name || '').toLowerCase().includes(search) ||
      (p.endereco || '').toLowerCase().includes(search) ||
      (p.rua || '').toLowerCase().includes(search) ||
      (p.setor || '').toLowerCase().includes(search) ||
      (p.cidade || '').toLowerCase().includes(search)
    );
  }

  if (cidade) {
    all = all.filter(p => (p.cidade || '').toLowerCase().includes(cidade));
  }

  if (setor) {
    all = all.filter(p => (p.setor || '').toLowerCase().includes(setor));
  }

  if (central !== undefined && central !== '') {
    const isCentral = central === true || central === 'true' || central === 1 || central === '1';
    all = all.filter(p => Boolean(p.central_coletas) === isCentral);
  }

  const total = all.length;
  const page = Math.max(1, parseInt(String(query.page || body.page), 10) || 1);
  const limit = Math.max(1, parseInt(String(query.limit || body.limit), 10) || 100);
  const start = (page - 1) * limit;
  const paginated = all.slice(start, start + limit);

  res.json({
    success: true,
    data: paginated,
    total
  });
});

app.all(['/locais/centrais', '/api/locais/centrais'], (_req: Request, res: Response) => {
  const centrais = localLocaisCache
    .filter(p => Boolean(p.central_coletas))
    .map(p => ({
      id: p.id,
      name: p.name,
      cidade: p.cidade || 'Goiânia',
      lat: Number(p.lat),
      lng: Number(p.lng)
    }));
  res.json({ success: true, data: centrais });
});

app.all(['/locais/nearby', '/api/locais/nearby'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  const radiusKm = parseFloat(body.radius_km) || 0.5;

  if (isNaN(lat) || isNaN(lng)) {
    res.json({ success: true, data: null });
    return;
  }

  let closest: { local: any; dist: number } | null = null;
  for (const p of localLocaisCache) {
    const pLat = Number(p.lat);
    const pLng = Number(p.lng);
    if (isNaN(pLat) || isNaN(pLng)) continue;

    const dLat = (pLat - lat) * (Math.PI / 180);
    const dLng = (pLng - lng) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat * (Math.PI / 180)) * Math.cos(pLat * (Math.PI / 180)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = 6371 * c;

    if (distKm <= radiusKm) {
      if (!closest || distKm < closest.dist) {
        closest = { local: p, dist: distKm };
      }
    }
  }

  if (closest) {
    res.json({
      success: true,
      data: {
        id: Number(closest.local.id) || 0,
        name: closest.local.name,
        lat: Number(closest.local.lat),
        lng: Number(closest.local.lng),
        dist_km: Math.round(closest.dist * 100) / 100
      }
    });
  } else {
    res.json({ success: true, data: null });
  }
});

app.all(['/locais/buscar_local_link', '/api/locais/buscar_local_link'], (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const link = String(body.link || req.query.link || '').trim();
  const local = localLocaisCache.find(p => p.link && (p.link === link || link.includes(p.link) || p.link.includes(link)));

  if (local) {
    res.json({ success: true, data: local });
  } else {
    res.status(404).json({ success: false, message: 'Local não encontrado para este link' });
  }
});

app.all(['/locais/update', '/api/locais/update'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = String(body.id || '');
  const existingIndex = localLocaisCache.findIndex(p => String(p.id) === targetId);

  if (existingIndex >= 0) {
    const updated = {
      ...localLocaisCache[existingIndex],
      ...body,
      updated_at: new Date().toISOString()
    };
    localLocaisCache[existingIndex] = updated;
    saveLocalLocais();
    syncLocalToFirebase(updated);
    res.json({ success: true, data: updated });
  } else {
    res.status(404).json({ success: false, message: 'Local não encontrado' });
  }
});

app.all(['/locais/save', '/api/locais/save'], async (req: Request, res: Response) => {
  const body = parseRawJsonBody(req);
  const targetId = body.id ? String(body.id) : `loc-${Date.now()}`;
  const newLocal = {
    id: targetId,
    name: body.name || 'Local Sem Nome',
    lat: body.lat || -16.6869,
    lng: body.lng || -49.2648,
    endereco: body.endereco || body.rua || '',
    cidade: body.cidade || 'Goiânia',
    created_at: new Date().toISOString(),
    ...body
  };

  const existingIdx = localLocaisCache.findIndex(p => String(p.id) === targetId);
  if (existingIdx >= 0) {
    localLocaisCache[existingIdx] = newLocal;
  } else {
    localLocaisCache.push(newLocal);
  }

  saveLocalLocais();
  syncLocalToFirebase(newLocal);
  res.json({ success: true, data: newLocal });
});

app.all(['/locais/:id', '/api/locais/:id'], (req: Request, res: Response) => {
  const targetId = String(req.params.id);
  const local = localLocaisCache.find(p => String(p.id) === targetId);
  if (local) {
    res.json({ success: true, data: local });
  } else {
    res.status(404).json({ success: false, message: 'Local não encontrado' });
  }
});

// Registra prefixos principais da API Dotas.online
for (const prefix of PROXY_PREFIXES) {
  app.all(`${prefix}*`, handleProxy);
}
// Registra também qualquer chamada que venha com prefixo /api/*
app.all('/api/*', handleProxy);

async function startServer() {
  if (!isProd) {
    // Modo Desenvolvimento: monta os middlewares do Vite com HMR desabilitado (conforme ambiente de proxy)
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { 
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Modo Produção: serve arquivos estáticos da pasta dist
    const distPath = path.resolve(__dirname, 'dist');
    const assetsPath = path.resolve(distPath, 'assets');

    // Serve /assets com cache imutável de 1 ano e fallthrough desabilitado para evitar 200 HTML em assets inexistentes
    if (fs.existsSync(assetsPath)) {
      app.use('/assets', express.static(assetsPath, {
        maxAge: '1y',
        immutable: true,
        fallthrough: false,
        setHeaders: (res, filePath) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=UTF-8');
          } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
          }
        }
      }));
    }

    // Serve outros estáticos da raiz do dist (favicon, manifest, ícones, service worker)
    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        const basename = path.basename(filePath).toLowerCase();
        // NUNCA faz cache de HTML, sw.js ou manifest para garantir detecção instantânea de atualizações
        if (
          filePath.endsWith('.html') ||
          basename === 'sw.js' ||
          basename.endsWith('.webmanifest') ||
          basename.startsWith('workbox-') ||
          basename.includes('sw')
        ) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));

    app.get('*', (req: Request, res: Response) => {
      // Evita retornar index.html para requisições de arquivos ou rotas com extensão inexistente
      if (req.path.startsWith('/assets/') || (req.path.includes('.') && !req.path.endsWith('.html'))) {
        res.status(404).send('Not Found');
        return;
      }
      res.setHeader('Content-Security-Policy', "frame-ancestors *;");
      res.removeHeader('X-Frame-Options');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[EncomendasZap Server] Rodando na porta ${PORT} com WebSocket ativo (${isProd ? 'produção' : 'desenvolvimento'})`);
  });
}

startServer().catch((err) => {
  console.error('[EncomendasZap Server] Falha crítica ao inicializar servidor:', err);
  process.exit(1);
});
