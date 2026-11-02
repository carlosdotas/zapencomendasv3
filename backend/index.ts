import dotenv from 'dotenv';
dotenv.config();

process.env.DISABLE_HMR = 'true';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'mysql://root:password@127.0.0.1:3306/encomendaszap';
}

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer } from 'ws';
import { registerApiRoutes, parseRawJsonBody } from './routes';
import { registerRealtime } from './realtime';
import { registerNotifications } from './notifications';
import { registerGoogleRoutes } from './google';
import { prisma } from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, '..');

const isProd =
  process.env.NODE_ENV === 'production' ||
  process.argv.includes('--prod') ||
  (fs.existsSync(path.resolve(ROOT_DIR, 'dist', 'index.html')) && process.env.npm_lifecycle_event !== 'dev');

const getPort = (): number => {
  const argIdx = process.argv.indexOf('--port');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return parseInt(process.argv[argIdx + 1], 10);
  }
  if (!isProd) {
    return 3000;
  }
  return parseInt(process.env.PORT || '3000', 10);
};

const PORT = getPort();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const viteWss = new WebSocketServer({
  noServer: true,
  handleProtocols: protocols => {
    if (protocols && typeof protocols.has === 'function' && protocols.has('vite-hmr')) return 'vite-hmr';
    return Array.from(protocols || [])[0] || 'vite-hmr';
  }
});

server.on('upgrade', (request, socket, head) => {
  const pathname = (request.url || '/').split('?')[0];
  if (pathname === '/ws/tracking') {
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  } else {
    // Evita 'WebSocket closed without opened' para o HMR do Vite e outros clientes
    viteWss.handleUpgrade(request, socket, head, ws => viteWss.emit('connection', ws, request));
  }
});

viteWss.on('connection', ws => {
  try {
    ws.send(JSON.stringify({ type: 'connected' }));
  } catch {
    // conexão já encerrada
  }
  ws.on('message', data => {
    try {
      if (JSON.parse(data.toString()).type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch {
      // mensagem inválida
    }
  });
  ws.on('error', () => {});
});

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-Role');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *;');
  res.setHeader('Permissions-Policy', 'geolocation=*, accelerometer=*, gyroscope=*');
  res.setHeader('Feature-Policy', 'geolocation *; accelerometer *; gyroscope *');
  res.removeHeader('X-Frame-Options');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.raw({ type: '*/*', limit: '50mb' }));

// Aviso sem dados ("há mudanças") para todos os apps conectados: eles buscam a lista pela API autenticada
let ordersPingTimer: NodeJS.Timeout | null = null;
const notifyOrdersChanged = () => {
  const payload = JSON.stringify({ type: 'orders:changed', at: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState !== 1) return;
    try {
      client.send(payload);
    } catch (error) {
      console.warn('[Realtime Orders] Falha ao avisar cliente:', error);
    }
  });
};
app.use((req: Request, res: Response, next: NextFunction) => {
  const isSaveOrderRoute = /^\/(api\/)?pedidos\/save(?:_pedido)?\/?$/.test(req.path);
  if (!isSaveOrderRoute && req.method === 'POST' && /^\/(api\/)?(pedidos|realtime)\/(?!list|get|presenca|upload|tracking)/.test(req.path)) {
    res.on('finish', () => {
      if (res.statusCode >= 400 || ordersPingTimer) return;
      ordersPingTimer = setTimeout(() => {
        ordersPingTimer = null;
        const payload = JSON.stringify({ type: 'orders:changed', at: Date.now() });
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(payload);
        });
      }, 150);
    });
  }
  next();
});

// ---------------------------------------------------------------------------
// Uploads de imagens
// ---------------------------------------------------------------------------
const UPLOADS_DIR = path.resolve(BACKEND_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function saveBase64Image(dataUrl: string, subfolder = 'users'): string | null {
  try {
    const match = typeof dataUrl === 'string' ? dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/) : null;
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1].replace(/[^a-z0-9]/gi, '');
    const safeFolder = subfolder.split('/').map(p => p.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean).join('/') || 'users';
    const targetDir = path.resolve(UPLOADS_DIR, safeFolder);
    fs.mkdirSync(targetDir, { recursive: true });
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(targetDir, filename), Buffer.from(match[2], 'base64'));
    return `/uploads/${safeFolder}/${filename}`;
  } catch (err) {
    console.error('Erro ao salvar imagem base64 no disco:', err);
    return null;
  }
}

const PHP_IMAGE_SERVER_URL = (process.env.IMAGE_SERVER_URL || '').trim().replace(/\/+$/, '');
const PHP_IMAGE_SERVER_PASSWORD = process.env.IMAGE_SERVER_PASSWORD || '';
const imageServerConfigured = () => !!PHP_IMAGE_SERVER_URL && !!PHP_IMAGE_SERVER_PASSWORD;

async function uploadToPhpServer(dataUrl: string, tipo = 'perfil'): Promise<string | null> {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || !imageServerConfigured()) return null;
    const sep = PHP_IMAGE_SERVER_URL.includes('?') ? '&' : '?';
    const response = await fetch(`${PHP_IMAGE_SERVER_URL}${sep}action=upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Password': PHP_IMAGE_SERVER_PASSWORD },
      body: JSON.stringify({ image: dataUrl, tipo, password: PHP_IMAGE_SERVER_PASSWORD })
    });
    if (!response.ok) {
      console.warn(`[server] PHP upload retornou status ${response.status}`);
      return null;
    }
    const result: any = await response.json();
    if (result?.success && (result.url || result.filename)) {
      const filename = result.filename || result.url?.match(/[?&]f=([^&#]+)/)?.[1] || '';
      return filename ? `${PHP_IMAGE_SERVER_URL.split('?')[0]}?f=${encodeURIComponent(filename)}` : result.url;
    }
  } catch (err) {
    console.warn('[server] Erro ao comunicar com servidor PHP de fotos:', err);
  }
  return null;
}

app.use(['/uploads', '/api/uploads'], (req: Request, res: Response, next: NextFunction) => {
  const relativePath = req.path.replace(/^\/+/, '');
  const localFilePath = path.resolve(UPLOADS_DIR, relativePath);
  if (!localFilePath.startsWith(UPLOADS_DIR + path.sep)) {
    res.status(403).send('Forbidden');
    return;
  }
  const isFile = (p: string) => fs.existsSync(p) && fs.statSync(p).isFile();
  const withoutVariant = localFilePath.replace(/_(icon|thumb|md|lg)\.(jpe?g|png|webp)$/i, '.$2');
  const candidate = [localFilePath, withoutVariant, `${localFilePath}.jpg`].find(isFile);
  if (candidate) {
    res.sendFile(candidate);
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Utilitários e servidor de imagens
// ---------------------------------------------------------------------------
const APP_BUILD_ID = process.env.APP_BUILD_ID || `build-${Date.now()}`;

app.get('/api/app-version', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ buildId: APP_BUILD_ID, timestamp: new Date().toISOString(), isProd });
});

app.get('/api/image-server-config', (_req: Request, res: Response) => {
  res.json({ success: true, data: { url: PHP_IMAGE_SERVER_URL } });
});

const imageServerGuard = (res: Response): boolean => {
  if (imageServerConfigured()) return true;
  res.status(503).json({ success: false, message: 'Configure IMAGE_SERVER_URL e IMAGE_SERVER_PASSWORD no .env do servidor.' });
  return false;
};

app.get('/api/image-server/ping', async (_req: Request, res: Response) => {
  if (!imageServerGuard(res)) return;
  try {
    const target = new URL(PHP_IMAGE_SERVER_URL);
    target.searchParams.set('action', 'ping');
    const response = await fetch(target, { headers: { 'X-Access-Password': PHP_IMAGE_SERVER_PASSWORD } });
    res.status(response.status).json(await response.json());
  } catch (error) {
    res.status(502).json({ success: false, message: error instanceof Error ? error.message : 'Falha ao conectar com o servidor PHP.' });
  }
});

app.get('/api/image-server/list', async (req: Request, res: Response) => {
  if (!imageServerGuard(res)) return;
  try {
    const target = new URL(PHP_IMAGE_SERVER_URL);
    target.searchParams.set('action', 'list');
    target.searchParams.set('password', PHP_IMAGE_SERVER_PASSWORD);
    for (const key of ['page', 'limit', 'sort', 'date_from', 'date_to']) {
      const value = req.query[key];
      if (typeof value === 'string' && value) target.searchParams.set(key, value);
    }
    const response = await fetch(target);
    res.status(response.status).json(await response.json());
  } catch (error) {
    res.status(502).json({ success: false, message: error instanceof Error ? error.message : 'Falha ao carregar as imagens.' });
  }
});

app.post('/api/image-server/delete', async (req: Request, res: Response) => {
  if (!imageServerGuard(res)) return;
  const filename = path.basename(String(parseRawJsonBody(req).filename || ''));
  if (!filename) {
    res.status(400).json({ success: false, message: 'Arquivo não informado.' });
    return;
  }
  try {
    const target = new URL(PHP_IMAGE_SERVER_URL);
    target.searchParams.set('action', 'delete');
    target.searchParams.set('password', PHP_IMAGE_SERVER_PASSWORD);
    target.searchParams.set('f', filename);
    const response = await fetch(target, { method: 'POST' });
    res.status(response.status).json(await response.json());
  } catch (error) {
    res.status(502).json({ success: false, message: error instanceof Error ? error.message : 'Falha ao excluir a imagem.' });
  }
});

// ---------------------------------------------------------------------------
// Rotas da aplicação
// ---------------------------------------------------------------------------
registerGoogleRoutes(app, BACKEND_DIR);
registerApiRoutes(app, { saveBase64Image, uploadToPhpServer, imageServerConfigured, notifyOrdersChanged });

async function startServer() {
  try {
    await registerRealtime(app, wss);
  } catch (err: any) {
    console.warn('[EncomendasZap Server] Aviso ao registrar realtime:', err?.message || err);
  }
  registerNotifications(app);

  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({ success: false, message: `Endpoint não encontrado: ${req.path}` });
  });

  if (!isProd) {
    process.env.DISABLE_HMR = 'true';
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(ROOT_DIR, 'dist');
    const assetsPath = path.resolve(distPath, 'assets');

    if (fs.existsSync(assetsPath)) {
      app.use('/assets', express.static(assetsPath, {
        maxAge: '1y',
        immutable: true,
        fallthrough: false,
        setHeaders: (res, filePath) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=UTF-8');
          else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        }
      }));
    }

    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        const basename = path.basename(filePath).toLowerCase();
        // Nunca faz cache de HTML, service worker e manifest para detectar atualizações na hora
        if (filePath.endsWith('.html') || basename === 'sw.js' || basename.endsWith('.webmanifest') || basename.startsWith('workbox-') || basename.includes('sw')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));

    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/assets/') || (req.path.includes('.') && !req.path.endsWith('.html'))) {
        res.status(404).send('Not Found');
        return;
      }
      res.setHeader('Content-Security-Policy', 'frame-ancestors *;');
      res.removeHeader('X-Frame-Options');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  if (!server.listening) {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[EncomendasZap Server] Rodando na porta ${PORT} com WebSocket ativo (${isProd ? 'produção' : 'desenvolvimento'})`);
    });
  }
}

startServer().catch(err => {
  console.error('[EncomendasZap Server] Aviso na inicialização:', err);
  if (!server.listening) {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[EncomendasZap Server] Rodando na porta ${PORT} em modo de recuperação`);
    });
  }
});
