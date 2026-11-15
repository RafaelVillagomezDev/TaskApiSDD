import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { VerifySessionCsrfUseCase } from '../verify-session-csrf.use-case.js';

describe('VerifySessionCsrfUseCase', () => {
  const tokens = new CryptoTokenService();
  const useCase = new VerifySessionCsrfUseCase(tokens);
  const csrfToken = tokens.randomToken();
  const sessionCsrfHash = tokens.fingerprint(csrfToken);

  it('el token CSRF de la sesión coincide con su huella (RF-23)', () => {
    expect(() => useCase.execute(csrfToken, sessionCsrfHash)).not.toThrow();
  });

  it.each([
    ['otro token aleatorio', tokens.randomToken()],
    ['la propia huella', sessionCsrfHash],
    ['un token casi igual', `${csrfToken.slice(0, -1)}${csrfToken.endsWith('A') ? 'B' : 'A'}`],
  ])('%s → INVALID_CSRF_TOKEN (RF-23)', (_case, candidate) => {
    expect(() => useCase.execute(candidate, sessionCsrfHash)).toThrow(expect.objectContaining({ code: 'INVALID_CSRF_TOKEN' }));
  });

  it('compara las huellas en tiempo constante (R-6)', () => {
    const equals = import.meta.jest.spyOn(tokens, 'equals');
    useCase.execute(csrfToken, sessionCsrfHash);
    expect(equals).toHaveBeenCalledWith(sessionCsrfHash, sessionCsrfHash);
    equals.mockRestore();
  });
});
