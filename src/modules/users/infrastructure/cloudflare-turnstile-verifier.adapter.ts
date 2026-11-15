import { z } from 'zod';

import type {
  SiteverifyOutcome,
  SiteverifyRequest,
  TurnstileVerifier,
} from '../domain/turnstile-verifier.port.js';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Respuesta de siteverify: entrada externa, validada antes de usarla (principio V). Lo que no cumpla el schema
// se trata como una respuesta ilegible, nunca como un token válido (plan de la 005, D-4)
const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});

const UNREACHABLE: SiteverifyOutcome = { kind: 'unreachable' };

// Consulta Cloudflare con el fetch nativo de Node 22 (principio I) y nunca lanza: un error de red, el tiempo
// agotado o un JSON inesperado son `unreachable`. No registra nada, porque la petición lleva la clave secreta
// (RNF-02). No envía remoteip: sin `trust proxy`, la IP sería la del proxy (D-5)
export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  constructor(
    private readonly secret: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async siteverify(request: SiteverifyRequest): Promise<SiteverifyOutcome> {
    let response: Response;
    try {
      response = await this.fetchFn(SITEVERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({
          secret: this.secret,
          response: request.token,
          idempotency_key: request.idempotencyKey,
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch {
      // Error de red o tiempo agotado: se reintenta o se responde TURNSTILE_UNAVAILABLE (RF-25, RF-28)
      return UNREACHABLE;
    }
    if (!response.ok) {
      return { kind: 'http-error', status: response.status };
    }
    return this.parse(response);
  }

  private async parse(response: Response): Promise<SiteverifyOutcome> {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      // Cuerpo que no es JSON o que se cortó al pasar el tiempo máximo
      return UNREACHABLE;
    }
    const result = siteverifyResponseSchema.safeParse(json);
    if (!result.success) {
      return UNREACHABLE;
    }
    return {
      kind: 'answered',
      success: result.data.success,
      hostname: result.data.hostname ?? null,
      action: result.data.action ?? null,
      errorCodes: result.data['error-codes'] ?? [],
    };
  }
}
