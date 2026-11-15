import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { PrismaTurnstileTokenRepository } from '../prisma-turnstile-token.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaTurnstileTokenRepository(prisma);
const at = (time: string) => new Date(`2026-11-15T${time}Z`);
// Huella única de 64 caracteres hexadecimales: cada test usa las suyas y no hace falta vaciar la tabla
const uniqueHash = () => randomUUID().replaceAll('-', '').repeat(2);
// Peticiones simultáneas con el mismo token (CE-04 de la 005)
const CONCURRENT_REQUESTS = 20;

describe('PrismaTurnstileTokenRepository', () => {
  afterAll(() => prisma.$disconnect());

  it('la primera reserva de un token vale y la segunda, mientras no caduca, no (RF-20, RF-21)', async () => {
    const tokenHash = uniqueHash();
    expect(await repository.reserve(tokenHash, at('10:00:00'), at('10:05:00'))).toBe(true);
    expect(await repository.reserve(tokenHash, at('10:04:59'), at('10:09:59'))).toBe(false);
  });

  it('guarda solo la huella y su caducidad (RF-23)', async () => {
    const tokenHash = uniqueHash();
    await repository.reserve(tokenHash, at('10:00:00'), at('10:05:00'));
    const row = await prisma.turnstileToken.findUniqueOrThrow({ where: { tokenHash } });
    expect(row).toEqual({ tokenHash, expiresAt: at('10:05:00') });
  });

  it(`de ${CONCURRENT_REQUESTS} reservas simultáneas del mismo token, solo una vale (RF-20, RF-22, CE-04, D-3)`, async () => {
    const tokenHash = uniqueHash();
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => repository.reserve(tokenHash, at('10:00:00'), at('10:05:00'))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('una reserva caducada que la limpieza aún no ha borrado se puede volver a reservar (D-3)', async () => {
    const tokenHash = uniqueHash();
    await repository.reserve(tokenHash, at('10:00:00'), at('10:05:00'));
    expect(await repository.reserve(tokenHash, at('10:05:00'), at('10:10:00'))).toBe(true);
    const row = await prisma.turnstileToken.findUniqueOrThrow({ where: { tokenHash } });
    expect(row.expiresAt).toEqual(at('10:10:00'));
  });

  it('la limpieza borra solo las reservas caducadas (RF-31)', async () => {
    const [expired, valid] = [uniqueHash(), uniqueHash()];
    await repository.reserve(expired, at('09:00:00'), at('09:05:00'));
    await repository.reserve(valid, at('10:00:00'), at('10:05:00'));

    await repository.deleteExpired(at('10:00:00'));

    expect(await prisma.turnstileToken.count({ where: { tokenHash: expired } })).toBe(0);
    expect(await prisma.turnstileToken.count({ where: { tokenHash: valid } })).toBe(1);
  });
});
