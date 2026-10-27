import { createTaskBodySchema, listTasksQuerySchema } from '../task.schema.js';

describe('createTaskBodySchema', () => {
  it('recorta espacios y convierte la fecha en LocalDate (RF-38, RF-06)', () => {
    const result = createTaskBodySchema.parse({ title: '  Comprar pan  ', description: '  Integral ', date: '2026-10-24' });
    expect(result.title).toBe('Comprar pan');
    expect(result.description).toBe('Integral');
    expect(result.date.toString()).toBe('2026-10-24');
  });

  it.each([undefined, null, '', '    '])('descripción %p se guarda como null (RF-38)', (description) => {
    const result = createTaskBodySchema.parse({ title: 'Tarea', description, date: '2026-10-24' });
    expect(result.description).toBeNull();
  });

  it('acepta un título de 200 caracteres y rechaza uno de 201 (RF-04)', () => {
    expect(createTaskBodySchema.safeParse({ title: 'a'.repeat(200), date: '2026-10-24' }).success).toBe(true);
    expect(createTaskBodySchema.safeParse({ title: 'a'.repeat(201), date: '2026-10-24' }).success).toBe(false);
  });

  it.each([undefined, '', '   '])('rechaza el título %p (RF-04)', (title) => {
    expect(createTaskBodySchema.safeParse({ title, date: '2026-10-24' }).success).toBe(false);
  });

  it('cuenta los límites después de recortar espacios', () => {
    expect(createTaskBodySchema.safeParse({ title: `  ${'a'.repeat(200)}  `, date: '2026-10-24' }).success).toBe(true);
  });

  it('acepta una descripción de 1000 caracteres y rechaza una de 1001 (RF-05)', () => {
    const base = { title: 'Tarea', date: '2026-10-24' };
    expect(createTaskBodySchema.safeParse({ ...base, description: 'd'.repeat(1000) }).success).toBe(true);
    expect(createTaskBodySchema.safeParse({ ...base, description: 'd'.repeat(1001) }).success).toBe(false);
  });

  it.each([undefined, '2026-02-30', '24/10/2026', '2026-10-24T10:00:00Z', 20261024])(
    'rechaza la fecha %p (RF-06)',
    (date) => {
      expect(createTaskBodySchema.safeParse({ title: 'Tarea', date }).success).toBe(false);
    },
  );
});

describe('listTasksQuerySchema', () => {
  it('aplica los valores por defecto: status all, page 1, pageSize 50 (RF-39)', () => {
    const result = listTasksQuerySchema.parse({});
    expect(result).toMatchObject({ status: 'all', page: 1, pageSize: 50 });
    expect(result.date).toBeUndefined();
  });

  it('convierte date en LocalDate y los números de la query', () => {
    const result = listTasksQuerySchema.parse({ date: '2026-10-24', status: 'pending', page: '2', pageSize: '10' });
    expect(result.date?.toString()).toBe('2026-10-24');
    expect(result).toMatchObject({ status: 'pending', page: 2, pageSize: 10 });
  });

  it('rechaza una fecha no válida (RF-06)', () => {
    expect(listTasksQuerySchema.safeParse({ date: '2026-13-01' }).success).toBe(false);
  });

  it('rechaza un status desconocido (RF-10)', () => {
    expect(listTasksQuerySchema.safeParse({ status: 'done' }).success).toBe(false);
  });

  it('convierte from y to en LocalDate, juntos o por separado (RF-40)', () => {
    const both = listTasksQuerySchema.parse({ from: '2026-10-20', to: '2026-10-24' });
    expect(both.from?.toString()).toBe('2026-10-20');
    expect(both.to?.toString()).toBe('2026-10-24');
    expect(listTasksQuerySchema.parse({ from: '2026-10-20' }).to).toBeUndefined();
    expect(listTasksQuerySchema.parse({ to: '2026-10-24' }).from).toBeUndefined();
  });

  it('acepta from igual a to (rango de un día)', () => {
    expect(listTasksQuerySchema.safeParse({ from: '2026-10-24', to: '2026-10-24' }).success).toBe(true);
  });

  it.each([{ from: '2026-02-30' }, { to: '24/10/2026' }])('rechaza un día no válido en el rango %p (RF-06)', (query) => {
    expect(listTasksQuerySchema.safeParse(query).success).toBe(false);
  });

  it('rechaza from posterior a to, señalando el campo to (RF-43)', () => {
    const result = listTasksQuerySchema.safeParse({ from: '2026-10-25', to: '2026-10-24' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['to']]);
  });

  it.each([{ from: '2026-10-20' }, { to: '2026-10-24' }, { from: '2026-10-20', to: '2026-10-24' }])(
    'rechaza date combinado con %p, señalando el campo date (RF-43)',
    (range) => {
      const result = listTasksQuerySchema.safeParse({ date: '2026-10-24', ...range });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([['date']]);
    },
  );

  it.each([{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'uno' }, { pageSize: '0' }, { pageSize: '101' }])(
    'rechaza la paginación %p (RF-42)',
    (query) => {
      expect(listTasksQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  it('acepta pageSize 100 (RF-42)', () => {
    expect(listTasksQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100);
  });
});
