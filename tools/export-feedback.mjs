import { exportFeedback } from './feedback-store.mjs'

try {
  const result = await exportFeedback()
  console.log(
    result.written
      ? `Exported ${result.count} unexported feedback item(s).`
      : 'No unexported feedback; file left unchanged.'
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Feedback export failed.')
  process.exitCode = 1
}
