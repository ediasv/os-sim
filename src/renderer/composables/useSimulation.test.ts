import { describe, expect, it } from 'vitest';
import { isReactive } from 'vue';
import { useSimulation } from './useSimulation';

describe('useSimulation', () => {
  it('exposes the initial snapshot', () => {
    expect(useSimulation().view.value.tick).toBe(0);
  });

  it('replaces the snapshot on each step', () => {
    const { view, step } = useSimulation();
    const first = view.value;
    step();
    expect(view.value.tick).toBe(1);
    expect(view.value).not.toBe(first);
  });

  it('does not make the snapshot deeply reactive', () => {
    expect(isReactive(useSimulation().view.value)).toBe(false);
  });
});
