import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { GetProfileUseCase } from '../get-profile.use-case.js';

describe('GetProfileUseCase', () => {
  let users: InMemoryUserRepository;
  let useCase: GetProfileUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    useCase = new GetProfileUseCase(users);
  });

  it('devuelve la cuenta del usuario de la sesión (RF-25)', async () => {
    const created = await users.create({ email: 'ana@example.com', name: 'Ana', passwordHash: 'fake$secreta' });
    await expect(useCase.execute(created.id)).resolves.toMatchObject({ id: created.id, email: 'ana@example.com' });
  });

  it('si la cuenta ya no existe → INVALID_TOKEN, como una sesión cerrada (RF-19)', async () => {
    await expect(useCase.execute('6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });
});
