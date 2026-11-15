import type {
  SiteverifyOutcome,
  SiteverifyRequest,
  TurnstileVerifier,
} from '../../src/modules/users/domain/turnstile-verifier.port.js';

// Host que devuelven las claves de prueba de Cloudflare (S-03 de la 005); está en la lista de los tests
export const FAKE_TURNSTILE_HOSTNAME = 'example.com';

// Separa la acción del resto del token: `login:abc` → acción `login`
const ACTION_SEPARATOR = ':';

// Token para la acción indicada; único si no se pasa `suffix` (los tokens son de un solo uso, RF-20)
export function turnstileTokenFor(action: string, suffix: string = crypto.randomUUID()): string {
  return `${action}${ACTION_SEPARATOR}${suffix}`;
}

// Respuesta por defecto: token válido en el host de prueba, con la acción que indica su prefijo
// (`login:…` o `register:…`); un token sin prefijo no lleva acción, como con las claves de prueba
export function passingOutcome(request: SiteverifyRequest): SiteverifyOutcome {
  const separator = request.token.indexOf(ACTION_SEPARATOR);
  return {
    kind: 'answered',
    success: true,
    hostname: FAKE_TURNSTILE_HOSTNAME,
    action: separator > 0 ? request.token.slice(0, separator) : null,
    errorCodes: [],
  };
}

// Verificador simulado: los tests nunca llaman a Cloudflare (RNF-04 de la 005). Responde en orden con los
// resultados programados y, cuando se acaban, con `passingOutcome`. Guarda cada consulta recibida
export class FakeTurnstileVerifier implements TurnstileVerifier {
  readonly requests: SiteverifyRequest[] = [];
  private readonly queued: Array<SiteverifyOutcome | ((request: SiteverifyRequest) => Promise<SiteverifyOutcome>)> = [];

  async siteverify(request: SiteverifyRequest): Promise<SiteverifyOutcome> {
    this.requests.push(request);
    const next = this.queued.shift();
    if (next === undefined) {
      return passingOutcome(request);
    }
    return typeof next === 'function' ? next(request) : next;
  }

  // Programa las próximas respuestas; una función permite simular esperas o depender de la consulta
  respondWith(
    ...outcomes: Array<SiteverifyOutcome | ((request: SiteverifyRequest) => Promise<SiteverifyOutcome>)>
  ): void {
    this.queued.push(...outcomes);
  }

  // Respuesta de Cloudflare a un token rechazado
  rejectNext(errorCodes: string[] = ['invalid-input-response']): void {
    this.respondWith({ kind: 'answered', success: false, hostname: null, action: null, errorCodes });
  }

  reset(): void {
    this.requests.length = 0;
    this.queued.length = 0;
  }
}
