const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const MAPS_HOST_PATTERN = /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.|maps\.apple\.com|waze\.com\/ul|g\.co\/kgs)/i;
const COORDINATE_PATTERN = /(?:@|q=|ll=|geo:|destination=|query=)\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i;
const PLAIN_COORDINATE_PATTERN = /(?:^|[\s(])(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})(?=$|[\s).])/;

export interface SharedContent {
  text?: string | null;
  url?: string | null;
  title?: string | null;
}

function cleanUrl(url: string): string {
  return url.replace(/[)\]'",;.!?]+$/, '');
}

// Mensagens do WhatsApp trazem texto + link; devolve só o que a busca do mapa sabe resolver.
export function extractSharedMapQuery(content: SharedContent): string | null {
  const combined = [content.url, content.text, content.title].filter(Boolean).join('\n');
  if (!combined.trim()) return null;

  const urls = (combined.match(URL_PATTERN) || []).map(cleanUrl);
  const mapsUrl = urls.find(url => MAPS_HOST_PATTERN.test(url));
  if (mapsUrl) return mapsUrl;

  const coordinates = combined.match(COORDINATE_PATTERN) || combined.match(PLAIN_COORDINATE_PATTERN);
  if (coordinates) return `${coordinates[1]}, ${coordinates[2]}`;

  if (urls.length > 0) return urls[0];
  return null;
}

export function readShareParams(search: string): SharedContent | null {
  const params = new URLSearchParams(search);
  const text = params.get('text');
  const url = params.get('url');
  const title = params.get('title');
  if (!text && !url && !title) return null;
  return { text, url, title };
}
