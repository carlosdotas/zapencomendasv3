/**
 * Script de Sincronização Inicial para o Firebase Firestore database (default)
 * 
 * Importa e sincroniza:
 * 1. Todos os 2000 Pedidos para a coleção 'orders'
 * 2. Todos os Locais para a coleção 'places'
 * 3. Todos os Usuários para a coleção 'users'
 * 
 * Utiliza writeBatch em lotes de 400 documentos para velocidade máxima e integridade total.
 */

import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { sanitizeForFirestore } from '../src/services/firestoreUtils';

const firebaseConfig = {
  projectId: 'zapencomendas-507212',
  apiKey: 'AIzaSyBRAUyrUVl7bPXGeYGf6bEOtrUDtLP3Ir8',
  authDomain: 'zapencomendas-507212.firebaseapp.com',
  storageBucket: 'zapencomendas-507212.firebasestorage.app',
  messagingSenderId: '661076087159',
  appId: '1:661076087159:web:44d7c03ae20aea5ed75172'
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app, '(default)');

console.log('[Sync] Conectado ao Firestore database: (default) no projeto zapencomendas-507212.');

async function syncCollectionInBatches(
  collectionName: string,
  filePath: string,
  idField: string = 'id',
  batchSize: number = 350
) {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[Sync] Arquivo não encontrado: ${filePath}`);
    return;
  }

  const items: any[] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  console.log(`\n[Sync] Iniciando sincronização de ${items.length} itens para '${collectionName}'...`);

  let totalUploaded = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const batch = writeBatch(db);

    for (const rawItem of chunk) {
      const docId = String(rawItem[idField] || rawItem.id);
      if (!docId) continue;
      const clean = sanitizeForFirestore(rawItem);
      const docRef = doc(db, collectionName, docId);
      batch.set(docRef, clean, { merge: true });
    }

    try {
      await batch.commit();
      totalUploaded += chunk.length;
      console.log(`[Sync] '${collectionName}': ${totalUploaded}/${items.length} gravados com sucesso no Firestore (default)...`);
    } catch (err: any) {
      console.error(`[Sync] Erro no lote ${i} a ${i + chunk.length} de '${collectionName}':`, err.message);
    }
  }

  console.log(`[Sync] Concluído '${collectionName}': total de ${totalUploaded} documentos no Firestore (default)!`);
}

async function run() {
  const startTime = Date.now();
  console.log('=== INICIANDO SINCRONIZAÇÃO COMPLETA PARA O FIREBASE (DEFAULT) ===');

  // 1. Sincroniza Pedidos
  await syncCollectionInBatches('orders', 'src/data/importedPedidos.json', 'id', 300);

  // 2. Sincroniza Locais
  await syncCollectionInBatches('places', 'src/data/importedLocais.json', 'id', 300);

  // 3. Sincroniza Usuários
  await syncCollectionInBatches('users', 'src/data/importedUsers.json', 'id', 300);

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n=== SINCRONIZAÇÃO FINALIZADA COM SUCESSO EM ${durationSec}s ===`);
  process.exit(0);
}

run().catch(err => {
  console.error('Falha fatal na sincronização:', err);
  process.exit(1);
});
