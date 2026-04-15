import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('001-define-relayfile-cli-repo-boundary')
    .description('Define the standalone relayfile-cli repo boundary and first 80-to-100 proof direction.')
    .pattern('supervisor')
    .channel('wf-001-relayfile-cli-repo-boundary')
    .maxConcurrency(4)
    .timeout(8_400_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the standalone relayfile-cli repo boundary and responsibilities.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Writes the initial repo boundary and first workflow-ready proof plan.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews the repo split and first proof direction for boundedness and clarity.',
      retries: 1,
    })

    .step('read-bootstrap-context', {
      type: 'deterministic',
      command: [
        'echo "---README---"',
        'sed -n "1,220p" README.md',
        'echo "" && echo "---REPO BOUNDARY---"',
        'sed -n "1,260p" REPO_BOUNDARY.md',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-repo-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-bootstrap-context'],
      task: `Define the initial standalone relayfile-cli repo boundary and first implementation target.\n\n{{steps.read-bootstrap-context.output}}\n\nWrite:\n- docs/repo-boundary.md\n- docs/first-proof-direction.md\n- docs/repo-boundary-review-verdict.md\n\nRequirements:\n1. justify the split from relayfile clearly\n2. define what belongs here vs in core relayfile\n3. define the first bounded 80-to-100 proof target\n4. keep it mergeable and honest\n\nEnd with RELAYFILE_CLI_REPO_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/repo-boundary.md' },
    })

    .step('review-repo-boundary', {
      agent: 'review-codex',
      dependsOn: ['define-repo-boundary'],
      task: `Review the initial relayfile-cli repo boundary.\n\nRead:\n- docs/repo-boundary.md\n- docs/first-proof-direction.md\n- docs/repo-boundary-review-verdict.md\n\nEnsure the split is clear and the first proof direction is sensible.\nEnd with RELAYFILE_CLI_REPO_BOUNDARY_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/repo-boundary-review-verdict.md' },
    })

    .step('verify-boundary-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-repo-boundary'],
      command: [
        'test -f docs/repo-boundary.md',
        'test -f docs/first-proof-direction.md',
        'test -f docs/repo-boundary-review-verdict.md',
        'grep -q "RELAYFILE_CLI_REPO_BOUNDARY_REVIEW_COMPLETE" docs/repo-boundary-review-verdict.md',
        'echo "RELAYFILE_CLI_REPO_BOUNDARY_VERIFIED"',
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
