import { IntervalRunner } from '../../../shared/infrastructure/scheduling/interval-runner.js';

// Lo que el barrido necesita de SettleDuePomodoroUseCase
export interface PomodoroSettlePass {
  dueBatch(): Promise<number>;
}

const SETTLE_INTERVAL_MS = 60_000;

// Solo las pasadas que asientan algo, para no llenar el log cada minuto
function logSettled(settled: number): void {
  if (settled > 0) {
    console.log(JSON.stringify({ event: 'POMODORO_SETTLE_COMPLETED', settled }));
  }
}

// Asienta al arrancar y cada 60 s las sesiones vencidas de usuarios que no vuelven a pedir nada, para que el
// día local del fin use la zona recordada en ese momento (RF-40) y la sesión no quede pendiente (plan, D-2).
// Lo que ve el usuario no depende de este barrido: cada petición asienta antes su sesión (R-2)
export class PomodoroScheduler {
  private readonly runner: IntervalRunner;

  constructor(settle: PomodoroSettlePass, intervalMs = SETTLE_INTERVAL_MS) {
    this.runner = new IntervalRunner(
      async () => logSettled(await settle.dueBatch()),
      intervalMs,
      'POMODORO_SETTLE_FAILED',
    );
  }

  start(): void {
    this.runner.start();
  }

  stop(): void {
    this.runner.stop();
  }
}
