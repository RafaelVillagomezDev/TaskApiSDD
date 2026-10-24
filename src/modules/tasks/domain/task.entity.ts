import { AppError } from '../../../shared/domain/app.error.js';
import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';

// Límites de texto de una tarea (RF-04, RF-05); los aplican los schemas Zod de entrada (D-17)
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TaskProps {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  // Día al que pertenece la tarea
  date: LocalDate;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Datos para crear una tarea: siempre nace pendiente (RF-03)
export interface NewTask {
  userId: string;
  title: string;
  description: string | null;
  date: LocalDate;
}

// Tarea de un usuario para un día concreto
export class Task {
  private constructor(private readonly props: TaskProps) {}

  static restore(props: TaskProps): Task {
    return new Task({ ...props });
  }

  // Un id con formato no UUID no puede existir: se responde TASK_NOT_FOUND sin consultar (D-10)
  static isValidId(id: string): boolean {
    return UUID_PATTERN.test(id);
  }

  // Los días pasados quedan cerrados: sus tareas solo se consultan (RF-14)
  assertModifiable(today: LocalDate): void {
    if (this.props.date.isBefore(today)) {
      throw new AppError('DAY_CLOSED');
    }
  }

  // Solo se completan tareas del día actual (RF-11, RF-14, RF-45); idempotente
  complete(today: LocalDate): void {
    this.assertModifiable(today);
    if (this.props.date.isAfter(today)) {
      throw new AppError('DAY_NOT_STARTED');
    }
    this.props.completed = true;
  }

  // Vuelve a pendiente una tarea de hoy o futura (RF-12, RF-14); idempotente
  uncomplete(today: LocalDate): void {
    this.assertModifiable(today);
    this.props.completed = false;
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
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

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toProps(): TaskProps {
    return { ...this.props };
  }
}
