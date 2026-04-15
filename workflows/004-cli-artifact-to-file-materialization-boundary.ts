import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('004-cli-artifact-to-file-materialization-boundary')
    .description('Define the generic relayfile-cli artifact-to-file materialization boundary, with provider examples treated as proving cases rather than the core abstraction.')
    .pattern('supervisor')
    .channel('wf-004-cli-artifact-to-file-materialization-boundary')
    .maxConcurrency(4)
    .timeout(8_400_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the generic artifact-to-file materialization boundary for relayfile-cli.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Writes the first materialization boundary docs and proof direction.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews whether the abstraction is generic enough and the proving cases are used correctly.',
      retries: 1,
    })

    .step('read-materialization-context', {
      type: 'deterministic',
      command: [
        'echo "---README---"',
        'sed -n "1,260p" README.md',
        'echo "" && echo "---REPO BOUNDARY---"',
        'sed -n "1,260p" docs/repo-boundary.md',
        'echo "" && echo "---FIRST PROOF DIRECTION---"',
        'sed -n "1,260p" docs/first-proof-direction.md',
        'echo "" && echo "---EXECUTE PROOF REVIEW---"',
        'sed -n "1,260p" docs/execute-proof-review-verdict.md',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-materialization-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-materialization-context'],
      task: `Define the generic relayfile-cli artifact-to-file materialization boundary.\n\n{{steps.read-materialization-context.output}}\n\nRequirements:\n1. center the abstraction on CLI artifact → file materialization, not on any one provider\n2. treat PostHog, GitHub CLI, etc. as proving examples rather than the architecture itself\n3. define what relayfile-cli should own vs what should remain in core relayfile / adapters / providers\n4. define the first bounded proof direction after this boundary\n5. keep the slice mergeable and honest\n\nWrite:\n- docs/materialization-boundary.md\n- docs/materialization-proof-direction.md\n- docs/materialization-boundary-review-verdict.md\n\nEnd with RELAYFILE_CLI_MATERIALIZATION_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/materialization-boundary.md' },
    })

    .step('review-materialization-boundary', {
      agent: 'review-codex',
      dependsOn: ['define-materialization-boundary'],
      task: `Review the relayfile-cli materialization boundary.\n\nRead:\n- docs/materialization-boundary.md\n- docs/materialization-proof-direction.md\n- docs/materialization-boundary-review-verdict.md\n\nAssess:\n1. is the abstraction generic enough?\n2. are provider examples used correctly as proving cases?\n3. does the boundary preserve the ecosystem split?\n4. is the next proof direction sensible?\n\nEnd with RELAYFILE_CLI_MATERIALIZATION_BOUNDARY_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/materialization-boundary-review-verdict.md' },
    })

    .step('verify-materialization-boundary-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-materialization-boundary'],
      command: [
        'test -f docs/materialization-boundary.md',
        'test -f docs/materialization-proof-direction.md',
        'test -f docs/materialization-boundary-review-verdict.md',
        'grep -q "RELAYFILE_CLI_MATERIALIZATION_BOUNDARY_REVIEW_COMPLETE" docs/materialization-boundary-review-verdict.md',
        'echo "RELAYFILE_CLI_MATERIALIZATION_BOUNDARY_VERIFIED"',
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
