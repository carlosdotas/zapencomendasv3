import { useState, useEffect } from 'react';

let cachedVersion = 'V.3.8.11';
let fetchPromise: Promise<string> | null = null;

function loadVersion(): Promise<string> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('/app-version.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      if (typeof data?.version === 'string' && data.version.trim()) {
        cachedVersion = data.version.trim();
      }
      return cachedVersion;
    })
    .catch(() => cachedVersion);
  return fetchPromise;
}

export function useAppVersion(): string {
  const [version, setVersion] = useState<string>(cachedVersion);

  useEffect(() => {
    let mounted = true;
    void loadVersion().then(v => {
      if (mounted) setVersion(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return version;
}
