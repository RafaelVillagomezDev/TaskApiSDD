import type { RequestHandler, Response } from 'express';

import type { RequestContext } from '../../application/request-context.type.js';
import { AppError } from '../../domain/app.error.js';
import type { Clock } from '../../domain/clock.port.js';
import { LocalDate } from '../../domain/local-date.value-object.js';
import type { TimeZoneService } from '../../domain/time-zone.port.js';
import {
  CLIENT_TIME_PATTERN,
  clientTimeHeaderSchema,
  timeZoneHeaderSchema,
  userIdHeaderSchema,
} from './request-header.schema.js';

// Desviación máxima entre X-Client-Time y el reloj del servidor (RF-31)
const MAX_CLIENT_TIME_SKEW_MS = 5 * 60 * 1000;
const CONTEXT_KEY = 'requestContext';

export interface RequestContextDependencies {
  clock: Clock;
  timeZones: TimeZoneService;
  // Se llama en cuanto las tres cabeceras son válidas, aunque la petición falle después (RF-34, D-1)
  onAcceptedTimeZone: (userId: string, timeZone: string) => Promise<void>;
}

interface ClientTime {
  instant: Date;
  localDate: LocalDate;
  offsetMinutes: number;
}

// Interpreta X-Client-Time; devuelve null si el formato o algún componente no es válido
function parseClientTime(value: string): ClientTime | null {
  const match = CLIENT_TIME_PATTERN.exec(value);
  if (!match) return null;
  const [, day, hour, minute, second = '0', fraction = '', sign, offsetHours, offsetMinutes] = match;
  const localDate = LocalDate.tryParse(day ?? '');
  const [h, m, s, oh, om] = [hour, minute, second, offsetHours, offsetMinutes].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (!localDate || h > 23 || m > 59 || s > 59 || oh > 14 || om > 59) return null;

  const offset = (sign === '-' ? -1 : 1) * (oh * 60 + om);
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  const localMs = Date.UTC(localDate.year, localDate.month - 1, localDate.day, h, m, s, milliseconds);
  return { instant: new Date(localMs - offset * 60_000), localDate, offsetMinutes: offset };
}

// Valida las cabeceras en el orden 2 → 4 de la precedencia de RF-46 y deja el RequestContext en
// res.locals. Se encadena en cada ruta, nunca de forma global (D-8)
export function createRequestContextMiddleware(deps: RequestContextDependencies): RequestHandler {
  return async (req, res, next) => {
    try {
      // 2. Usuario
      const userId = userIdHeaderSchema.safeParse(req.header('x-user-id'));
      if (!userId.success) {
        next(new AppError('MISSING_USER'));
        return;
      }

      // 3. Hora del dispositivo
      const rawClientTime = req.header('x-client-time');
      const formatOk = clientTimeHeaderSchema.safeParse(rawClientTime).success;
      const clientTime = formatOk && rawClientTime ? parseClientTime(rawClientTime) : null;
      const deviationMs = clientTime ? clientTime.instant.getTime() - deps.clock.now().getTime() : null;
      if (!clientTime || deviationMs === null || Math.abs(deviationMs) > MAX_CLIENT_TIME_SKEW_MS) {
        // Línea JSON en consola para detectar relojes desviados (R-7)
        console.warn(
          JSON.stringify({
            event: 'INVALID_CLIENT_TIME',
            userId: userId.data,
            clientTime: rawClientTime ?? null,
            deviationSeconds: deviationMs === null ? null : Math.round(deviationMs / 1000),
          }),
        );
        next(new AppError('INVALID_CLIENT_TIME'));
        return;
      }

      // 4. Zona horaria válida y coherente con el desfase de la hora
      const timeZone = timeZoneHeaderSchema.safeParse(req.header('x-timezone'));
      if (
        !timeZone.success ||
        !deps.timeZones.isValid(timeZone.data) ||
        deps.timeZones.offsetMinutesAt(timeZone.data, clientTime.instant) !== clientTime.offsetMinutes
      ) {
        next(new AppError('INVALID_TIMEZONE'));
        return;
      }

      await deps.onAcceptedTimeZone(userId.data, timeZone.data);

      const context: RequestContext = {
        userId: userId.data,
        // El día actual es la fecha local del dispositivo (RF-23)
        today: clientTime.localDate,
        timeZone: timeZone.data,
      };
      res.locals[CONTEXT_KEY] = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getRequestContext(res: Response): RequestContext {
  const context = res.locals[CONTEXT_KEY] as RequestContext | undefined;
  if (!context) {
    throw new Error('RequestContext no disponible: falta el middleware de contexto en la ruta');
  }
  return context;
}
