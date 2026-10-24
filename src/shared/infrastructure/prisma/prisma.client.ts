import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

// Instancia única de PrismaClient, creada al primer uso para que importar este módulo no abra conexiones
export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}
