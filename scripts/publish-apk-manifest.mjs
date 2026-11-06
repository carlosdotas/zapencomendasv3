import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'apk', 'android', 'app', 'build', 'outputs', 'apk', 'debug');
const metadata = JSON.parse(readFileSync(join(output, 'output-metadata.json'), 'utf8'));
const artifact = metadata.elements?.find(element => element.type === 'SINGLE');
if (!artifact || !Number.isSafeInteger(artifact.versionCode) || artifact.versionCode <= 0 ||
    typeof artifact.versionName !== 'string' || !artifact.versionName.trim() || artifact.outputFile !== 'app-debug.apk') {
  throw new Error('Metadados do APK compilado são inválidos.');
}

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const compiledHash = hash(join(output, artifact.outputFile));
const downloadApk = join(root, 'public', 'download', 'zap-encomendas.apk');
const alternateApk = join(root, 'apk', 'zap-encomendas.apk');
if (hash(downloadApk) !== compiledHash || hash(alternateApk) !== compiledHash) {
  throw new Error('Os APKs de distribuição não correspondem ao APK compilado.');
}

const manifest = {
  versionCode: artifact.versionCode,
  versionName: artifact.versionName,
  sha256: compiledHash,
  publishedAt: new Date().toISOString()
};
writeFileSync(join(root, 'public', 'download', 'apk-version.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[apk] Manifesto preparado para ${manifest.versionName} (${manifest.versionCode}).`);
