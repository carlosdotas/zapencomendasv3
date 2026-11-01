const fs = require('fs');
const path = require('path');

async function importAll() {
  console.log('[Importer] Iniciando download dos pedidos de https://dotas.online/pedidos/list_pedidos...');
  try {
    const resPedidos = await fetch('https://dotas.online/pedidos/list_pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ limit: 10000 })
    });
    const jsonPedidos = await resPedidos.json();
    const pedidos = Array.isArray(jsonPedidos.data) ? jsonPedidos.data : [];
    console.log(`[Importer] ${pedidos.length} pedidos baixados.`);

    const pedidosPath = path.resolve(__dirname, '..', 'src', 'data', 'importedPedidos.json');
    fs.writeFileSync(pedidosPath, JSON.stringify(pedidos, null, 2), 'utf-8');
    console.log(`[Importer] Arquivo salvo: ${pedidosPath} (${(fs.statSync(pedidosPath).size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (err) {
    console.error('[Importer] Erro ao baixar pedidos:', err.message);
  }

  console.log('[Importer] Iniciando download dos locais de https://dotas.online/locais...');
  try {
    const resLocais = await fetch('https://dotas.online/locais?limit=10000', {
      headers: { 'Accept': 'application/json' }
    });
    const jsonLocais = await resLocais.json();
    const locais = Array.isArray(jsonLocais.data) ? jsonLocais.data : [];
    console.log(`[Importer] ${locais.length} locais baixados.`);

    const locaisPath = path.resolve(__dirname, '..', 'src', 'data', 'importedLocais.json');
    fs.writeFileSync(locaisPath, JSON.stringify(locais, null, 2), 'utf-8');
    console.log(`[Importer] Arquivo salvo: ${locaisPath} (${(fs.statSync(locaisPath).size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (err) {
    console.error('[Importer] Erro ao baixar locais:', err.message);
  }
}

importAll();
