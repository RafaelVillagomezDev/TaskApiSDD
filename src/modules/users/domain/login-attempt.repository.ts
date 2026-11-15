import type { LoginThrottle } from './login-throttle.value-object.js';

// Puerto de salida de los fallos de login por email normalizado, exista o no la cuenta (RF-09)
export interface LoginAttemptRepository {
  // Sin registro → LoginThrottle.empty()
  find(email: string): Promise<LoginThrottle>;
  save(email: string, throttle: LoginThrottle): Promise<void>;
  clear(email: string): Promise<void>;
  // Limpieza (D-12): sin bloqueo vigente ni fallos en la ventana
  deleteStale(now: Date): Promise<void>;
}
