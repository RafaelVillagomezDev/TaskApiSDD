// Zona recordada del usuario, para el día local en que termina una sesión (RF-40; plan, D-7)
export interface UserTimeZoneSource {
  find(userId: string): Promise<string | null>;
}
