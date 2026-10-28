import { IntervalRunner } from '../../../shared/infrastructure/scheduling/interval-runner.js';
import type { AlertPassResult } from '../application/generate-due-alert.use-case.js';

// Lo que el planificador necesita de GenerateDueAlertUseCase
export interface AlertPass {
  execute(): Promise<AlertPassResult>;
}

// Ejecuta una pasada al arrancar y otra cada 60 s, sin solapar pasadas (RNF-02, RF-47, D-3).
// Peor caso: un aviso se registra unos 60 s más la duración de la pasada después de las 22:00
export class AlertScheduler {
  private readonly runner: IntervalRunner;
  private firstPass = true;

  constructor(
    private readonly generateAlerts: AlertPass,
    intervalMs = 60_000,
  ) {
    this.runner = new IntervalRunner(() => this.pass(), intervalMs, 'ALERT_PASS_FAILED');
  }

  start(): void {
    this.runner.start();
  }

  stop(): void {
    this.runner.stop();
  }

  private async pass(): Promise<void> {
    const result = await this.generateAlerts.execute();
    // Solo se registra la pasada inicial y las que crean avisos, para no llenar el log cada minuto
    if (this.firstPass || result.created > 0) {
      console.log(JSON.stringify({ event: 'ALERT_PASS_COMPLETED', ...result }));
    }
    this.firstPass = false;
  }
}
