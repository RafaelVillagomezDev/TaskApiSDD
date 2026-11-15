import { AppError } from '../../../shared/domain/app.error.js';
import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';

// Límites de una sesión (RF-09, RF-10); los aplican los schemas Zod de entrada y los casos de uso
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 120;
export const DEFAULT_DURATION_MINUTES = 25;
export const MAX_TASKS_PER_POMODORO = 20;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PomodoroStatus = 'running' | 'paused' | 'finished';
export type PomodoroEndReason = 'time' | 'manual';

// Copia de una tarea en el instante en que terminó la sesión (RF-16)
export interface PomodoroTaskSnapshot {
  id: string;
  title: string;
  description: string | null;
  date: LocalDate;
  completed: boolean;
  completedAt: Date | null;
}

export interface PomodoroProps {
  id: string;
  userId: string;
  durationMinutes: number;
  status: PomodoroStatus;
  startedAt: Date;
  // Fin previsto mientras está en curso; null si está pausada o terminada (RF-30)
  endsAt: Date | null;
  // Tiempo que queda mientras está pausada (RF-30)
  remainingMs: number | null;
  finishedAt: Date | null;
  // Día local del fin según la zona recordada del usuario (RF-40)
  finishedOn: LocalDate | null;
  endReason: PomodoroEndReason | null;
  focusedSeconds: number | null;
  snapshot: PomodoroTaskSnapshot[] | null;
  createdAt: Date;
}

// Datos para crear una sesión: siempre nace en curso (RF-08)
export interface NewPomodoro {
  userId: string;
  durationMinutes: number;
  startedAt: Date;
  endsAt: Date;
}

// Lo que se guarda al terminar, además del instante y el motivo (RF-16, RF-40)
export interface FinishDetails {
  finishedOn: LocalDate;
  snapshot: PomodoroTaskSnapshot[];
}

// Sesión pomodoro: el estado se calcula con el instante que recibe cada método, nunca con el reloj del
// dispositivo (RNF-02)
export class Pomodoro {
  private constructor(private readonly props: PomodoroProps) {}

  static restore(props: PomodoroProps): Pomodoro {
    return new Pomodoro({ ...props, snapshot: props.snapshot ? [...props.snapshot] : null });
  }

  // Un id con formato no UUID no puede existir: se responde POMODORO_NOT_FOUND sin consultar (D-10 de la 001)
  static isValidId(id: string): boolean {
    return UUID_PATTERN.test(id);
  }

  // Sesión nueva: fin previsto = inicio + duración (RF-08)
  static plan(userId: string, durationMinutes: number, now: Date): NewPomodoro {
    return {
      userId,
      durationMinutes,
      startedAt: now,
      endsAt: new Date(now.getTime() + durationMinutes * MS_PER_MINUTE),
    };
  }

  // En curso o pausada (spec, Términos)
  isActive(): boolean {
    return this.props.status !== 'finished';
  }

  // En curso y con el fin previsto ya alcanzado: está terminada aunque nadie lo haya pedido (RF-15)
  isDue(now: Date): boolean {
    return this.props.status === 'running' && this.props.endsAt !== null && this.props.endsAt <= now;
  }

  // Segundos que quedan, redondeados hacia arriba; 0 si está terminada o vencida
  remainingSeconds(now: Date): number {
    if (this.props.status === 'finished') return 0;
    return Math.ceil(this.remainingMsAt(now) / MS_PER_SECOND);
  }

  // Detiene el temporizador y guarda el tiempo que queda (RF-30)
  pause(now: Date): void {
    if (this.props.status !== 'running' || this.isDue(now)) throw new AppError('INVALID_POMODORO_STATE');
    this.props.remainingMs = this.remainingMsAt(now);
    this.props.endsAt = null;
    this.props.status = 'paused';
  }

  // Vuelve a en curso con un fin previsto nuevo: instante de reanudar + tiempo que quedaba (RF-31)
  resume(now: Date): void {
    if (this.props.status !== 'paused') throw new AppError('INVALID_POMODORO_STATE');
    this.props.endsAt = new Date(now.getTime() + (this.props.remainingMs ?? 0));
    this.props.remainingMs = null;
    this.props.status = 'running';
  }

  // Asienta una sesión vencida: termina en su fin previsto con toda la duración de concentración (RF-15, RF-33)
  finishByTime(now: Date, details: FinishDetails): void {
    const endsAt = this.props.endsAt;
    if (!this.isDue(now) || endsAt === null) throw new AppError('INVALID_POMODORO_STATE');
    this.close(endsAt, 'time', this.props.durationMinutes * 60, details);
  }

  // Termina a mano una sesión en curso o pausada; una vencida ya terminó por tiempo (RF-32, RF-33)
  finishManually(now: Date, details: FinishDetails): void {
    if (!this.isActive() || this.isDue(now)) throw new AppError('INVALID_POMODORO_STATE');
    const elapsedMs = this.props.durationMinutes * MS_PER_MINUTE - this.remainingMsAt(now);
    this.close(now, 'manual', Math.floor(elapsedMs / MS_PER_SECOND), details);
  }

  private close(finishedAt: Date, reason: PomodoroEndReason, focusedSeconds: number, details: FinishDetails): void {
    this.props.status = 'finished';
    this.props.finishedAt = finishedAt;
    this.props.endReason = reason;
    this.props.focusedSeconds = focusedSeconds;
    this.props.finishedOn = details.finishedOn;
    this.props.snapshot = [...details.snapshot];
    this.props.endsAt = null;
    this.props.remainingMs = null;
  }

  // Tiempo que queda: el guardado si está pausada; el que falta hasta el fin previsto si está en curso
  private remainingMsAt(now: Date): number {
    if (this.props.status === 'paused') return this.props.remainingMs ?? 0;
    if (this.props.endsAt === null) return 0;
    return Math.max(0, this.props.endsAt.getTime() - now.getTime());
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get durationMinutes(): number {
    return this.props.durationMinutes;
  }

  get status(): PomodoroStatus {
    return this.props.status;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get endsAt(): Date | null {
    return this.props.endsAt;
  }

  get remainingMs(): number | null {
    return this.props.remainingMs;
  }

  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }

  get finishedOn(): LocalDate | null {
    return this.props.finishedOn;
  }

  get endReason(): PomodoroEndReason | null {
    return this.props.endReason;
  }

  get focusedSeconds(): number | null {
    return this.props.focusedSeconds;
  }

  get snapshot(): PomodoroTaskSnapshot[] | null {
    return this.props.snapshot ? [...this.props.snapshot] : null;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toProps(): PomodoroProps {
    return { ...this.props, snapshot: this.snapshot };
  }
}
