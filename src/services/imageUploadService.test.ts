import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadImage } from './imageUploadService';

const options = {
  type: 'perfil',
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

test('uploads through the app server without sending image server credentials', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return mockResponse({ success: true, data: { path: 'https://images.example.com/images.php?f=profile.jpg' } });
  };

  try {
    const url = await uploadImage('data:image/jpeg;base64,dGVzdA==', options);
    assert.equal(url, 'https://images.example.com/images.php?f=profile.jpg');
    assert.equal(requestUrl, '/users/upload_foto');
    assert.equal('imageServerPassword' in requestBody, false);
    assert.equal('imageServerUrl' in requestBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns the configured backend error without trying a local upload fallback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({ success: false, message: 'Image server unavailable' }, 502);

  try {
    await assert.rejects(uploadImage('data:image/jpeg;base64,dGVzdA==', options), /Image server unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});