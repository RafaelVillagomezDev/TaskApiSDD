import { readFileSync } from 'node:fs';

import { Prisma } from '@prisma/client';

import { getPrismaClient } from '../prisma.client.js';

// Modelos declarados en el esquema: `model Nombre {`
const schemaModels = (): string[] =>
  [...readFileSync('prisma/schema.prisma', 'utf8').matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] ?? '');

// Nombre del acceso en el cliente: Task → task, LoginAttempt → loginAttempt
const delegateName = (model: string) => `${model.charAt(0).toLowerCase()}${model.slice(1)}`;

// Detecta un cliente de Prisma generado antes del último cambio de schema.prisma: los repositorios
// fallarían con "this.prisma.<modelo> is undefined". Se arregla con `prisma generate` dentro del contenedor
describe('cliente de Prisma generado', () => {
  it('conoce todos los modelos de schema.prisma, ni más ni menos', () => {
    expect(Object.values(Prisma.ModelName).sort()).toEqual(schemaModels().sort());
  });

  it.each(schemaModels())('this.prisma.%s existe y se puede consultar', (model) => {
    const delegate = (getPrismaClient() as unknown as Record<string, { findMany?: unknown }>)[delegateName(model)];
    expect(typeof delegate?.findMany).toBe('function');
  });
});
