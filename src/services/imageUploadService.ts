export interface ImageUploadOptions {
  type: string;
  imageServerUrl: string;
  imageServerPassword: string;
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

  const { type, imageServerUrl, imageServerPassword, fallbackEndpoint, fallbackData } = options;

  if (imageServerUrl) {
    try {
      const separator = imageServerUrl.includes('?') ? '&' : '?';
      const uploadUrl = `${imageServerUrl}${separator}action=upload&password=${encodeURIComponent(imageServerPassword)}`;
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Password': imageServerPassword
        },
        body: JSON.stringify({ image: base64, tipo: type, password: imageServerPassword })
      });

      if (response.ok) {
        const result = await response.json() as ImageUploadResponse;
        if (result.success) {
          const uploadedUrl = getUploadedPath(result);
          if (uploadedUrl) return uploadedUrl;
          if (result.filename) {
            const endpoint = imageServerUrl.split('?')[0].replace(/\/+$/, '');
            return `${endpoint}?f=${encodeURIComponent(result.filename)}`;
          }
        }
      }
    } catch (error) {
      console.warn('[Image Upload] PHP upload failed; trying the app server fallback.', error);
    }
  }

  const fallbackResponse = await fetch(fallbackEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...fallbackData,
      base64,
      image: base64,
      foto: base64,
      tipo: type,
      imageServerUrl,
      imageServerPassword
    })
  });
  const fallbackResult = await fallbackResponse.json() as ImageUploadResponse;
  const fallbackPath = getUploadedPath(fallbackResult);

  if (!fallbackResponse.ok || !fallbackResult.success || !fallbackPath) {
    throw new Error(fallbackResult.message || 'Não foi possível salvar a imagem no servidor.');
  }

  return fallbackPath;
}