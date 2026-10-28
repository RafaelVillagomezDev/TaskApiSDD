import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { PrismaCsrfTokenRepository } from '../prisma-csrf-token.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaCsrfTokenRepository(prisma);
const at = (time: string) => new Date(`2026-10-28T${time}Z`);
// Huella única de 64 caracteres hexadecimales
const uniqueHash = () => randomUUID().replaceAll('-', '').repeat(2);

describe('PrismaCsrfTokenRepository', () => {
  afterAll(() => prisma.$disconnect());

  it('un token guardado vale hasta su caducidad y se puede reutilizar (RF-22)', async () => {
    const tokenHash = uniqueHash();
    await repository.save(tokenHash, at('10:30:00'));
    expect(await repository.isValid(tokenHash, at('10:00:00'))).toBe(true);
    expect(await repository.isValid(tokenHash, at('10:29:59'))).toBe(true);
    expect(await repository.isValid(tokenHash, at('10:30:00'))).toBe(false);
  });

  it('un token desconocido no vale', async () => {
    expect(await repository.isValid(uniqueHash(), at('10:00:00'))).toBe(false);
  });

  it('la limpieza borra solo los caducados (D-12)', async () => {
    const [expired, valid] = [uniqueHash(), uniqueHash()];
    await repository.save(expired, at('09:00:00'));
    await repository.save(valid, at('11:00:00'));

    await repository.deleteExpired(at('10:00:00'));

    expect(await prisma.csrfToken.count({ where: { tokenHash: expired } })).toBe(0);
    expect(await prisma.csrfToken.count({ where: { tokenHash: valid } })).toBe(1);
  });
});
