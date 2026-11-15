import { PrismaClient } from '@prisma/client';

import { createTestUser, truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import { Session } from '../../domain/session.entity.js';
import type { RefreshTokenRecord, RefreshUnitOfWork } from '../../domain/session.repository.js';
import { PrismaSessionRepository } from '../prisma-session.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaSessionRepository(prisma);
const NOW = new Date('2026-10-28T10:00:00Z');
// Huella de 64 caracteres hexadecimales a partir de una letra, para leer los tests con facilidad
const hash = (seed: string) => seed.repeat(64).slice(0, 64);
// El repositorio guarda la copia tal cual le llega: el cifrado se prueba en AesGcmSecretCipher
const SEALED_CSRF = 'v1.iv.copia-csrf.etiqueta';

describe('PrismaSessionRepository', () => {
  let userId: string;

  const open = (access: string, refresh: string, owner = userId) =>
    repository.create({
      userId: owner,
      accessTokenHash: hash(access),
      refreshTokenHash: hash(refresh),
      csrfTokenHash: hash('c'),
      csrfTokenSealed: SEALED_CSRF,
      schedule: Session.schedule(NOW),
      now: NOW,
    });

  // Rota la sesión del refresh token indicado como lo hará el caso de uso
  const rotate = (refresh: string, next: { access: string; refresh: string }, now: Date) =>
    repository.withRefreshTokenLocked(hash(refresh), async (record, unit) => {
      if (!record) throw new Error('refresh token inexistente');
      record.session.rotate(now);
      await unit.rotate(
        record,
        { accessTokenHash: hash(next.access), refreshTokenHash: hash(next.refresh), graceTokens: 'v1.copia' },
        now,
      );
    });

  beforeEach(async () => {
    await truncateTables(prisma, ['sessions', 'refresh_tokens']);
    userId = await createTestUser(prisma);
  });
  afterAll(() => prisma.$disconnect());

  it('abre la sesión y la encuentra por la huella del acceso y por la del refresh (RF-07)', async () => {
    const session = await open('1', '2');
    expect(session.generation).toBe(0);

    const byAccess = await repository.findByAccessTokenHash(hash('1'));
    expect(byAccess?.session.id).toBe(session.id);
    expect(byAccess?.csrfTokenHash).toBe(hash('c'));
    expect(byAccess?.session.expiresAt.toISOString()).toBe('2026-11-27T10:00:00.000Z');

    const byRefresh = await repository.findByRefreshTokenHash(hash('2'));
    expect(byRefresh).toMatchObject({ tokenHash: hash('2'), tokenGeneration: 0, tokenRotatedAt: null });
    expect(await repository.findByAccessTokenHash(hash('9'))).toBeNull();
  });

  it('la rotación guarda la sesión, marca el refresh usado, añade el nuevo y la copia cifrada (RF-11, RF-13)', async () => {
    await open('1', '2');
    const later = new Date('2026-10-28T10:20:00Z');
    await rotate('2', { access: '3', refresh: '4' }, later);

    expect(await repository.findByAccessTokenHash(hash('1'))).toBeNull();
    const current = await repository.findByAccessTokenHash(hash('3'));
    expect(current?.session.generation).toBe(1);
    expect(current?.session.rotatedAt?.toISOString()).toBe(later.toISOString());
    expect(current?.graceTokens).toBe('v1.copia');

    expect(await repository.findByRefreshTokenHash(hash('2'))).toMatchObject({ tokenGeneration: 0, tokenRotatedAt: later });
    expect(await repository.findByRefreshTokenHash(hash('4'))).toMatchObject({ tokenGeneration: 1, tokenRotatedAt: null });
  });

  it('dos renovaciones simultáneas con el mismo refresh: solo una rota, la otra ve el token ya rotado (D-4)', async () => {
    await open('1', '2');
    const attempt = (next: string) =>
      repository.withRefreshTokenLocked(hash('2'), async (record: RefreshTokenRecord | null, unit: RefreshUnitOfWork) => {
        if (!record || record.tokenRotatedAt !== null) return 'ya rotado';
        // Deja tiempo a que la otra transacción intente entrar mientras esta tiene la sesión bloqueada
        await new Promise((resolve) => setTimeout(resolve, 100));
        record.session.rotate(NOW);
        await unit.rotate(record, { accessTokenHash: hash(next), refreshTokenHash: hash(next), graceTokens: 'v1.x' }, NOW);
        return 'rotado';
      });

    const session = await repository.findByRefreshTokenHash(hash('2'));
    const results = await Promise.all([attempt('5'), attempt('6')]);

    expect(results.sort()).toEqual(['rotado', 'ya rotado']);
    expect(await prisma.refreshToken.count({ where: { sessionId: session?.session.id } })).toBe(2);
  });

  it('close dentro de la transacción borra la sesión y sus refresh tokens (RF-13)', async () => {
    const session = await open('1', '2');
    await repository.withRefreshTokenLocked(hash('2'), (_record, unit) => unit.close(session.id));
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { sessionId: session.id } })).toBe(0);
  });

  it('un refresh token inexistente llega al trabajo como null', async () => {
    expect(await repository.withRefreshTokenLocked(hash('9'), async (record) => record)).toBeNull();
  });

  it('deleteAllExcept cierra las demás sesiones de la cuenta y no toca las de otras (RF-27)', async () => {
    const keep = await open('1', '2');
    await open('3', '4');
    const otherUser = await createTestUser(prisma);
    await open('5', '6', otherUser);

    await repository.deleteAllExcept(userId, keep.id);

    const remaining = await prisma.session.findMany({
      where: { userId: { in: [userId, otherUser] } },
      select: { accessTokenHash: true },
    });
    expect(remaining.map((session) => session.accessTokenHash).sort()).toEqual([hash('1'), hash('5')]);
  });

  it('limpieza: borra las sesiones caducadas y las copias cifradas de más de 30 s (D-12)', async () => {
    const expired = await open('1', '2');
    await prisma.session.update({ where: { id: expired.id }, data: { refreshExpiresAt: NOW } });
    await open('3', '4');
    await rotate('4', { access: '5', refresh: '6' }, new Date('2026-10-28T10:00:00Z'));

    await repository.deleteExpired(NOW);
    await repository.clearGraceTokens(new Date('2026-10-28T10:00:31Z'));

    expect(await prisma.session.count({ where: { userId } })).toBe(1);
    expect((await repository.findByAccessTokenHash(hash('5')))?.graceTokens).toBeNull();
  });

  it('en la base de datos solo hay huellas de 64 caracteres, nunca los tokens (RNF-06)', async () => {
    await open('1', '2');
    const [row] = await prisma.$queryRaw<{ access: string; csrf: string }[]>`
      SELECT "access_token_hash" AS access, "csrf_token_hash" AS csrf FROM "sessions" WHERE "user_id" = ${userId}::uuid`;
    expect(row?.access).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.csrf).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('copia cifrada del token CSRF (spec 003)', () => {
    it('create la guarda y findById la devuelve con la sesión (RF-02)', async () => {
      const session = await open('1', '2');
      const found = await repository.findById(session.id);
      expect(found?.session.id).toBe(session.id);
      expect(found?.csrfTokenHash).toBe(hash('c'));
      expect(found?.csrfTokenSealed).toBe(SEALED_CSRF);
      expect((await repository.findByAccessTokenHash(hash('1')))?.csrfTokenSealed).toBe(SEALED_CSRF);
    });

    it('findById de una sesión inexistente o cerrada → null', async () => {
      const session = await open('1', '2');
      await repository.delete(session.id);
      expect(await repository.findById(session.id)).toBeNull();
      expect(await repository.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
    });

    it('la renovación no cambia la copia: el token CSRF vale toda la sesión (RF-02; RF-24 de la 002)', async () => {
      const session = await open('1', '2');
      await rotate('2', { access: '3', refresh: '4' }, new Date('2026-10-28T10:20:00Z'));
      expect((await repository.findById(session.id))?.csrfTokenSealed).toBe(SEALED_CSRF);
    });

    it('la base de datos rechaza una sesión sin copia (RF-04)', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "sessions" ("user_id", "access_token_hash", "csrf_token_hash", "access_expires_at",
            "refresh_expires_at", "expires_at")
          VALUES (${userId}::uuid, ${hash('x')}, ${hash('c')}, ${NOW}, ${NOW}, ${NOW})`,
      ).rejects.toThrow();
    });
  });
});
