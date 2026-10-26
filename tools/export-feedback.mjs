import { exportGithubFeedback } from './github-feedback.mjs'

try {
  const result = await exportGithubFeedback()
  console.log(
    result.written
      ? `Exported ${result.count} unexported GitHub feedback issue(s).`
      : 'No unexported GitHub feedback issues; file left unchanged.'
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Feedback export failed.')
  process.exitCode = 1
}
