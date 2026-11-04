import type { ApiResponse } from './apiTypes';

type PhotoStage = 'coleta' | 'entrega';
type PhotoApi = {
  uploadFoto: (data: string, stage: PhotoStage) => Promise<ApiResponse<{ path: string }>>;
  appendFoto: (orderId: string, path: string, field: 'coleta_foto' | 'entrega_foto') => Promise<ApiResponse<{ path: string }>>;
};

export async function persistOrderPhoto(
  api: PhotoApi,
  data: string,
  stage: PhotoStage,
  orderId?: string
): Promise<string> {
  const uploaded = await api.uploadFoto(data, stage);
  if (!uploaded.success || !uploaded.data?.path) {
    throw new Error(uploaded.message || 'Não foi possível enviar a foto.');
  }
  if (orderId) {
    const saved = await api.appendFoto(orderId, uploaded.data.path, stage === 'coleta' ? 'coleta_foto' : 'entrega_foto');
    if (!saved.success) throw new Error(saved.message || 'Não foi possível anexar a foto ao pedido.');
  }
  return uploaded.data.path;
}
