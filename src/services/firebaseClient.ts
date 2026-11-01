/**
 * Cliente Unificado do Firebase para ZapEncomendas
 * 
 * Conecta explicitamente ao projeto zapencomendas-507212 e banco Firestore (default).
 * Garante persistência em tempo real de pedidos, locais e usuários.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  databaseURL?: string;
}

// Configuração padrão oficial do projeto ZapEncomendas
export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  projectId: 'zapencomendas-507212',
  apiKey: 'AIzaSyBRAUyrUVl7bPXGeYGf6bEOtrUDtLP3Ir8',
  authDomain: 'zapencomendas-507212.firebaseapp.com',
  storageBucket: 'zapencomendas-507212.firebasestorage.app',
  messagingSenderId: '661076087159',
  appId: '1:661076087159:web:44d7c03ae20aea5ed75172'
};

export function getResolvedFirebaseConfig(): FirebaseConfig {
  let config: FirebaseConfig = { ...DEFAULT_FIREBASE_CONFIG };

  // Lê variáveis do Vite (VITE_FIREBASE_*)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (env.VITE_FIREBASE_PROJECT_ID) config.projectId = env.VITE_FIREBASE_PROJECT_ID;
    if (env.VITE_FIREBASE_API_KEY) config.apiKey = env.VITE_FIREBASE_API_KEY;
    if (env.VITE_FIREBASE_AUTH_DOMAIN) config.authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
    if (env.VITE_FIREBASE_STORAGE_BUCKET) config.storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET;
    if (env.VITE_FIREBASE_APP_ID) config.appId = env.VITE_FIREBASE_APP_ID;
    if (env.VITE_FIREBASE_MESSAGING_SENDER_ID) config.messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID;
    if (env.VITE_FIREBASE_DATABASE_URL) config.databaseURL = env.VITE_FIREBASE_DATABASE_URL;
  }

  // Lê variáveis do Node.js (process.env)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID) {
      config.projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || config.projectId;
    }
    if (process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY) {
      config.apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || config.apiKey;
    }
    if (process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN) {
      config.authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || config.authDomain;
    }
    if (process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID) {
      config.appId = process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || config.appId;
    }
    if (process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL) {
      config.databaseURL = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL || config.databaseURL;
    }
  }

  // Lê sobreposição do localStorage se configurado manualmente pelo usuário
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedConfigRaw = localStorage.getItem('encomendaszap_firebase_config');
      if (savedConfigRaw) {
        const saved = JSON.parse(savedConfigRaw);
        config = { ...config, ...saved };
      }
    } catch {}
  }

  return config;
}

let firebaseAppInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (firebaseAppInstance) return firebaseAppInstance;

  const config = getResolvedFirebaseConfig();
  if (getApps().length > 0) {
    firebaseAppInstance = getApp();
  } else {
    firebaseAppInstance = initializeApp(config);
  }
  return firebaseAppInstance;
}

/**
 * Retorna a instância do Firestore explicitamente conectada ao banco '(default)'.
 */
export function getFirebaseFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;

  const app = getFirebaseApp();
  // Conecta explicitamente ao banco '(default)' conforme requisito
  firestoreInstance = getFirestore(app, '(default)');
  console.log('[Firebase Client] Conectado ao Firestore database: (default) no projeto:', app.options.projectId);
  return firestoreInstance;
}
