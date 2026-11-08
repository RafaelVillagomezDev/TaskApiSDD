import { InMemoryUserTimeZoneRepository } from '../../../../../tests/support/in-memory-user-time-zone.repository.js';
import { GetUserTimeZoneUseCase } from '../get-user-time-zone.use-case.js';

describe('GetUserTimeZoneUseCase', () => {
  let zones: InMemoryUserTimeZoneRepository;
  let useCase: GetUserTimeZoneUseCase;

  beforeEach(() => {
    zones = new InMemoryUserTimeZoneRepository();
    useCase = new GetUserTimeZoneUseCase(zones);
  });

  it('devuelve la zona recordada del usuario (RF-40 de la 004)', async () => {
    await zones.record('user-1', 'Europe/Madrid');
    await expect(useCase.execute('user-1')).resolves.toBe('Europe/Madrid');
  });

  it('devuelve la última zona recordada cuando el usuario cambia de zona', async () => {
    await zones.record('user-1', 'Europe/Madrid');
    await zones.record('user-1', 'America/New_York');
    await expect(useCase.execute('user-1')).resolves.toBe('America/New_York');
  });

  it('devuelve null si el usuario no tiene ninguna zona recordada', async () => {
    await zones.record('user-2', 'Asia/Tokyo');
    await expect(useCase.execute('user-1')).resolves.toBeNull();
  });
});
