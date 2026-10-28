import { IntervalRunner } from '../../../shared/infrastructure/scheduling/interval-runner.js';

// Lo que el planificador necesita de PurgeExpiredAuthDataUseCase
export interface AuthCleanupPass {
  execute(): Promise<void>;
}

// Limpieza de datos de sesión caducados al arrancar y cada minuto, sin solapar pasadas (D-12). No cambia
// ningún comportamiento observable: las caducidades y el margen se comprueban en cada petición (R-13)
export class AuthCleanupScheduler {
  private readonly runner: IntervalRunner;
  private firstPass = true;

  constructor(
    private readonly purge: AuthCleanupPass,
    intervalMs = 60_000,
  ) {
    this.runner = new IntervalRunner(() => this.pass(), intervalMs, 'AUTH_CLEANUP_FAILED');
  }

  start(): void {
    this.runner.start();
  }

  stop(): void {
    this.runner.stop();
  }

  private async pass(): Promise<void> {
    await this.purge.execute();
    // Solo la pasada inicial, para comprobar en el log que arranca sin llenarlo cada minuto
    if (this.firstPass) {
      console.log(JSON.stringify({ event: 'AUTH_CLEANUP_COMPLETED' }));
    }
    this.firstPass = false;
  }
}
