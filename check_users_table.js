import fs from 'fs';
import readline from 'readline';

async function checkUsersTable() {
  const fileStream = fs.createReadStream('u195978639_dotas.sql');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let inUsers = false;
  let countWithCpf = 0;
  let countWithCnpj = 0;
  let totalUsers = 0;
  const samplesWithDoc = [];

  for await (const line of rl) {
    if (line.startsWith('INSERT INTO `users`')) {
      inUsers = true;
      continue;
    }
    if (inUsers) {
      if (line.startsWith('INSERT INTO `') || line.startsWith('CREATE TABLE `')) {
        inUsers = false;
        continue;
      }

      totalUsers++;
      // columns: (id, name, phone, password, access_level, created_at, updated_at, city, cpf, full_name, photo, cnpj, person_type)
      // let's parse
      let clean = line.trim();
      if (clean.startsWith('(')) clean = clean.slice(1);
      clean = clean.replace(/\)[,;]?$/, '');

      // parse tokens
      const tokens = [];
      let cur = '';
      let inStr = false;
      let escape = false;

      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (escape) {
          cur += ch;
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === "'") {
          inStr = !inStr;
        } else if (ch === ',' && !inStr) {
          tokens.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      tokens.push(cur.trim());

      const id = tokens[0];
      const name = tokens[1]?.replace(/^'|'$/g, '');
      const phone = tokens[2]?.replace(/^'|'$/g, '');
      const city = tokens[7]?.replace(/^'|'$/g, '');
      const cpf = tokens[8]?.replace(/^'|'$/g, '');
      const fullName = tokens[9]?.replace(/^'|'$/g, '');
      const cnpj = tokens[11]?.replace(/^'|'$/g, '');

      if (cpf && cpf !== 'NULL') {
        countWithCpf++;
        if (samplesWithDoc.length < 5) samplesWithDoc.push({ id, name, phone, city, cpf, fullName });
      }
      if (cnpj && cnpj !== 'NULL') {
        countWithCnpj++;
        if (samplesWithDoc.length < 10) samplesWithDoc.push({ id, name, phone, city, cnpj, fullName });
      }
    }
  }

  console.log(`Total users in SQL: ${totalUsers}`);
  console.log(`Users with CPF: ${countWithCpf}`);
  console.log(`Users with CNPJ: ${countWithCnpj}`);
  console.log('Sample users with docs:', samplesWithDoc);
}

checkUsersTable().catch(console.error);
