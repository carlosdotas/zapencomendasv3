import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadImage } from './imageUploadService';

const options = {
  type: 'perfil',
  imageServerUrl: 'https://images.example.com/images.php',
  imageServerPassword: 'test-password',
  fallbackEndpoint: '/users/upload_foto',
  fallbackData: { user_id: 42, phone: '62999990000' }
};

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

test('uses the URL returned by the PHP image server', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({
    success: true,
    url: 'https://images.example.com/images.php?f=profile.jpg'
  });

  try {
    const url = await uploadImage('data:image/jpeg;base64,dGVzdA==', options);
    assert.equal(url, 'https://images.example.com/images.php?f=profile.jpg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses a persisted app-server file when PHP upload fails', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return requestCount === 1
      ? mockResponse({ success: false }, 503)
      : mockResponse({ success: true, data: { path: '/uploads/users/profile.jpg' } });
  };

  try {
    const url = await uploadImage('data:image/jpeg;base64,dGVzdA==', options);
    assert.equal(url, '/uploads/users/profile.jpg');
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});