import type { Prisma, PrismaClient, RefreshToken as RefreshTokenRow, Session as SessionRow } from '@prisma/client';

import { Session } from '../domain/session.entity.js';
import type {
  NewSession,
  RefreshTokenRecord,
  RefreshUnitOfWork,
  SessionRecord,
  SessionRepository,
} from '../domain/session.repository.js';

function toRecord(row: SessionRow): SessionRecord {
  return {
    session: Session.restore({
      id: row.id,
      userId: row.userId,
      generation: row.generation,
      accessExpiresAt: row.accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
      expiresAt: row.expiresAt,
      rotatedAt: row.rotatedAt,
      createdAt: row.createdAt,
    }),
    csrfTokenHash: row.csrfTokenHash,
    csrfTokenSealed: row.csrfTokenSealed,
    graceTokens: row.graceTokens,
  };
}

function toRefreshRecord(token: RefreshTokenRow & { session: SessionRow }): RefreshTokenRecord {
  return {
    ...toRecord(token.session),
    tokenHash: token.tokenHash,
    tokenGeneration: token.generation,
    tokenRotatedAt: token.rotatedAt,
  };
}

// Escrituras de una renovación sobre la transacción en curso (D-4)
function unitOfWork(tx: Prisma.TransactionClient): RefreshUnitOfWork {
  return {
    rotate: async (record, next, now) => {
      const { session } = record;
      await tx.session.update({
        where: { id: session.id },
        data: {
          generation: session.generation,
          accessTokenHash: next.accessTokenHash,
          accessExpiresAt: session.accessExpiresAt,
          refreshExpiresAt: session.refreshExpiresAt,
          rotatedAt: session.rotatedAt,
          graceTokens: next.graceTokens,
        },
      });
      await tx.refreshToken.update({ where: { tokenHash: record.tokenHash }, data: { rotatedAt: now } });
      await tx.refreshToken.create({
        data: { tokenHash: next.refreshTokenHash, sessionId: session.id, generation: session.generation },
      });
    },
    // Sus refresh tokens se borran en cascada
    close: async (sessionId) => {
      await tx.session.deleteMany({ where: { id: sessionId } });
    },
  };
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewSession): Promise<Session> {
    const row = await this.prisma.session.create({
      data: {
        userId: input.userId,
        accessTokenHash: input.accessTokenHash,
        csrfTokenHash: input.csrfTokenHash,
        csrfTokenSealed: input.csrfTokenSealed,
        ...input.schedule,
        createdAt: input.now,
        refreshTokens: { create: { tokenHash: input.refreshTokenHash, generation: 0 } },
      },
    });
    return toRecord(row).session;
  }

  // Por clave primaria (plan de la 003, D-6)
  async findById(sessionId: string): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findUnique({ where: { id: sessionId } });
    return row ? toRecord(row) : null;
  }

  async findByAccessTokenHash(accessTokenHash: string): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findUnique({ where: { accessTokenHash } });
    return row ? toRecord(row) : null;
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<RefreshTokenRecord | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: refreshTokenHash },
      include: { session: true },
    });
    return token ? toRefreshRecord(token) : null;
  }

  // Bloquea la fila de la sesión hasta el final de la transacción: una segunda renovación simultánea espera
  // y, al entrar, lee el token ya rotado (RF-13; plan de la 002, D-4)
  withRefreshTokenLocked<T>(
    refreshTokenHash: string,
    work: (record: RefreshTokenRecord | null, unit: RefreshUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.refreshToken.findUnique({ where: { tokenHash: refreshTokenHash } });
      if (!token) return work(null, unitOfWork(tx));
      await tx.$queryRaw`SELECT 1 FROM "sessions" WHERE "id" = ${token.sessionId}::uuid FOR UPDATE`;
      const locked = await tx.refreshToken.findUnique({
        where: { tokenHash: refreshTokenHash },
        include: { session: true },
      });
      return work(locked ? toRefreshRecord(locked) : null, unitOfWork(tx));
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async deleteAllExcept(userId: string, keepSessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId, id: { not: keepSessionId } } });
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { refreshExpiresAt: { lte: now } }] },
    });
  }

  async clearGraceTokens(graceCutoff: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { graceTokens: { not: null }, rotatedAt: { lt: graceCutoff } },
      data: { graceTokens: null },
    });
  }
}
