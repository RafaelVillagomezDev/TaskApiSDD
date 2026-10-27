export interface UserTimeZone {
  userId: string;
  timeZone: string;
}

// Puerto de salida de la última zona horaria de cada usuario (RF-34, RF-36)
export interface UserTimeZoneRepository {
  // Guarda la zona; no escribe si no ha cambiado
  record(userId: string, timeZone: string): Promise<void>;
  // Usuarios con zona en orden de userId, empezando por el siguiente a `afterUserId`
  listBatch(afterUserId: string | null, size: number): Promise<UserTimeZone[]>;
}
