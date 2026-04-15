import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('003-open-source-readiness-for-relayfile-cli')
    .description('Prepare relayfile-cli for eventual OSS/public-repo readiness after the first proof lands.')
    .pattern('supervisor')
    .channel('wf-003-relayfile-cli-oss-readiness')
    .maxConcurrency(4)
    .timeout(8_400_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the first bounded OSS/public-repo readiness slice for relayfile-cli.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Implements the first bounded OSS/public-repo readiness improvements.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews whether relayfile-cli is materially closer to being a clean OSS repo.',
      retries: 1,
    })

    .step('read-oss-context', {
      type: 'deterministic',
      command: [
        'echo "---README---"',
        'sed -n "1,240p" README.md',
        'echo "" && echo "---REPO BOUNDARY---"',
        'sed -n "1,260p" docs/repo-boundary.md',
        'echo "" && echo "---FIRST PROOF REVIEW---"',
        'sed -n "1,260p" docs/execute-proof-review-verdict.md',
        'echo "" && echo "---PACKAGE JSON---"',
        'cat package.json',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-oss-readiness-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-oss-context'],
      task: `Define the first bounded relayfile-cli OSS/public-repo readiness slice.\n\n{{steps.read-oss-context.output}}\n\nRequirements:\n1. keep the slice small and credible\n2. focus on what is needed to make this a clean public repo candidate\n3. include docs/metadata/package/readme gaps\n4. avoid pretending the repo is already ready if more work remains\n\nWrite:\n- docs/oss-readiness-boundary.md\n- docs/oss-readiness-checklist.md\n- docs/oss-readiness-review-verdict.md\n\nEnd with RELAYFILE_CLI_OSS_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/oss-readiness-boundary.md' },
    })

    .step('implement-oss-readiness', {
      agent: 'impl-codex',
      dependsOn: ['define-oss-readiness-boundary'],
      task: `Implement the first bounded OSS/public-repo readiness slice.\n\nRead:\n- docs/oss-readiness-boundary.md\n- docs/oss-readiness-checklist.md\n\nRequirements:\n1. improve the repo in ways that materially help public/OSS readiness\n2. keep the slice bounded and mergeable\n3. add validation/docs as needed\n4. be honest about what remains afterward\n\nEnd with RELAYFILE_CLI_OSS_IMPLEMENTATION_READY.`,
      verification: { type: 'exit_code' },
    })

    .step('review-oss-readiness', {
      agent: 'review-codex',
      dependsOn: ['implement-oss-readiness'],
      task: `Review the relayfile-cli OSS/public-repo readiness slice.\n\nRead:\n- docs/oss-readiness-boundary.md\n- docs/oss-readiness-checklist.md\n- docs/oss-readiness-review-verdict.md\n- changed files\n\nAssess:\n1. is the repo materially cleaner for open-source/public use?\n2. did the slice stay bounded?\n3. what remains before public/repo creation is truly sensible?\n\nEnd with RELAYFILE_CLI_OSS_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/oss-readiness-review-verdict.md' },
    })

    .step('verify-oss-readiness-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-oss-readiness'],
      command: [
        'test -f docs/oss-readiness-boundary.md',
        'test -f docs/oss-readiness-checklist.md',
        'test -f docs/oss-readiness-review-verdict.md',
        'grep -q "RELAYFILE_CLI_OSS_REVIEW_COMPLETE" docs/oss-readiness-review-verdict.md',
        'echo "RELAYFILE_CLI_OSS_VERIFIED"',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .run({ cwd: process.cwd() });

  console.log(result.status);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
