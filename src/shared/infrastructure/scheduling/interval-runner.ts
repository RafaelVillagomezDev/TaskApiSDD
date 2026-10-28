// Ejecuta una tarea al arrancar y después cada `intervalMs`, sin solapar ejecuciones: si la anterior sigue
// en curso, se salta ese intervalo. Un fallo se registra con `failureEvent` y no detiene el ejecutor.
// Base común de los planificadores (avisos de la 001 y limpieza de sesiones de la 002, D-12)
export class IntervalRunner {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly intervalMs: number,
    private readonly failureEvent: string,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.task();
    } catch (error) {
      console.error(
        JSON.stringify({ event: this.failureEvent, message: error instanceof Error ? error.message : String(error) }),
      );
    } finally {
      this.running = false;
    }
  }
}
