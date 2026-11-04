import test from 'node:test';
import assert from 'node:assert/strict';
import { hasOrderPhoto, removeOrderPhoto } from './orderPhotos';

test('requires a real saved collection photo', () => {
  assert.equal(hasOrderPhoto(''), false);
  assert.equal(hasOrderPhoto('[]'), false);
  assert.equal(hasOrderPhoto('["/uploads/pedidos/coleta/photo.png"]'), true);
});

test('removes the selected local or PHP photo without removing other photos', () => {
  const photos = JSON.stringify(['/uploads/pedidos/coleta/one.png', '/uploads/pedidos/coleta/two.jpg']);
  assert.deepEqual(removeOrderPhoto(photos, 'https://app.example.com/uploads/pedidos/coleta/one.png'), ['/uploads/pedidos/coleta/two.jpg']);
  assert.deepEqual(removeOrderPhoto('["https://example.com/images.php?f=one.jpg"]', 'https://example.com/images.php?f=one.jpg&w=480'), []);
});
