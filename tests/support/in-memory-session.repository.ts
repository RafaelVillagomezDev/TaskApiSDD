import { randomUUID } from 'node:crypto';

import { Session, type SessionProps } from '../../src/modules/users/domain/session.entity.js';
import type {
  NewSession,
  RefreshTokenRecord,
  RefreshUnitOfWork,
  SessionRecord,
  SessionRepository,
  SessionTokenHashes,
} from '../../src/modules/users/domain/session.repository.js';

interface StoredSession {
  props: SessionProps;
  accessTokenHash: string;
  csrfTokenHash: string;
  graceTokens: string | null;
}

interface StoredRefreshToken {
  sessionId: string;
  generation: number;
  rotatedAt: Date | null;
}

// Copia de los datos de una sesión a partir de la entidad
const propsOf = (session: Session): SessionProps => ({
  id: session.id,
  userId: session.userId,
  generation: session.generation,
  accessExpiresAt: session.accessExpiresAt,
  refreshExpiresAt: session.refreshExpiresAt,
  expiresAt: session.expiresAt,
  rotatedAt: session.rotatedAt,
  createdAt: session.createdAt,
});

// Implementación en memoria de SessionRepository, con la tabla de refresh tokens (plan de la 001, D-21).
// Un solo hilo: withRefreshTokenLocked no necesita bloqueo
export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();

  async create(input: NewSession): Promise<Session> {
    const props: SessionProps = {
      id: randomUUID(),
      userId: input.userId,
      generation: 0,
      ...input.schedule,
      rotatedAt: null,
      createdAt: input.now,
    };
    this.sessions.set(props.id, {
      props,
      accessTokenHash: input.accessTokenHash,
      csrfTokenHash: input.csrfTokenHash,
      graceTokens: null,
    });
    this.refreshTokens.set(input.refreshTokenHash, { sessionId: props.id, generation: 0, rotatedAt: null });
    return Session.restore(props);
  }

  async findByAccessTokenHash(accessTokenHash: string): Promise<SessionRecord | null> {
    const stored = [...this.sessions.values()].find((candidate) => candidate.accessTokenHash === accessTokenHash);
    return stored ? this.toRecord(stored) : null;
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<RefreshTokenRecord | null> {
    const token = this.refreshTokens.get(refreshTokenHash);
    const stored = token ? this.sessions.get(token.sessionId) : undefined;
    if (!token || !stored) return null;
    return {
      ...this.toRecord(stored),
      tokenHash: refreshTokenHash,
      tokenGeneration: token.generation,
      tokenRotatedAt: token.rotatedAt,
    };
  }

  async withRefreshTokenLocked<T>(
    refreshTokenHash: string,
    work: (record: RefreshTokenRecord | null, unit: RefreshUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const unit: RefreshUnitOfWork = {
      rotate: async (record, next: SessionTokenHashes & { graceTokens: string }, now) => {
        const stored = this.sessions.get(record.session.id);
        const used = this.refreshTokens.get(record.tokenHash);
        if (!stored || !used) throw new Error('Sesión o refresh token inexistentes en el repositorio en memoria');
        stored.props = propsOf(record.session);
        stored.accessTokenHash = next.accessTokenHash;
        stored.graceTokens = next.graceTokens;
        used.rotatedAt = now;
        this.refreshTokens.set(next.refreshTokenHash, {
          sessionId: record.session.id,
          generation: record.session.generation,
          rotatedAt: null,
        });
      },
      close: (sessionId) => this.delete(sessionId),
    };
    return work(await this.findByRefreshTokenHash(refreshTokenHash), unit);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    for (const [hash, token] of this.refreshTokens) {
      if (token.sessionId === sessionId) this.refreshTokens.delete(hash);
    }
  }

  async deleteAllExcept(userId: string, keepSessionId: string): Promise<void> {
    for (const stored of [...this.sessions.values()]) {
      if (stored.props.userId === userId && stored.props.id !== keepSessionId) await this.delete(stored.props.id);
    }
  }

  async deleteExpired(now: Date): Promise<void> {
    for (const stored of [...this.sessions.values()]) {
      const { expiresAt, refreshExpiresAt, id } = stored.props;
      if (expiresAt.getTime() <= now.getTime() || refreshExpiresAt.getTime() <= now.getTime()) await this.delete(id);
    }
  }

  async clearGraceTokens(graceCutoff: Date): Promise<void> {
    for (const stored of this.sessions.values()) {
      const rotatedAt = stored.props.rotatedAt;
      if (rotatedAt && rotatedAt.getTime() < graceCutoff.getTime()) stored.graceTokens = null;
    }
  }

  // Ayudas para los tests
  count(): number {
    return this.sessions.size;
  }

  sessionIdsOf(userId: string): string[] {
    return [...this.sessions.values()].filter((stored) => stored.props.userId === userId).map((s) => s.props.id);
  }

  private toRecord(stored: StoredSession): SessionRecord {
    return {
      session: Session.restore({ ...stored.props }),
      csrfTokenHash: stored.csrfTokenHash,
      graceTokens: stored.graceTokens,
    };
  }
}
