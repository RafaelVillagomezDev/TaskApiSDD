import {
  createPomodoroFixture,
  MINUTE,
  pomodoroContext as context,
} from '../../../../../tests/support/pomodoro-use-case.fixture.js';
import { UnlockPomodoroAchievementUseCase } from '../unlock-pomodoro-achievement.use-case.js';

describe('UnlockPomodoroAchievementUseCase', () => {
  let fixture: ReturnType<typeof createPomodoroFixture>;
  const useCase = new UnlockPomodoroAchievementUseCase();

  beforeEach(() => {
    fixture = createPomodoroFixture();
  });

  const unlocked = async () =>
    new Map((await fixture.repository.achievements.listUnlocked(context.userId)).map((row) => [row.code, row.unlockedAt]));

  it('sin actividad no desbloquea nada', async () => {
    await fixture.repository.transaction((unit) => useCase.execute(unit, context.userId, fixture.clock.now()));
    expect((await unlocked()).size).toBe(0);
  });

  it('desbloquea lo alcanzado con el instante del evento (RF-44)', async () => {
    await fixture.startWith([], 1);
    fixture.clock.advance(MINUTE);
    await fixture.settle.forUser(context.userId);
    const at = new Date('2026-11-08T09:01:00Z');
    await fixture.repository.transaction((unit) => useCase.execute(unit, context.userId, at));
    expect(await unlocked()).toEqual(new Map([['FIRST_POMODORO', at]]));
  });

  it('no sobrescribe el instante de un logro ya conseguido (RF-44)', async () => {
    await fixture.startWith([], 1);
    fixture.clock.advance(MINUTE);
    await fixture.settle.forUser(context.userId);
    const first = new Date('2026-11-08T09:01:00Z');
    await fixture.repository.transaction((unit) => useCase.execute(unit, context.userId, first));
    await fixture.repository.transaction((unit) => useCase.execute(unit, context.userId, new Date('2026-11-09T10:00:00Z')));
    expect((await unlocked()).get('FIRST_POMODORO')).toEqual(first);
  });

  it('STREAK_3 con la mejor racha: tres días seguidos con una sesión por tiempo (RF-45)', async () => {
    for (const iso of ['2026-11-06T09:00:00Z', '2026-11-07T09:00:00Z', '2026-11-08T09:00:00Z']) {
      fixture.clock.set(iso);
      await fixture.startWith([], 1);
      fixture.clock.advance(MINUTE);
      await fixture.settle.forUser(context.userId);
    }
    await fixture.repository.transaction((unit) => useCase.execute(unit, context.userId, fixture.clock.now()));
    expect((await unlocked()).has('STREAK_3')).toBe(true);
  });
});
