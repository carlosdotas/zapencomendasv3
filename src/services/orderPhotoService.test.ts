import test from 'node:test';
import assert from 'node:assert/strict';
import { persistOrderPhoto } from './orderPhotoService';

test('uploads and attaches a pickup photo before returning', async () => {
  const steps: string[] = [];
  const api = {
    uploadFoto: async () => { steps.push('upload'); return { success: true, data: { path: '/uploads/pedidos/coleta/photo.jpg' } }; },
    appendFoto: async (_id: string, _path: string, field: string) => {
      steps.push(field);
      return { success: true, data: { path: '/uploads/pedidos/coleta/photo.jpg' } };
    }
  };
  assert.equal(await persistOrderPhoto(api, 'data:image/jpeg;base64,abc', 'coleta', '42'), '/uploads/pedidos/coleta/photo.jpg');
  assert.deepEqual(steps, ['upload', 'coleta_foto']);
});

test('does not report success when upload or attachment fails', async () => {
  const failedUpload = {
    uploadFoto: async () => ({ success: false, message: 'Falha no envio' }),
    appendFoto: async () => { throw new Error('Não deve anexar'); }
  };
  await assert.rejects(persistOrderPhoto(failedUpload, 'photo', 'coleta', '42'), /Falha no envio/);
  const failedAttachment = {
    uploadFoto: async () => ({ success: true, data: { path: '/uploads/pedidos/coleta/photo.jpg' } }),
    appendFoto: async () => ({ success: false, message: 'Falha ao anexar' })
  };
  await assert.rejects(persistOrderPhoto(failedAttachment, 'photo', 'coleta', '42'), /Falha ao anexar/);
});

test('uploads a draft without trying to attach it to a nonexistent order', async () => {
  const api = {
    uploadFoto: async () => ({ success: true, data: { path: '/uploads/pedidos/entrega/photo.png' } }),
    appendFoto: async () => { throw new Error('Não deve anexar'); }
  };
  assert.equal(await persistOrderPhoto(api, 'photo', 'entrega'), '/uploads/pedidos/entrega/photo.png');
});
