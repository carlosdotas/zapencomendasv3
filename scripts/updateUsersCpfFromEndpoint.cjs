const fs = require('fs');
const path = require('path');

const USERS_FILE = path.resolve(__dirname, '../src/data/importedUsers.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchUserWithCpf(id) {
  try {
    const res = await fetch('https://dotas.online/users/get', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ id })
    });

    if (!res.ok) return null;
    const json = await res.json();
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    return data || null;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('======================================================');
  console.log('Importando CPFs dos Clientes/Usuários via /users/get...');
  console.log('======================================================');

  if (!fs.existsSync(USERS_FILE)) {
    console.error('Arquivo importedUsers.json não encontrado!');
    return;
  }

  const raw = fs.readFileSync(USERS_FILE, 'utf-8');
  const users = JSON.parse(raw);
  console.log(`Total de usuários para processar: ${users.length}`);

  let updatedCount = 0;
  const CONCURRENCY = 15;
  
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const chunk = users.slice(i, i + CONCURRENCY);
    const promises = chunk.map(async (user) => {
      const remote = await fetchUserWithCpf(user.id);
      if (remote) {
        let changed = false;
        if (remote.cpf && remote.cpf.trim()) {
          user.cpf = remote.cpf.trim();
          changed = true;
        }
        if (remote.name_completo && remote.name_completo.trim()) {
          user.name_completo = remote.name_completo.trim();
          changed = true;
        }
        if (remote.cidade && remote.cidade.trim() && !user.cidade) {
          user.cidade = remote.cidade.trim();
          changed = true;
        }
        if (changed) {
          updatedCount++;
        }
      }
    });

    await Promise.all(promises);
    if ((i + CONCURRENCY) % 150 === 0 || i + CONCURRENCY >= users.length) {
      console.log(`Processados ${Math.min(i + CONCURRENCY, users.length)} / ${users.length}... (CPFs encontrados até agora: ${updatedCount})`);
    }
    await sleep(40);
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  console.log('======================================================');
  console.log(`SUCESSO! Arquivo ${USERS_FILE} atualizado.`);
  console.log(`Total com CPF/Documento recuperado: ${updatedCount} de ${users.length}`);
  console.log('======================================================');
}

main();
