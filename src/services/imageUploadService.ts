export interface ImageUploadOptions {
  type: string;
  fallbackEndpoint: string;
  fallbackData?: Record<string, string | number | undefined>;
}

interface ImageUploadResponse {
  success?: boolean;
  message?: string;
  url?: string;
  path?: string;
  foto?: string;
  avatarUrl?: string;
  filename?: string;
  data?: {
    url?: string;
    path?: string;
    foto?: string;
    avatarUrl?: string;
  };
}

function getUploadedPath(response: ImageUploadResponse): string | null {
  return response.url || response.path || response.foto || response.avatarUrl ||
    response.data?.url || response.data?.path || response.data?.foto || response.data?.avatarUrl || null;
}

export async function uploadImage(base64: string, options: ImageUploadOptions): Promise<string> {
  if (!base64.startsWith('data:image/')) {
    throw new Error('Formato de imagem inválido.');
  }

  const { type, fallbackEndpoint, fallbackData } = options;

  const fallbackResponse = await fetch(fallbackEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...fallbackData,
      base64,
      image: base64,
      foto: base64,
      tipo: type
    })
  });
  const fallbackResult = await fallbackResponse.json() as ImageUploadResponse;
  const fallbackPath = getUploadedPath(fallbackResult);

  if (!fallbackResponse.ok || !fallbackResult.success || !fallbackPath) {
    throw new Error(fallbackResult.message || 'Não foi possível salvar a imagem no servidor.');
  }

  return fallbackPath;
}