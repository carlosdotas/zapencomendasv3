import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPhotoUrl } from './apiAdapters';

test('preserves the PHP image host returned by the upload server', () => {
  const resolvedUrl = formatPhotoUrl(
    'https://images.example.com/images.php?f=1762000000_perfil_ab12cd34.jpg'
  );

  assert.equal(
    resolvedUrl,
    'https://images.example.com/images.php?f=1762000000_perfil_ab12cd34.jpg&w=480'
  );
});

test('keeps local profile uploads on the app origin', () => {
  assert.equal(
    formatPhotoUrl('/uploads/users/avatar.jpg'),
    '/uploads/users/avatar.jpg'
  );
});