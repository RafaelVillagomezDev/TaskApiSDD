import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryCsrfTokenRepository } from '../../../../../tests/support/in-memory-csrf-token.repository.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { IssueCsrfTokenUseCase, PRESESSION_CSRF_TTL_MS } from '../issue-csrf-token.use-case.js';

describe('IssueCsrfTokenUseCase', () => {
  let clock: FakeClock;
  let csrfTokens: InMemoryCsrfTokenRepository;
  let useCase: IssueCsrfTokenUseCase;
  const tokens = new CryptoTokenService();

  beforeEach(() => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    csrfTokens = new InMemoryCsrfTokenRepository();
    useCase = new IssueCsrfTokenUseCase(tokens, csrfTokens, clock);
  });

  it('vale 30 minutos (RF-22)', () => {
    expect(PRESESSION_CSRF_TTL_MS).toBe(30 * 60_000);
  });

  it('devuelve un token nuevo cada vez y guarda solo su huella (RF-22, RNF-06)', async () => {
    const token = await useCase.execute();
    expect(token).not.toBe(await useCase.execute());
    expect(csrfTokens.hashes()).toContain(tokens.fingerprint(token));
    expect(csrfTokens.hashes()).not.toContain(token);
  });

  it('el token vale hasta 30 minutos después de emitirse (RF-22)', async () => {
    const token = await useCase.execute();
    const hash = tokens.fingerprint(token);
    expect(await csrfTokens.isValid(hash, new Date('2026-10-28T10:29:59Z'))).toBe(true);
    expect(await csrfTokens.isValid(hash, new Date('2026-10-28T10:30:00Z'))).toBe(false);
  });
});
