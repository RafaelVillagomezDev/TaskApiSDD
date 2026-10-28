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

const configSchema = z.object({
  SESSION_ENCRYPTION_KEY: z
    .string({ error: 'Falta la variable' })
    .regex(ENCRYPTION_KEY_PATTERN, 'Debe tener 64 caracteres hexadecimales (openssl rand -hex 32)'),
  CORS_ORIGIN: z
    .string({ error: 'Falta la variable' })
    .refine(isExactOrigin, 'Debe ser un origen exacto, como https://kompitu.yandrydev.cloud'),
});

export interface AppConfig {
  sessionEncryptionKey: Buffer;
  // Único origen del frontend que puede usar la API con cookies (RF-35)
  corsOrigin: string;
}

// Lee y valida la configuración por entorno; la API no arranca si falta algo (D-11).
// Los mensajes nombran la variable pero nunca muestran su valor (principio IV)
export function loadAppConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuración no válida en .env: ${problems}`);
  }
  return {
    sessionEncryptionKey: Buffer.from(result.data.SESSION_ENCRYPTION_KEY, 'hex'),
    corsOrigin: result.data.CORS_ORIGIN,
  };
}
