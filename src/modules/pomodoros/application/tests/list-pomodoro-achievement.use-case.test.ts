import {
  createPomodoroFixture,
  MINUTE,
  pomodoroContext as context,
} from '../../../../../tests/support/pomodoro-use-case.fixture.js';
import { ListPomodoroAchievementsUseCase } from '../list-pomodoro-achievement.use-case.js';

describe('ListPomodoroAchievementsUseCase', () => {
  let fixture: ReturnType<typeof createPomodoroFixture>;
  let useCase: ListPomodoroAchievementsUseCase;

  beforeEach(() => {
    fixture = createPomodoroFixture();
    useCase = new ListPomodoroAchievementsUseCase(fixture.repository.achievements, fixture.settle);
  });

  it('sin actividad: los 11 en orden, sin conseguir y con progreso 0 (RF-19)', async () => {
    const achievements = await useCase.execute(context);
    expect(achievements).toHaveLength(11);
    expect(achievements[0]?.definition.code).toBe('FIRST_POMODORO');
    expect(achievements.every((item) => item.progress === 0 && !item.unlocked && item.unlockedAt === null)).toBe(true);
  });

  it('una sesión por tiempo: FIRST_POMODORO conseguido con el fin de la sesión y SESSIONS_10 en 1 de 10 (RF-44)', async () => {
    const { pomodoro } = await fixture.startWith([], 1);
    fixture.clock.advance(5 * MINUTE);
    const achievements = await useCase.execute(context);
    const byCode = new Map(achievements.map((item) => [item.definition.code, item]));
    expect(byCode.get('FIRST_POMODORO')).toMatchObject({ unlocked: true, progress: 1, unlockedAt: pomodoro.endsAt });
    expect(byCode.get('SESSIONS_10')).toMatchObject({ unlocked: false, progress: 1 });
    expect(byCode.get('FOCUS_10H')).toMatchObject({ progress: 1 });
  });

  it('un logro conseguido sigue conseguido aunque su progreso baje (RF-44)', async () => {
    const titles = Array.from({ length: 10 }, (_, index) => `Tarea ${index}`);
    const { tasks } = await fixture.startWith(titles);
    for (const task of tasks) await fixture.updateTask.execute(context, task.id, { completed: true });
    await fixture.updateTask.execute(context, tasks[0]?.id ?? '', { completed: false });
    const tasks10 = (await useCase.execute(context)).find((item) => item.definition.code === 'TASKS_10');
    expect(tasks10).toMatchObject({ unlocked: true, progress: 9 });
  });

  it('completar y desmarcar la misma tarea varias veces cuenta una sola (RF-46)', async () => {
    const { tasks } = await fixture.startWith(['Una']);
    for (let round = 0; round < 3; round++) {
      await fixture.updateTask.execute(context, tasks[0]?.id ?? '', { completed: true });
      await fixture.updateTask.execute(context, tasks[0]?.id ?? '', { completed: false });
    }
    await fixture.updateTask.execute(context, tasks[0]?.id ?? '', { completed: true });
    const tasks10 = (await useCase.execute(context)).find((item) => item.definition.code === 'TASKS_10');
    expect(tasks10?.progress).toBe(1);
  });
});
