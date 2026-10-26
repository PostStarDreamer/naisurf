import { describe, expect, it } from 'vitest'
import { OCEAN_WAVE_CYCLES, getWaveFlowPhase } from './visual'

describe('background wave flow', () => {
  it('uses fixed elapsed-time cycles rather than gameplay pace', () => {
    expect(getWaveFlowPhase(0, 0)).toBe(0)
    expect(getWaveFlowPhase(1, 0)).toBeCloseTo(OCEAN_WAVE_CYCLES[0])
    expect(getWaveFlowPhase(1, 1)).toBeCloseTo(OCEAN_WAVE_CYCLES[1])
    expect(getWaveFlowPhase(1, 2)).toBeCloseTo(OCEAN_WAVE_CYCLES[2])
    expect(getWaveFlowPhase(8, 0)).toBeCloseTo(0.44, 8)
  })
})
