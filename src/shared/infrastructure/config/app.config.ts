import { z } from 'zod';

// Clave AES-256 para la copia cifrada del margen de gracia (plan de la 002, D-1 y D-11)
const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

// Origen exacto (esquema, host y puerto), sin ruta ni barra final: es lo que envía el navegador en `Origin`
const isExactOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

// Claves secretas de prueba que publica Cloudflare: siempre pasan, siempre fallan o responden token ya usado
// (S-02 de la 005). Producción no arranca con ninguna de ellas (RF-19)
export const TURNSTILE_TEST_SECRETS: readonly string[] = [
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
];

// Hosts locales que la lista de producción no admite (RF-19 de la 005)
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const PRODUCTION = 'production';

// Lista separada por comas: sin espacios, en minúsculas y sin elementos vacíos
const toHostnameList = (value: string): string[] =>
  value
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter((hostname) => hostname.length > 0);

const configSchema = z.object({
  SESSION_ENCRYPTION_KEY: z
    .string({ error: 'Falta la variable' })
    .regex(ENCRYPTION_KEY_PATTERN, 'Debe tener 64 caracteres hexadecimales (openssl rand -hex 32)'),
  CORS_ORIGIN: z
    .string({ error: 'Falta la variable' })
    .refine(isExactOrigin, 'Debe ser un origen exacto, como https://kompitu.yandrydev.cloud'),
  NODE_ENV: z.string().optional(),
  TURNSTILE_SECRET: z.string({ error: 'Falta la variable' }).min(1, 'No puede estar vacía'),
  TURNSTILE_ALLOWED_HOSTNAMES: z
    .string({ error: 'Falta la variable' })
    .transform(toHostnameList)
    .refine((hostnames) => hostnames.length > 0, 'Debe tener al menos un host'),
  TURNSTILE_ENFORCE: z.enum(['true', 'false'], { error: 'Debe ser true o false' }),
});

type ParsedConfig = z.output<typeof configSchema>;

// En producción, ni hosts locales ni claves de prueba (RF-19 de la 005). Nombra la variable, nunca su valor
function productionProblems(config: ParsedConfig): string[] {
  if (config.NODE_ENV !== PRODUCTION) {
    return [];
  }
  const problems: string[] = [];
  if (config.TURNSTILE_ALLOWED_HOSTNAMES.some((hostname) => LOCAL_HOSTNAMES.has(hostname))) {
    problems.push('TURNSTILE_ALLOWED_HOSTNAMES: No admite hosts locales en producción');
  }
  if (TURNSTILE_TEST_SECRETS.includes(config.TURNSTILE_SECRET)) {
    problems.push('TURNSTILE_SECRET: No admite una clave de prueba de Cloudflare en producción');
  }
  return problems;
}

export interface AppConfig {
  sessionEncryptionKey: Buffer;
  // Único origen del frontend que puede usar la API con cookies (RF-35)
  corsOrigin: string;
  turnstile: TurnstileConfig;
}

// Verificación de Cloudflare Turnstile en el login y el registro (spec 005)
export interface TurnstileConfig {
  secret: string;
  // Hosts en los que se puede resolver el widget, en minúsculas (RF-07)
  allowedHostnames: string[];
  // true: token obligatorio; false: opcional, se verifica si llega (RF-15 a RF-17)
  enforce: boolean;
  // Con una clave de prueba no se comprueba la acción ni se reserva el token (RF-06b, RF-33)
  usesTestSecret: boolean;
}

// Lee y valida la configuración por entorno; la API no arranca si falta algo (D-11).
// Los mensajes nombran la variable pero nunca muestran su valor (principio IV)
export function loadAppConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  const problems = result.success
    ? productionProblems(result.data)
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  if (!result.success || problems.length > 0) {
    throw new Error(`Configuración no válida en .env: ${problems.join('; ')}`);
  }
  const config = result.data;
  return {
    sessionEncryptionKey: Buffer.from(config.SESSION_ENCRYPTION_KEY, 'hex'),
    corsOrigin: config.CORS_ORIGIN,
    turnstile: {
      secret: config.TURNSTILE_SECRET,
      allowedHostnames: config.TURNSTILE_ALLOWED_HOSTNAMES,
      enforce: config.TURNSTILE_ENFORCE === 'true',
      usesTestSecret: TURNSTILE_TEST_SECRETS.includes(config.TURNSTILE_SECRET),
    },
  };
}
