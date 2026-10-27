import type { AlertPassResult } from '../application/generate-due-alert.use-case.js';

// Lo que el planificador necesita de GenerateDueAlertUseCase
export interface AlertPass {
  execute(): Promise<AlertPassResult>;
}

// Ejecuta una pasada al arrancar y otra cada 60 s, sin solapar pasadas (RNF-02, RF-47, D-3).
// Peor caso: un aviso se registra unos 60 s más la duración de la pasada después de las 22:00
export class AlertScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private firstPass = true;

  constructor(
    private readonly generateAlerts: AlertPass,
    private readonly intervalMs = 60_000,
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

  // Si la pasada anterior sigue en curso, se salta este intervalo
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.generateAlerts.execute();
      // Solo se registra la pasada inicial y las que crean avisos, para no llenar el log cada minuto
      if (this.firstPass || result.created > 0) {
        console.log(JSON.stringify({ event: 'ALERT_PASS_COMPLETED', ...result }));
      }
      this.firstPass = false;
    } catch (error) {
      console.error(
        JSON.stringify({ event: 'ALERT_PASS_FAILED', message: error instanceof Error ? error.message : String(error) }),
      );
    } finally {
      this.running = false;
    }
  }
}
