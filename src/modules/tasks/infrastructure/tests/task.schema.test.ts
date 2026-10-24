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
});
