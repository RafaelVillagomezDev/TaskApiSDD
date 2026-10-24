// Página pedida por el cliente (RF-39); los límites los valida el schema de entrada
export class Pagination {
  constructor(
    readonly page: number,
    readonly pageSize: number,
  ) {}

  get offset(): number {
    return (this.page - 1) * this.pageSize;
  }
}

// Forma de `data` en las listas (spec, Sobre de respuesta)
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function createPage<T>(items: T[], pagination: Pagination, totalItems: number): Page<T> {
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}
