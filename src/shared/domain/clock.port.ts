// Puerto de reloj: el dominio nunca lee la hora del sistema directamente (principio V)
export interface Clock {
  now(): Date;
}
