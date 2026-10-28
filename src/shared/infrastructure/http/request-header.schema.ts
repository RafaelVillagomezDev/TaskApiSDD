import { z } from 'zod';

// X-Client-Time: ISO 8601 extendido con desfase obligatorio ±HH:MM; no se acepta "Z" (RF-31, D-18).
// Grupos: día, hora, minuto, segundo, fracción, signo, horas y minutos del desfase
export const CLIENT_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?([+-])(\d{2}):(\d{2})$/;
export const clientTimeHeaderSchema = z.string().regex(CLIENT_TIME_PATTERN);

// X-Timezone: la validez como nombre IANA la comprueba TimeZoneService (RF-32)
export const timeZoneHeaderSchema = z.string().min(1);
