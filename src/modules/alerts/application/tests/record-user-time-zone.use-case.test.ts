import { InMemoryUserTimeZoneRepository } from '../../../../../tests/support/in-memory-user-time-zone.repository.js';
import { RecordUserTimeZoneUseCase } from '../record-user-time-zone.use-case.js';

describe('RecordUserTimeZoneUseCase', () => {
  let zones: InMemoryUserTimeZoneRepository;
  let useCase: RecordUserTimeZoneUseCase;

  beforeEach(() => {
    zones = new InMemoryUserTimeZoneRepository();
    useCase = new RecordUserTimeZoneUseCase(zones);
  });

  it('guarda la zona de un usuario nuevo (RF-34)', async () => {
    await useCase.execute('user-1', 'Europe/Madrid');
    expect(zones.find('user-1')).toBe('Europe/Madrid');
    expect(zones.writes).toBe(1);
  });

  it('no vuelve a escribir si la zona no cambia (RF-34)', async () => {
    await useCase.execute('user-1', 'Europe/Madrid');
    await useCase.execute('user-1', 'Europe/Madrid');
    expect(zones.writes).toBe(1);
  });

  it('actualiza la zona cuando el usuario cambia de zona (RF-34)', async () => {
    await useCase.execute('user-1', 'Europe/Madrid');
    await useCase.execute('user-1', 'America/New_York');
    expect(zones.find('user-1')).toBe('America/New_York');
    expect(zones.writes).toBe(2);
  });

  it('cada usuario tiene su propia zona', async () => {
    await useCase.execute('user-1', 'Europe/Madrid');
    await useCase.execute('user-2', 'Asia/Tokyo');
    expect(zones.find('user-1')).toBe('Europe/Madrid');
    expect(zones.find('user-2')).toBe('Asia/Tokyo');
  });
});
