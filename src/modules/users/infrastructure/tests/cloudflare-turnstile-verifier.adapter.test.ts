import { CloudflareTurnstileVerifier, SITEVERIFY_URL } from '../cloudflare-turnstile-verifier.adapter.js';

const jest = import.meta.jest;

// Texto inventado: los tests nunca usan la clave secreta real (RNF-02 de la 005)
const SECRET = 'clave-secreta-inventada-para-los-tests';
const TOKEN = 'token-de-turnstile-inventado';
const IDEMPOTENCY_KEY = '7b1a1c56-4f5b-4b2a-9d8e-0a1b2c3d4e5f';
const request = { token: TOKEN, idempotencyKey: IDEMPOTENCY_KEY, timeoutMs: 3_000 };

type FetchInput = Parameters<typeof fetch>[0];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Sustituto de fetch que devuelve lo que se indique y guarda la última llamada
function fakeFetch(answer: () => Promise<Response>) {
  return jest.fn((_input: FetchInput, _init?: RequestInit) => answer());
}

describe('CloudflareTurnstileVerifier', () => {
  const consoleSpies = ['log', 'warn', 'error', 'info', 'debug'] as const;
  let spies: jest.SpyInstance[];

  beforeEach(() => {
    spies = consoleSpies.map((method) => jest.spyOn(console, method).mockImplementation(() => undefined));
  });

  afterEach(() => {
    // Ninguna llamada a console.*: ni la clave ni el token pueden acabar en los registros (RNF-02)
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('consulta siteverify con POST, cuerpo de formulario, clave, token e idempotency_key y sin remoteip (RF-24, D-4, D-5)', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ success: true, hostname: 'example.com', 'error-codes': [] }));
    await new CloudflareTurnstileVerifier(SECRET, fetchFn).siteverify(request);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(SITEVERIFY_URL);
    expect(SITEVERIFY_URL).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    const body = init?.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: SECRET, response: TOKEN, idempotency_key: IDEMPOTENCY_KEY });
    expect(body.has('remoteip')).toBe(false);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('una respuesta válida → answered con host, acción y códigos de error', async () => {
    const fetchFn = fakeFetch(async () =>
      jsonResponse({
        success: false,
        hostname: 'kompitu.yandrydev.cloud',
        action: 'login',
        challenge_ts: '2026-11-15T10:00:00.000Z',
        cdata: 'extra',
        'error-codes': ['timeout-or-duplicate'],
      }),
    );
    expect(await new CloudflareTurnstileVerifier(SECRET, fetchFn).siteverify(request)).toEqual({
      kind: 'answered',
      success: false,
      hostname: 'kompitu.yandrydev.cloud',
      action: 'login',
      errorCodes: ['timeout-or-duplicate'],
    });
  });

  it('sin hostname, action ni error-codes, como las claves de prueba → null y lista vacía (S-03)', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ success: true }));
    expect(await new CloudflareTurnstileVerifier(SECRET, fetchFn).siteverify(request)).toEqual({
      kind: 'answered',
      success: true,
      hostname: null,
      action: null,
      errorCodes: [],
    });
  });

  it.each([400, 403, 500, 502, 503])('HTTP %i → http-error con su estado', async (status) => {
    const fetchFn = fakeFetch(async () => jsonResponse({ success: false }, status));
    expect(await new CloudflareTurnstileVerifier(SECRET, fetchFn).siteverify(request)).toEqual({
      kind: 'http-error',
      status,
    });
  });

  it.each<[string, () => Promise<Response>]>([
    ['JSON ilegible', async () => new Response('<html>no es JSON</html>', { status: 200 })],
    ['JSON sin success', async () => jsonResponse({ hostname: 'example.com' })],
    ['success que no es booleano', async () => jsonResponse({ success: 'true' })],
    ['error-codes que no es una lista', async () => jsonResponse({ success: false, 'error-codes': 'internal-error' })],
    ['error de red', () => Promise.reject(new TypeError('fetch failed'))],
    ['tiempo agotado', () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))],
  ])('%s → unreachable, sin lanzar (D-4)', async (_case, answer) => {
    const fetchFn = fakeFetch(answer);
    expect(await new CloudflareTurnstileVerifier(SECRET, fetchFn).siteverify(request)).toEqual({ kind: 'unreachable' });
  });

  it('corta la consulta al pasar el tiempo indicado (RNF-03)', async () => {
    // fetch que no responde hasta que se cancela su señal
    const fetchFn = jest.fn(
      (_input: FetchInput, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const started = Date.now();
    const outcome = await new CloudflareTurnstileVerifier(SECRET, fetchFn).siteverify({ ...request, timeoutMs: 50 });
    expect(outcome).toEqual({ kind: 'unreachable' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
