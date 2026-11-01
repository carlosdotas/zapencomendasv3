import fs from 'fs';
import readline from 'readline';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';

const serverFirebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'zapencomendas-507212',
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBRAUyrUVl7bPXGeYGf6bEOtrUDtLP3Ir8',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'zapencomendas-507212.firebaseapp.com',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'zapencomendas-507212.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '661076087159',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:661076087159:web:44d7c03ae20aea5ed75172'
};

function parseSqlValues(line: string): (string | null)[] {
  let str = line.trim();
  if (str.startsWith('(')) str = str.substring(1);
  if (str.endsWith('),')) str = str.slice(0, -2);
  else if (str.endsWith(');')) str = str.slice(0, -2);
  else if (str.endsWith(')')) str = str.slice(0, -1);

  const values: string[] = [];
  let inString = false;
  let escape = false;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      current += char;
      escape = false;
    } else if (char === '\\') {
      escape = true;
    } else if (char === "'") {
      inString = !inString;
    } else if (char === ',' && !inString) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values.map(v => {
    if (v === 'NULL') return null;
    if (v.startsWith("'") && v.endsWith("'")) {
      return v.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
    return v;
  });
}

function cleanCityName(str?: string | null): string | null {
  if (!str) return null;
  let s = str.trim();
  if (!s || s === 'NULL') return null;
  if (/Leopoldo de Bulh/i.test(s)) return 'Leopoldo de Bulhões';
  if (/Aparecida de Goi/i.test(s)) return 'Aparecida de Goiânia';
  if (/Goi[âa]nia/i.test(s)) return 'Goiânia';
  if (/An[áa]polis/i.test(s)) return 'Anápolis';
  if (/Silv[âa]nia/i.test(s)) return 'Silvânia';
  if (/Bonfin[óo]polis/i.test(s)) return 'Bonfinópolis';
  if (/Senador Canedo/i.test(s)) return 'Senador Canedo';
  if (/Vian[óo]polis/i.test(s)) return 'Vianópolis';
  if (/Goianira/i.test(s)) return 'Goianira';
  if (/Trindade/i.test(s)) return 'Trindade';
  if (/Ner[óo]polis/i.test(s)) return 'Nerópolis';
  if (/Gameleira/i.test(s)) return 'Gameleira de Goiás';
  if (/S[ãa]o Paulo/i.test(s)) return 'São Paulo';
  if (/Bras[íi]lia/i.test(s)) return 'Brasília';
  if (s.length <= 40 && !s.includes(',') && !s.includes('http')) return s;
  return null;
}

function cleanDigits(val?: string | null): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function formatCpf(digits: string): string {
  if (digits.length !== 11) return digits;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCnpj(digits: string): string {
  if (digits.length !== 14) return digits;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function fixMojibake(str?: string | null): string | null {
  if (!str) return null;
  return str
    .replace(/Leopoldo de Bulh[\s\S]{1,6}es/gi, 'Leopoldo de Bulhões')
    .replace(/Goi[\s\S]{1,4}nia/gi, 'Goiânia')
    .replace(/An[\s\S]{1,4}polis/gi, 'Anápolis')
    .replace(/S[\s\S]{1,4}o Paulo/gi, 'São Paulo')
    .replace(/Silv[\s\S]{1,4}nia/gi, 'Silvânia')
    .replace(/Bonfin[\s\S]{1,4}polis/gi, 'Bonfinópolis')
    .replace(/Aparecida de Goi[\s\S]{1,4}nia/gi, 'Aparecida de Goiânia')
    .replace(/Senador Canedo/gi, 'Senador Canedo')
    .replace(/Vian[\s\S]{1,4}polis/gi, 'Vianópolis')
    .replace(/Gameleira de Goi[\s\S]{1,4}s/gi, 'Gameleira de Goiás');
}

interface SqlUser {
  id: number;
  name: string;
  phone: string;
  access_level: string;
  created_at: string;
  updated_at: string;
  city: string | null;
  cpf: string | null;
  full_name: string | null;
  photo: string | null;
  cnpj: string | null;
  person_type: string;
}

async function main() {
  console.log('=== Início da importação de cidades, CPF e CNPJ do SQL para o Firebase ===');

  const sqlPath = 'u195978639_dotas.sql';
  if (!fs.existsSync(sqlPath)) {
    console.error(`Arquivo SQL não encontrado: ${sqlPath}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(sqlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let inTable: string | null = null;
  const sqlUsers: SqlUser[] = [];
  const locationsMap = new Map<string, string>(); // phoneDigits -> city
  const ordersCityStats = new Map<string, Record<string, number>>(); // key -> { city: count }

  console.log('Lendo arquivo SQL u195978639_dotas.sql...');

  for await (const line of rl) {
    if (line.includes('INSERT INTO `users`')) {
      inTable = 'users';
      continue;
    } else if (line.includes('INSERT INTO `locations`') || line.includes('INSERT INTO `locais`')) {
      inTable = 'locations';
      continue;
    } else if (line.includes('INSERT INTO `orders`')) {
      inTable = 'orders';
      continue;
    }

    if (inTable) {
      if (line.endsWith(';') || line.includes('ENABLE KEYS')) {
        inTable = null;
        continue;
      }
      const trimmed = line.trim();
      if (!trimmed.startsWith('(')) continue;

      if (inTable === 'users') {
        const vals = parseSqlValues(trimmed);
        const [id, name, phone, pass, access_level, created_at, updated_at, city, cpf, full_name, photo, cnpj, person_type] = vals;
        sqlUsers.push({
          id: Number(id),
          name: fixMojibake(name) || '',
          phone: phone || '',
          access_level: access_level || 'cliente',
          created_at: created_at || new Date().toISOString(),
          updated_at: updated_at || new Date().toISOString(),
          city: cleanCityName(city),
          cpf: cpf ? cpf.trim() : null,
          full_name: fixMojibake(full_name),
          photo: photo || null,
          cnpj: cnpj ? cnpj.trim() : null,
          person_type: person_type || 'fisica'
        });
      } else if (inTable === 'locations') {
        const vals = parseSqlValues(trimmed);
        let city: string | null = null;
        let phone: string | null = null;
        if (vals.length >= 18) {
          city = cleanCityName(vals[4]) || cleanCityName(vals[5]);
          phone = vals[17] || vals[11];
        }
        if (city && phone) {
          const d = cleanDigits(phone);
          if (d.length >= 8) locationsMap.set(d, city);
        }
      } else if (inTable === 'orders') {
        const vals = parseSqlValues(trimmed);
        const clientName = vals[8];
        const contactPhone = vals[9];
        const clientId = vals[10];
        const origCity = cleanCityName(vals[19]);
        const destCity = cleanCityName(vals[28]);

        const city = origCity || destCity;
        if (city) {
          const addStat = (key: string) => {
            if (!ordersCityStats.has(key)) ordersCityStats.set(key, {});
            const st = ordersCityStats.get(key)!;
            st[city] = (st[city] || 0) + 1;
          };
          if (clientId) addStat(`id:${clientId}`);
          if (contactPhone) {
            const d = cleanDigits(contactPhone);
            if (d.length >= 8) addStat(`phone:${d}`);
          }
          if (clientName) addStat(`name:${clientName.toLowerCase().trim()}`);
        }
      }
    }
  }

  console.log(`✓ Parse do SQL concluído com sucesso:`);
  console.log(`  - Usuários no SQL: ${sqlUsers.length}`);
  console.log(`  - Mapeamentos de locais por telefone: ${locationsMap.size}`);
  console.log(`  - Chaves de cidades por pedidos: ${ordersCityStats.size}`);

  // Carrega importedUsers.json atual
  const jsonPath = 'src/data/importedUsers.json';
  let importedUsers: any[] = [];
  if (fs.existsSync(jsonPath)) {
    importedUsers = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  console.log(`  - Usuários atuais em importedUsers.json: ${importedUsers.length}`);

  let updatedCityCount = 0;
  let updatedTaxCount = 0;
  let addedUsersCount = 0;

  // Processa e atualiza usuários existentes
  for (const user of importedUsers) {
    const userPhoneDigits = cleanDigits(user.phone);
    const userIdStr = String(user.id);
    const userName = (user.name || '').toLowerCase().trim();

    // Busca usuário correspondente no SQL
    const sqlU = sqlUsers.find(su => {
      if (String(su.id) === userIdStr) return true;
      const suPhoneDigits = cleanDigits(su.phone);
      if (userPhoneDigits && suPhoneDigits && (userPhoneDigits === suPhoneDigits || userPhoneDigits.endsWith(suPhoneDigits) || suPhoneDigits.endsWith(userPhoneDigits))) return true;
      if (userName && su.name && userName === su.name.toLowerCase().trim()) return true;
      return false;
    });

    let newCity: string | null = null;
    let newCpf: string | null = null;
    let newCnpj: string | null = null;

    if (sqlU) {
      if (sqlU.city) newCity = sqlU.city;
      if (sqlU.full_name && (!user.name_completo || user.name_completo === user.name)) {
        user.name_completo = sqlU.full_name;
      }
      if (sqlU.cnpj) {
        const d = cleanDigits(sqlU.cnpj);
        if (d.length === 14) newCnpj = formatCnpj(d);
        else newCnpj = sqlU.cnpj;
      }
      if (sqlU.cpf) {
        const d = cleanDigits(sqlU.cpf);
        if (d.length === 14) newCnpj = formatCnpj(d);
        else if (d.length === 11) newCpf = formatCpf(d);
        else newCpf = sqlU.cpf;
      }
    }

    // Se ainda não tem cidade ou se a cidade atual era um endereço complexo ou mojibake
    if (!newCity && (!user.cidade || cleanCityName(user.cidade) !== user.cidade)) {
      if (userPhoneDigits && locationsMap.has(userPhoneDigits)) {
        newCity = locationsMap.get(userPhoneDigits)!;
      }
    }

    if (!newCity && (!user.cidade || cleanCityName(user.cidade) !== user.cidade)) {
      const stats = ordersCityStats.get(`id:${user.id}`) ||
                    (userPhoneDigits ? ordersCityStats.get(`phone:${userPhoneDigits}`) : null) ||
                    ordersCityStats.get(`name:${userName}`);
      if (stats) {
        const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) newCity = sorted[0][0];
      }
    }

    // Normaliza a cidade existente se já existia
    if (!newCity && user.cidade) {
      const cleaned = cleanCityName(user.cidade);
      if (cleaned && cleaned !== user.cidade) {
        user.cidade = cleaned;
        user.city = cleaned;
        updatedCityCount++;
      }
    }

    if (newCity && user.cidade !== newCity) {
      user.cidade = newCity;
      user.city = newCity;
      updatedCityCount++;
    }

    // Normaliza e distribui CPF e CNPJ
    if (newCnpj && user.cnpj !== newCnpj) {
      user.cnpj = newCnpj;
      user.person_type = 'juridica';
      updatedTaxCount++;
    }
    if (newCpf && user.cpf !== newCpf) {
      user.cpf = newCpf;
      user.person_type = 'fisica';
      updatedTaxCount++;
    }

    // Se o CPF gravado na verdade é um CNPJ (14 dígitos)
    if (user.cpf) {
      const cd = cleanDigits(user.cpf);
      if (cd.length === 14) {
        user.cnpj = formatCnpj(cd);
        user.cpf = null;
        user.person_type = 'juridica';
        updatedTaxCount++;
      } else if (cd.length === 11) {
        user.cpf = formatCpf(cd);
        user.person_type = 'fisica';
      }
    }
    if (user.cnpj) {
      const cd = cleanDigits(user.cnpj);
      if (cd.length === 14) {
        user.cnpj = formatCnpj(cd);
        user.person_type = 'juridica';
      }
    }
  }

  // Verifica se há usuários no SQL que não estão em importedUsers e possuem dados válidos
  const existingIds = new Set(importedUsers.map(u => String(u.id)));
  const existingPhones = new Set(importedUsers.map(u => cleanDigits(u.phone)).filter(Boolean));

  for (const su of sqlUsers) {
    const suPhoneDigits = cleanDigits(su.phone);
    const found = existingIds.has(String(su.id)) ||
      (suPhoneDigits && (existingPhones.has(suPhoneDigits) || [...existingPhones].some(p => p.endsWith(suPhoneDigits) || suPhoneDigits.endsWith(p))));

    if (!found && (su.city || su.cpf || su.cnpj)) {
      let cpfVal: string | null = null;
      let cnpjVal: string | null = null;
      if (su.cnpj) {
        const d = cleanDigits(su.cnpj);
        cnpjVal = d.length === 14 ? formatCnpj(d) : su.cnpj;
      }
      if (su.cpf) {
        const d = cleanDigits(su.cpf);
        if (d.length === 14) cnpjVal = formatCnpj(d);
        else if (d.length === 11) cpfVal = formatCpf(d);
        else cpfVal = su.cpf;
      }

      const newUser = {
        id: su.id,
        name: su.name || 'Cliente Sem Nome',
        phone: su.phone,
        access_level: su.access_level || 'cliente',
        name_completo: su.full_name || su.name,
        cidade: su.city,
        city: su.city,
        cpf: cpfVal,
        cnpj: cnpjVal,
        person_type: cnpjVal ? 'juridica' : 'fisica',
        cliente_especial: 0,
        paga_semanal: 0,
        locais_id: null,
        foto: su.photo,
        created_at: su.created_at,
        pendencias: 0,
        local_name: null,
        source: 'imported_from_sql',
        pedidos_count: 0,
        order_count: 0
      };

      importedUsers.push(newUser);
      existingIds.add(String(su.id));
      if (suPhoneDigits) existingPhones.add(suPhoneDigits);
      addedUsersCount++;
    }
  }

  // Salva arquivo local atualizado
  fs.writeFileSync(jsonPath, JSON.stringify(importedUsers, null, 2), 'utf8');
  console.log(`✓ Arquivo ${jsonPath} salvo com sucesso!`);
  console.log(`  - Cidades enriquecidas/limpas: ${updatedCityCount}`);
  console.log(`  - CPF/CNPJ enriquecidos/padronizados: ${updatedTaxCount}`);
  console.log(`  - Novos clientes do SQL incorporados: ${addedUsersCount}`);
  console.log(`  - Total geral de clientes na base: ${importedUsers.length}`);

  const withCity = importedUsers.filter(u => u.cidade || u.city);
  const withTax = importedUsers.filter(u => u.cpf || u.cnpj);
  console.log(`  - Clientes com CIDADE: ${withCity.length} (${((withCity.length / importedUsers.length) * 100).toFixed(1)}%)`);
  console.log(`  - Clientes com CPF ou CNPJ: ${withTax.length} (${((withTax.length / importedUsers.length) * 100).toFixed(1)}%)`);

  // Conecta ao Firestore e realiza upload em lote
  console.log('\nConectando ao Firebase Firestore (default)...');
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(serverFirebaseConfig);
  const db = getFirestore(app, '(default)');

  // Filtrar todos os usuários que possuem ID válido para sincronização no Firestore
  // Priorizar sincronizar todos os que têm cidade, cpf, cnpj ou atualizações
  const usersToSync = importedUsers.filter(u => u && u.id !== undefined && u.id !== null);
  console.log(`Iniciando envio em lote de ${usersToSync.length} clientes para a coleção 'users' do Firestore...`);

  const BATCH_SIZE = 300;
  let batchCount = 0;
  let syncedCount = 0;

  for (let i = 0; i < usersToSync.length; i += BATCH_SIZE) {
    const chunk = usersToSync.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const u of chunk) {
      const docRef = doc(db, 'users', String(u.id));
      const payload: Record<string, any> = {
        id: u.id,
        name: u.name || '',
        phone: u.phone || '',
        access_level: u.access_level || 'cliente',
        updated_at: new Date().toISOString()
      };

      if (u.name_completo) payload.name_completo = u.name_completo;
      if (u.cidade) {
        payload.cidade = u.cidade;
        payload.city = u.cidade;
      }
      if (u.city && !payload.city) payload.city = u.city;
      if (u.cpf) payload.cpf = u.cpf;
      if (u.cnpj) payload.cnpj = u.cnpj;
      if (u.person_type) payload.person_type = u.person_type;
      if (u.cliente_especial !== undefined) payload.cliente_especial = u.cliente_especial;
      if (u.paga_semanal !== undefined) payload.paga_semanal = u.paga_semanal;
      if (u.pedidos_count !== undefined) payload.pedidos_count = u.pedidos_count;
      if (u.order_count !== undefined) payload.order_count = u.order_count;
      if (u.foto) payload.foto = u.foto;

      batch.set(docRef, payload, { merge: true });
    }

    await batch.commit();
    batchCount++;
    syncedCount += chunk.length;
    console.log(`  ✓ Lote #${batchCount}: ${syncedCount}/${usersToSync.length} clientes gravados no Firestore.`);
  }

  console.log('\n🎉 SINCRONIZAÇÃO COMPLETA COM O FIREBASE!');
  console.log(`Total de ${syncedCount} registros de clientes sincronizados no Firestore com cidade, CPF e CNPJ.`);
}

main().catch(err => {
  console.error('Erro durante a importação:', err);
  process.exit(1);
});
