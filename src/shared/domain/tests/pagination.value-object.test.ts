import { createPage, Pagination } from '../pagination.value-object.js';

describe('Pagination', () => {
  it('calcula el desplazamiento de la página', () => {
    expect(new Pagination(1, 50).offset).toBe(0);
    expect(new Pagination(5, 50).offset).toBe(200);
  });
});

describe('createPage', () => {
  it('calcula el total de páginas redondeando hacia arriba (RF-39)', () => {
    const page = createPage(['a', 'b'], new Pagination(5, 50), 230);
    expect(page).toEqual({ items: ['a', 'b'], page: 5, pageSize: 50, totalItems: 230, totalPages: 5 });
  });

  it('devuelve 0 páginas cuando no hay elementos', () => {
    expect(createPage([], new Pagination(1, 50), 0)).toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      totalItems: 0,
      totalPages: 0,
    });
  });

  it('una página fuera de rango devuelve items vacío y los totales reales', () => {
    expect(createPage([], new Pagination(6, 50), 230)).toEqual({
      items: [],
      page: 6,
      pageSize: 50,
      totalItems: 230,
      totalPages: 5,
    });
  });
});
