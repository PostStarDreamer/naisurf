export const OCEAN_WAVE_CYCLES = [0.18, 0.24, 0.31] as const

export function getWaveFlowPhase(elapsed: number, layer: number): number {
  const cycles = OCEAN_WAVE_CYCLES[layer] ?? OCEAN_WAVE_CYCLES[0]
  return (Math.max(0, elapsed) * cycles) % 1
}
