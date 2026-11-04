function photoIdentity(value: string): string {
  const parsed = new URL(value, 'http://local');
  const filename = parsed.searchParams.get('f') || parsed.searchParams.get('file') || parsed.searchParams.get('img');
  return filename ? `file:${filename}` : `path:${parsed.pathname}`;
}

function parseOrderPhotos(current: unknown): string[] {
  let photos: unknown;
  if (typeof current === 'string') {
    const text = current.trim();
    photos = text.startsWith('[') ? JSON.parse(text) : text ? [text] : [];
  } else {
    photos = current || [];
  }

  if (!Array.isArray(photos) || photos.some(photo => typeof photo !== 'string')) {
    throw new Error('Lista de fotos do pedido inválida.');
  }
  return photos;
}

export function removeOrderPhoto(current: unknown, target: string): string[] {
  const identity = photoIdentity(target);
  return parseOrderPhotos(current).filter(photo => photoIdentity(photo) !== identity);
}

export function hasOrderPhoto(current: unknown): boolean {
  try {
    return parseOrderPhotos(current).some(photo => photo.trim().length > 0);
  } catch (error) {
    console.warn('[Fotos] Lista de fotos inválida:', error);
    return false;
  }
}
