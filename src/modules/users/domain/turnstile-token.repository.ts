// Puerto de salida de los tokens de Turnstile recibidos: solo se guarda su huella, sin relación con el email ni
// con la cuenta (RF-20 a RF-23 de la 005)
export interface TurnstileTokenRepository {
  // Reserva atómica: true si el token no estaba reservado o su reserva ya había caducado; false si otra
  // petición lo reservó y sigue vigente (plan de la 005, D-3)
  reserve(tokenHash: string, now: Date, expiresAt: Date): Promise<boolean>;
  deleteExpired(now: Date): Promise<void>;
}
