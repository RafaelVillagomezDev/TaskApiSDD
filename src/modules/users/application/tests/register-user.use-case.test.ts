import { FakePasswordHasher } from '../../../../../tests/support/fake-password-hasher.adapter.js';
import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { RegisterUserUseCase } from '../register-user.use-case.js';

describe('RegisterUserUseCase', () => {
  let users: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let useCase: RegisterUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    useCase = new RegisterUserUseCase(users, hasher);
  });

  it('crea la cuenta con el email, el nombre y la huella de la contraseña (RF-01, RNF-03)', async () => {
    const user = await useCase.execute({ email: 'ana@example.com', password: 'correct horse battery', name: 'Ana' });
    expect(user).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
    expect(user.passwordHash).toBe(await hasher.hash('correct horse battery'));
    expect((await users.findByEmail('ana@example.com'))?.id).toBe(user.id);
  });

  it('acepta una cuenta sin nombre', async () => {
    expect((await useCase.execute({ email: 'bea@example.com', password: 'correct horse battery', name: null })).name).toBeNull();
  });

  it('un email ya registrado → EMAIL_ALREADY_REGISTERED y no crea otra cuenta (RF-03)', async () => {
    await useCase.execute({ email: 'ana@example.com', password: 'correct horse battery', name: null });
    await expect(
      useCase.execute({ email: 'ana@example.com', password: 'otra contraseña larga', name: 'Otra' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    expect(users.count()).toBe(1);
  });
});
