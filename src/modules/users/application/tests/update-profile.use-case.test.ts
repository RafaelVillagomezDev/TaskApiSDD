import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { UpdateProfileUseCase } from '../update-profile.use-case.js';

describe('UpdateProfileUseCase', () => {
  let users: InMemoryUserRepository;
  let useCase: UpdateProfileUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    useCase = new UpdateProfileUseCase(users);
  });

  const createAna = () => users.create({ email: 'ana@example.com', name: null, passwordHash: 'fake$secreta' });

  it('cambia el nombre recortado, lo guarda y devuelve la cuenta actualizada (RF-05, RF-26)', async () => {
    const ana = await createAna();
    const updated = await useCase.execute(ana.id, '  Ana  ');
    expect(updated).toMatchObject({ id: ana.id, email: 'ana@example.com', name: 'Ana' });
    expect((await users.findById(ana.id))?.name).toBe('Ana');
  });

  it.each(['   ', null])('nombre %p → se guarda null (RF-05)', async (name) => {
    const ana = await users.create({ email: 'ana@example.com', name: 'Ana', passwordHash: 'fake$secreta' });
    expect((await useCase.execute(ana.id, name)).name).toBeNull();
    expect((await users.findById(ana.id))?.name).toBeNull();
  });

  it('no toca el email, la contraseña ni la fecha de alta (RF-26)', async () => {
    const ana = await createAna();
    const updated = await useCase.execute(ana.id, 'Ana');
    expect(updated.email).toBe(ana.email);
    expect(updated.passwordHash).toBe(ana.passwordHash);
    expect(updated.createdAt).toEqual(ana.createdAt);
  });

  it('si la cuenta ya no existe → INVALID_TOKEN, como una sesión cerrada (RF-19)', async () => {
    await expect(useCase.execute('6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b', 'Ana')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });
});
