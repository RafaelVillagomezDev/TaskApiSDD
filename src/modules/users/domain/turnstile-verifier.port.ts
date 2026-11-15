// Puerto de salida hacia el servicio de verificación de Cloudflare Turnstile (siteverify). La implementación
// nunca lanza: cualquier fallo se devuelve como un resultado tipado (plan de la 005, D-2 y D-4)
export interface TurnstileVerifier {
  siteverify(request: SiteverifyRequest): Promise<SiteverifyOutcome>;
}

export interface SiteverifyRequest {
  token: string;
  // La misma en el intento y en el reintento de una petición (RF-24, RF-25)
  idempotencyKey: string;
  // Tiempo máximo de esta consulta (RNF-03; plan, D-8)
  timeoutMs: number;
}

export type SiteverifyOutcome =
  // Cloudflare respondió con un JSON válido
  | {
      kind: 'answered';
      success: boolean;
      hostname: string | null;
      action: string | null;
      errorCodes: string[];
    }
  // Cloudflare respondió con un estado HTTP de error
  | { kind: 'http-error'; status: number }
  // Error de red, tiempo agotado o respuesta ilegible
  | { kind: 'unreachable' };
