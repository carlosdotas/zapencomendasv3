import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from './db';

test('localDb & Prisma fallback handles core models without throwing PrismaClientInitializationError', async () => {
  // 1. Settings (error 0)
  const settings = await prisma.app_settings.findUnique({ where: { key: 'global_config' } });
  assert.ok(settings, 'Settings should return an object');
  assert.equal(settings?.key, 'global_config');

  // 2. Cidades & Order group by (error 1)
  const cities = await prisma.config_cities.findMany({ orderBy: { city: 'asc' } });
  assert.ok(Array.isArray(cities) && cities.length > 0, 'Config cities should return default list of cities');
  const cityGroups = await prisma.orders.groupBy({ by: ['orig_city'], _count: { _all: true } });
  assert.ok(Array.isArray(cityGroups), 'Orders groupBy should return array');

  // 3. Locais (error 3)
  const locais = await prisma.locais.findMany({ orderBy: { id: 'asc' } });
  assert.ok(Array.isArray(locais), 'Locais findMany should return array');

  // 4. Locations & Tracking order markers (error 4)
  const locs = await prisma.locations.findMany({ where: { is_collection_hub: true } });
  assert.ok(Array.isArray(locs), 'Locations findMany should return array');

  // 5. Orders (error 5)
  const orders = await prisma.orders.findMany({ orderBy: { id: 'desc' }, take: 10 });
  assert.ok(Array.isArray(orders), 'Orders findMany should return array');

  // 6. Users (error 6)
  const users = await prisma.users.findMany({ orderBy: { id: 'asc' }, take: 20 });
  assert.ok(Array.isArray(users) && users.length > 0, 'Users findMany should return seeded users from legacy json');

  // 7. User sessions with include
  const createdSession = await prisma.user_sessions.create({
    data: {
      user_id: users[0].id,
      token: 'test-token-' + Date.now(),
      device_id: 'test-device',
      source: 'web',
      type: users[0].access_level,
      is_logged: true
    }
  });
  assert.ok(createdSession.id, 'Session should have an id');

  const loadedSession = await prisma.user_sessions.findUnique({
    where: { token: createdSession.token },
    include: { user: true }
  });
  assert.ok(loadedSession, 'Loaded session should exist');
  assert.equal(loadedSession?.user?.id, users[0].id, 'Included user should match');
});
