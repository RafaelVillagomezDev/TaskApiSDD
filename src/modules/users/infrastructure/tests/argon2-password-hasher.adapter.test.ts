import { Argon2PasswordHasher } from '../argon2-password-hasher.adapter.js';

describe('Argon2PasswordHasher (RNF-03, D-2, D-3)', () => {
  const hasher = new Argon2PasswordHasher();

  it('guarda Argon2id con los parámetros mínimos de OWASP en una cadena PHC', async () => {
    const hash = await hasher.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(hash).not.toContain('correct horse battery');
  });

  it('verifica la contraseña correcta y rechaza una incorrecta', async () => {
    const hash = await hasher.hash('correct horse battery');
    expect(await hasher.verify('correct horse battery', hash)).toBe(true);
    expect(await hasher.verify('correct horse batterY', hash)).toBe(false);
  });

  it('usa una sal distinta cada vez: la misma contraseña da huellas distintas', async () => {
    expect(await hasher.hash('misma contraseña')).not.toBe(await hasher.hash('misma contraseña'));
  });

  it('admite espacios y caracteres no ASCII sin alterarlos (RF-04)', async () => {
    const password = ' contraseña con ñ y emojis 🙂 ';
    const hash = await hasher.hash(password);
    expect(await hasher.verify(password, hash)).toBe(true);
    expect(await hasher.verify(password.trim(), hash)).toBe(false);
  });

  it('verifyDummy siempre devuelve false (login con un email inexistente, RF-08)', async () => {
    expect(await hasher.verifyDummy('correct horse battery')).toBe(false);
    expect(await hasher.verifyDummy('')).toBe(false);
  });
});
