import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { AppError } from '../../../../shared/domain/app.error.js';
import { Session } from '../../domain/session.entity.js';
import { AesGcmSecretCipher } from '../../infrastructure/aes-gcm-secret-cipher.adapter.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { GetSessionCsrfTokenUseCase } from '../get-session-csrf-token.use-case.js';

const USER_ID = '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b';

describe('GetSessionCsrfTokenUseCase', () => {
  const tokens = new CryptoTokenService();
  // Un token aleatorio son 32 bytes: sirve como clave AES-256 sin depender de ningún secreto
  const cipher = new AesGcmSecretCipher(Buffer.from(tokens.randomToken(), 'base64url'));
  const clock = new FakeClock('2026-10-29T10:00:00Z');
  let sessions: InMemorySessionRepository;
  let useCase: GetSessionCsrfTokenUseCase;

  // Sesión con la copia cifrada de su token CSRF, como la deja el login
  const openSession = (csrfToken: string, csrfTokenSealed = cipher.seal(csrfToken)) =>
    sessions.create({
      userId: USER_ID,
      accessTokenHash: tokens.fingerprint(tokens.randomToken()),
      refreshTokenHash: tokens.fingerprint(tokens.randomToken()),
      csrfTokenHash: tokens.fingerprint(csrfToken),
      csrfTokenSealed,
      schedule: Session.schedule(clock.now()),
      now: clock.now(),
    });

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    useCase = new GetSessionCsrfTokenUseCase(sessions, cipher);
  });

  it('devuelve el token CSRF de la sesión, el mismo que entregó el login (RF-01, RF-02)', async () => {
    const csrfToken = tokens.randomToken();
    const session = await openSession(csrfToken);
    await expect(useCase.execute(session.id)).resolves.toBe(csrfToken);
  });

  it('cada sesión tiene el suyo (RF-01)', async () => {
    const first = await openSession(tokens.randomToken());
    const second = await openSession(tokens.randomToken());
    expect(await useCase.execute(first.id)).not.toBe(await useCase.execute(second.id));
  });

  it('si la sesión ya no existe → INVALID_TOKEN, como una sesión cerrada (RF-19 de la 002)', async () => {
    const session = await openSession(tokens.randomToken());
    await sessions.delete(session.id);
    await expect(useCase.execute(session.id)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('una copia que no se puede abrir (alterada o con otra clave) es un error interno, no del cliente (D-4)', async () => {
    const otherKey = new AesGcmSecretCipher(Buffer.from(tokens.randomToken(), 'base64url'));
    const session = await openSession('token', otherKey.seal('token'));
    const result = useCase.execute(session.id);
    await expect(result).rejects.toThrow();
    await expect(result).rejects.not.toBeInstanceOf(AppError);
  });
});
