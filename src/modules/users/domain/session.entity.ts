// Duraciones de la sesión (RF-07, RF-11 a RF-13)
export const ACCESS_TOKEN_TTL_MS = 15 * 60_000;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 3_600_000;
export const SESSION_MAX_AGE_MS = 30 * 24 * 3_600_000;
export const REFRESH_GRACE_MS = 30_000;

export interface SessionSchedule {
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  // Login + 30 días: tope absoluto de la sesión
  expiresAt: Date;
}

export interface SessionProps extends SessionSchedule {
  id: string;
  userId: string;
  // Sube 1 en cada rotación
  generation: number;
  // Última rotación, para el margen de gracia
  rotatedAt: Date | null;
  createdAt: Date;
}

const plus = (instant: Date, milliseconds: number) => new Date(instant.getTime() + milliseconds);
const earliest = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);

// Sesión abierta en un login, con sus reglas de caducidad. Lógica pura
export class Session {
  private constructor(private readonly props: SessionProps) {}

  // Caducidades de una sesión que se abre en `now` (RF-07)
  static schedule(now: Date): SessionSchedule {
    const expiresAt = plus(now, SESSION_MAX_AGE_MS);
    return {
      accessExpiresAt: plus(now, ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: earliest(plus(now, REFRESH_TOKEN_TTL_MS), expiresAt),
      expiresAt,
    };
  }

  static restore(props: SessionProps): Session {
    return new Session({ ...props });
  }

  // El token de acceso deja de valer a los 15 minutos exactos (RF-20)
  isAccessExpired(now: Date): boolean {
    return now.getTime() >= this.props.accessExpiresAt.getTime();
  }

  // Se puede renovar si no han pasado 7 días desde la última renovación ni 30 desde el login (RF-12)
  isRefreshUsable(now: Date): boolean {
    return (
      now.getTime() < this.props.refreshExpiresAt.getTime() && now.getTime() < this.props.expiresAt.getTime()
    );
  }

  // Rotación: nueva generación, acceso de 15 min y refresh de 7 días sin pasar del tope (RF-11)
  rotate(now: Date): void {
    this.props.generation += 1;
    this.props.accessExpiresAt = plus(now, ACCESS_TOKEN_TTL_MS);
    this.props.refreshExpiresAt = earliest(plus(now, REFRESH_TOKEN_TTL_MS), this.props.expiresAt);
    this.props.rotatedAt = now;
  }

  // Dentro de los 30 s tras la última rotación, el refresh anterior aún devuelve los mismos tokens (RF-13)
  isWithinGrace(now: Date): boolean {
    const rotatedAt = this.props.rotatedAt;
    return rotatedAt !== null && now.getTime() - rotatedAt.getTime() <= REFRESH_GRACE_MS;
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get generation(): number {
    return this.props.generation;
  }

  get accessExpiresAt(): Date {
    return this.props.accessExpiresAt;
  }

  get refreshExpiresAt(): Date {
    return this.props.refreshExpiresAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get rotatedAt(): Date | null {
    return this.props.rotatedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
