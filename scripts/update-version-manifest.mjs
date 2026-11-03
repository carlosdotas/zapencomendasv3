import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(rootDir, 'public', 'app-version.json');
const gradlePropertiesPath = join(rootDir, 'apk', 'android', 'version.properties');

const webInputs = ['index.html', 'package.json', 'postcss.config.js', 'tailwind.config.js', 'vite.config.ts', 'src'];
const apkInputs = ['apk/capacitor.config.json', 'apk/package.json', 'apk/android/app', 'apk/android/build.gradle', 'apk/android/gradle.properties', 'apk/android/variables.gradle'];
const ignoredDirectories = new Set(['build', '.gradle', '.kotlin']);
const ignoredFiles = new Set(['version.properties']);

function collectFiles(inputPath) {
  const absolutePath = join(rootDir, inputPath);
  if (!existsSync(absolutePath)) return [];
  const entries = [];
  const visit = (path) => {
    const statEntries = readdirSync(path, { withFileTypes: true });
    for (const entry of statEntries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) visit(join(path, entry.name));
      } else if (entry.isFile() && !ignoredFiles.has(entry.name)) {
        entries.push(join(path, entry.name));
      }
    }
  };
  const rootEntry = readdirSync(dirname(absolutePath), { withFileTypes: true }).find((entry) => entry.name === relative(dirname(absolutePath), absolutePath));
  if (rootEntry?.isDirectory()) visit(absolutePath);
  else entries.push(absolutePath);
  return entries;
}

function hashInputs(inputs) {
  const hash = createHash('sha256');
  const files = inputs.flatMap(collectFiles).sort();
  for (const file of files) {
    hash.update(relative(rootDir, file).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    return { major: 3, web: 0, apk: 0, webHash: '', apkHash: '', updatedAt: '' };
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

const initialize = process.argv.includes('--initialize');
const bumpApk = process.argv.includes('--bump-apk');
const manifest = readManifest();
const webHash = hashInputs(webInputs);
const apkHash = hashInputs(apkInputs);

if (initialize) {
  manifest.major = 3;
  manifest.web = 0;
  manifest.apk = 0;
} else {
  if (manifest.webHash && manifest.webHash !== webHash) manifest.web += 1;
  if (bumpApk || (manifest.apkHash && manifest.apkHash !== apkHash)) manifest.apk += 1;
}

manifest.major = 3;
manifest.webHash = webHash;
manifest.apkHash = apkHash;
manifest.updatedAt = new Date().toISOString();
manifest.version = `V.${manifest.major}.${manifest.web}.${manifest.apk}`;

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  gradlePropertiesPath,
  `VERSION_NAME=${manifest.major}.${manifest.web}.${manifest.apk}\nVERSION_CODE=${manifest.major}${String(manifest.web).padStart(3, '0')}${String(manifest.apk).padStart(3, '0')}\n`
);

console.log(`[version] ${manifest.version} | web ${webHash.slice(0, 12)} | apk ${apkHash.slice(0, 12)}`);
