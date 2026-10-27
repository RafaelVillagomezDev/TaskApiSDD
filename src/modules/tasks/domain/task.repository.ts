import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { NewTask, Task } from './task.entity.js';

export type TaskStatusFilter = 'all' | 'completed' | 'pending';

export interface TaskFilters {
  status: TaskStatusFilter;
  // Solo las tareas de ese día (RF-08)
  date?: LocalDate;
  // Rango de días, ambos incluidos; cualquiera de los dos puede faltar (RF-40)
  from?: LocalDate;
  to?: LocalDate;
}

export interface TaskPageResult {
  items: Task[];
  total: number;
}

// Puerto de salida de tareas; toda consulta va filtrada por usuario (RF-02)
export interface TaskRepository {
  create(task: NewTask): Promise<Task>;
  // null si no existe o pertenece a otro usuario (RF-16)
  findById(userId: string, id: string): Promise<Task | null>;
  // Guarda título, descripción y estado; devuelve la tarea con su nuevo updatedAt
  update(task: Task): Promise<Task>;
  // Orden: fecha ascendente y, dentro de cada fecha, orden de creación (RF-41)
  findPage(userId: string, filters: TaskFilters, pagination: Pagination): Promise<TaskPageResult>;
  // Días distintos con al menos una tarea completada, hasta `until` incluido, en orden ascendente (RF-17)
  findProductiveDates(userId: string, until: LocalDate): Promise<LocalDate[]>;
}
