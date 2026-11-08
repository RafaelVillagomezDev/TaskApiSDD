import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import { Pomodoro, type PomodoroTaskSnapshot } from './pomodoro.entity.js';

export interface PomodoroTaskProps {
  id: string;
  userId: string;
  // Sesión activa en la que está o sesión terminada en la que se completó; null = en espera (RF-23)
  pomodoroId: string | null;
  title: string;
  description: string | null;
  date: LocalDate;
  completed: boolean;
  completedAt: Date | null;
  // Lugar en la sesión (RF-64); null en espera
  position: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Datos para crear una tarea: siempre nace pendiente dentro de una sesión (RF-04, RF-52)
export interface NewPomodoroTask {
  userId: string;
  pomodoroId: string;
  title: string;
  description: string | null;
  date: LocalDate;
  position: number;
}

// Cambios de una edición: solo el título y la descripción, nunca la fecha (RF-48, RF-54)
export interface PomodoroTaskEdit {
  title?: string;
  description?: string | null;
}

// Tarea del pomodoro, independiente de las tareas de la 001 (RF-02)
export class PomodoroTask {
  private constructor(private readonly props: PomodoroTaskProps) {}

  static restore(props: PomodoroTaskProps): PomodoroTask {
    return new PomodoroTask({ ...props });
  }

  // Mismo formato de id que las sesiones (D-10 de la 001)
  static isValidId(id: string): boolean {
    return Pomodoro.isValidId(id);
  }

  // Pendiente y fuera de cualquier sesión (RF-23)
  isWaiting(): boolean {
    return this.props.pomodoroId === null && !this.props.completed;
  }

  // Sin mirar la fecha (RF-57); si ya estaba completada conserva el instante original (RF-13)
  complete(now: Date): void {
    if (this.props.completed) return;
    this.props.completed = true;
    this.props.completedAt = now;
  }

  uncomplete(): void {
    this.props.completed = false;
    this.props.completedAt = null;
  }

  edit(changes: PomodoroTaskEdit): void {
    if (changes.title !== undefined) {
      this.props.title = changes.title;
    }
    if (changes.description !== undefined) {
      this.props.description = changes.description;
    }
  }

  // Entra en una sesión en el lugar indicado; una fecha ya pasada toma la del día actual (RF-21, RF-64)
  moveTo(pomodoroId: string, position: number, today: LocalDate): void {
    this.props.pomodoroId = pomodoroId;
    this.props.position = position;
    if (this.props.date.isBefore(today)) {
      this.props.date = today;
    }
  }

  // Sale de la sesión y queda en espera (RF-23, RF-26)
  moveToWaiting(): void {
    this.props.pomodoroId = null;
    this.props.position = null;
  }

  toSnapshot(): PomodoroTaskSnapshot {
    return {
      id: this.props.id,
      title: this.props.title,
      description: this.props.description,
      date: this.props.date,
      completed: this.props.completed,
      completedAt: this.props.completedAt,
    };
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get pomodoroId(): string | null {
    return this.props.pomodoroId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | null {
    return this.props.description;
  }

  get date(): LocalDate {
    return this.props.date;
  }

  get completed(): boolean {
    return this.props.completed;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get position(): number | null {
    return this.props.position;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toProps(): PomodoroTaskProps {
    return { ...this.props };
  }
}
