import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_API = (process.env.DOTAS_API_URL || 'https://dotas.online').replace(/\/+$/, '');
const OUTPUT_FILE = path.resolve(__dirname, '../src/data/importedUsers.json');

export interface ImportedBackendUser {
  id: number | string;
  name: string;
  phone: string;
  access_level: string;
  name_completo?: string;
  cpf?: string;
  cidade?: string | null;
  cliente_especial?: number | boolean;
  paga_semanal?: number | boolean;
  locais_id?: number | string | null;
  foto?: string | null;
  created_at?: string;
  pendencias?: number;
  local_name?: string | null;
  updated_at?: string;
  source?: string;
}

async function fetchPage(page: number, limit = 200): Promise<{ data: any[]; total: number }> {
  const url = `${TARGET_API}/users/list`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ page, limit })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const data = json.data || (Array.isArray(json) ? json : []);
    const total = json.total || data.length;
    return { data, total };
  } catch (err: any) {
    console.error(`Erro ao buscar página ${page}:`, err.message);
    return { data: [], total: 0 };
  }
}

async function fetchCompactUsers(): Promise<any[]> {
  const url = `${TARGET_API}/pedidos/list_users`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ limit: 1000 })
    });

    if (!res.ok) return [];
    const json = await res.json();
    return json.data || (Array.isArray(json) ? json : []);
  } catch (err: any) {
    console.warn('Aviso: endpoint /pedidos/list_users indisponível ou vazio:', err.message);
    return [];
  }
}

async function syncWithFirebase(users: ImportedBackendUser[]) {
  const rtdbUrl = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL;
  if (!rtdbUrl) {
    console.log('[Firebase Sync] Nenhuma URL do Firebase Realtime Database detectada em VITE_FIREBASE_DATABASE_URL.');
    console.log('[Firebase Sync] Usuários salvos localmente em src/data/importedUsers.json e prontos para sincronização automática pelo app!');
    return;
  }

  const cleanUrl = rtdbUrl.replace(/\/+$/, '');
  console.log(`[Firebase Sync] Sincronizando ${users.length} usuários com Firebase Realtime Database (${cleanUrl})...`);

  try {
    // Sincroniza em lotes para não estourar payload
    const userDict: Record<string, ImportedBackendUser> = {};
    for (const u of users) {
      userDict[String(u.id)] = u;
    }

    const res = await fetch(`${cleanUrl}/users.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userDict)
    });

    if (res.ok) {
      console.log(`[Firebase Sync] Sucesso! ${users.length} usuários sincronizados com ${cleanUrl}/users.json`);
    } else {
      console.warn(`[Firebase Sync] Resposta do Firebase RTDB HTTP ${res.status}: ${res.statusText}`);
    }
  } catch (e: any) {
    console.warn('[Firebase Sync] Aviso ao sincronizar com Firebase:', e.message);
  }
}

async function main() {
  console.log('=====================================================');
  console.log('Iniciando Importação Completa de Usuários para Firebase');
  console.log(`Endpoint de origem: ${TARGET_API}/users/list`);
  console.log('=====================================================');

  const usersMap = new Map<string | number, ImportedBackendUser>();
  let currentPage = 1;
  const limit = 200;
  let hasMore = true;

  while (hasMore) {
    console.log(`Buscando lote da página ${currentPage} (limite ${limit})...`);
    const { data, total } = await fetchPage(currentPage, limit);

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    for (const raw of data) {
      if (!raw || raw.id === undefined || raw.id === null) continue;
      const user: ImportedBackendUser = {
        id: raw.id,
        name: (raw.name || '').trim(),
        phone: (raw.phone || '').trim(),
        access_level: (raw.access_level || 'cliente').toLowerCase(),
        name_completo: raw.name_completo ? raw.name_completo.trim() : (raw.name || '').trim(),
        cpf: raw.cpf ? raw.cpf.trim() : undefined,
        cidade: raw.cidade !== undefined ? raw.cidade : null,
        cliente_especial: raw.cliente_especial || 0,
        paga_semanal: raw.paga_semanal || 0,
        locais_id: raw.locais_id ?? null,
        foto: raw.foto ?? null,
        created_at: raw.created_at || new Date().toISOString(),
        pendencias: raw.pendencias || 0,
        local_name: raw.local_name ?? null,
        source: 'imported_from_api'
      };
      usersMap.set(user.id, user);
    }

    console.log(`  -> Página ${currentPage}: carregou ${data.length} usuários. Total acumulado: ${usersMap.size} de ${total}`);

    if (usersMap.size >= total || data.length < limit) {
      hasMore = false;
    } else {
      currentPage++;
    }
  }

  // Tenta complementar com pedidos/list_users se houver dados extras
  try {
    const compactUsers = await fetchCompactUsers();
    if (compactUsers.length > 0) {
      console.log(`Enriquecendo com ${compactUsers.length} registros de /pedidos/list_users...`);
      for (const cu of compactUsers) {
        if (!cu || !cu.id) continue;
        if (usersMap.has(cu.id)) {
          const existing = usersMap.get(cu.id)!;
          if (!existing.cpf && cu.cpf) existing.cpf = cu.cpf.trim();
          if (cu.name_completo && cu.name_completo.length > (existing.name_completo?.length || 0)) {
            existing.name_completo = cu.name_completo.trim();
          }
        } else {
          usersMap.set(cu.id, {
            id: cu.id,
            name: (cu.name || '').trim(),
            phone: (cu.phone || '').trim(),
            access_level: (cu.access_level || 'cliente').toLowerCase(),
            name_completo: (cu.name_completo || cu.name || '').trim(),
            cpf: cu.cpf ? cu.cpf.trim() : undefined,
            cidade: cu.cidade || null,
            created_at: cu.created_at || new Date().toISOString(),
            source: 'compact_list'
          });
        }
      }
    }
  } catch (e: any) {
    console.log('Sem dados extras de /pedidos/list_users.');
  }

  const allUsers = Array.from(usersMap.values());
  allUsers.sort((a, b) => {
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  console.log('-----------------------------------------------------');
  console.log(`Total de usuários únicos importados: ${allUsers.length}`);

  const roleCounts: Record<string, number> = {};
  for (const u of allUsers) {
    roleCounts[u.access_level] = (roleCounts[u.access_level] || 0) + 1;
  }
  console.log('Distribuição por nível de acesso:', JSON.stringify(roleCounts, null, 2));

  // Salva no arquivo local JSON como base
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allUsers, null, 2), 'utf-8');
  console.log(`Arquivo salvo com sucesso em: ${OUTPUT_FILE}`);

  // Sincroniza com Firebase se configurado
  await syncWithFirebase(allUsers);

  console.log('=====================================================');
  console.log('Importação concluída com sucesso!');
  console.log('=====================================================');
}

main().catch((err) => {
  console.error('Erro fatal na importação:', err);
  process.exit(1);
});
