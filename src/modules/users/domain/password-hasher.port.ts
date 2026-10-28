// Puerto de derivación de contraseñas (RNF-03, plan de la 002 D-2 y D-3)
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
  // Gasta el mismo tiempo que una verificación real y devuelve false: login con un email inexistente (RF-08)
  verifyDummy(password: string): Promise<boolean>;
}
