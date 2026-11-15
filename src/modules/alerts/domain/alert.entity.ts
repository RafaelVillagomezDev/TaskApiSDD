import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';

export const ALERT_TYPES = ['daily', 'weekly', 'monthly'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

// Copia de una tarea en el momento del aviso: no sigue a la tarea original (RF-30)
export interface AlertTask {
  readonly id: string;
  readonly title: string;
  readonly date: LocalDate;
}

// Periodo de un aviso de un usuario: como máximo un aviso por tipo y periodo (RF-28)
export interface AlertPeriod {
  userId: string;
  type: AlertType;
  // Día, lunes o día 1 según el tipo
  periodStart: LocalDate;
  // Día, domingo o último día del mes según el tipo
  periodEnd: LocalDate;
}

export interface AlertProps extends AlertPeriod {
  id: string;
  tasks: AlertTask[];
  // Instante real de registro (RNF-02)
  createdAt: Date;
}

// Aviso registrado; inmutable una vez creado (RF-30)
export class Alert {
  private constructor(
    private readonly props: Readonly<Omit<AlertProps, 'tasks'>>,
    private readonly taskCopies: readonly AlertTask[],
  ) {}

  static restore(props: AlertProps): Alert {
    const tasks = Object.freeze(props.tasks.map(({ id, title, date }) => Object.freeze({ id, title, date })));
    return new Alert(Object.freeze({ ...props, createdAt: new Date(props.createdAt) }), tasks);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get type(): AlertType {
    return this.props.type;
  }

  get periodStart(): LocalDate {
    return this.props.periodStart;
  }

  get periodEnd(): LocalDate {
    return this.props.periodEnd;
  }

  get tasks(): readonly AlertTask[] {
    return this.taskCopies;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt);
  }
}
