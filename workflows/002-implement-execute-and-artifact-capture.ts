import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('002-implement-execute-and-artifact-capture')
    .description('Implement the first relayfile-cli execute-and-artifact-capture proof using an 80-to-100 validation bar.')
    .pattern('supervisor')
    .channel('wf-002-relayfile-cli-execute-artifact-capture')
    .maxConcurrency(4)
    .timeout(10_800_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the exact bounded proof slice and validation bar for execute + artifact capture.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Implements the execute primitive and drives the full test-fix-rerun loop.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews the proof for 80-to-100 sufficiency, boundedness, and ecosystem fit.',
      retries: 1,
    })

    .step('read-proof-context', {
      type: 'deterministic',
      command: [
        'echo "---REPO BOUNDARY---"',
        'sed -n "1,260p" docs/repo-boundary.md',
        'echo "" && echo "---FIRST PROOF DIRECTION---"',
        'sed -n "1,260p" docs/first-proof-direction.md',
        'echo "" && echo "---REVIEW VERDICT---"',
        'sed -n "1,260p" docs/repo-boundary-review-verdict.md',
        'echo "" && echo "---PACKAGE---"',
        'cat package.json',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-execute-proof-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-proof-context'],
      task: `Define the exact bounded 80-to-100 implementation slice for execute + artifact capture.\n\n{{steps.read-proof-context.output}}\n\nRequirements:\n1. keep the slice bounded to execute + structured capture\n2. explicitly include deterministic validation steps inside the workflow\n3. define the exact files to create/change\n4. define the exact tests/gates required before acceptance\n5. preserve the repo boundary (no imports from other relayfile repos)\n\nWrite:\n- docs/execute-proof-boundary.md\n- docs/execute-proof-no-regression-checklist.md\n- docs/execute-proof-plan.md\n\nEnd with RELAYFILE_CLI_EXECUTE_PROOF_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/execute-proof-boundary.md' },
    })

    .step('implement-execute-proof', {
      agent: 'impl-codex',
      dependsOn: ['define-execute-proof-boundary'],
      task: `Implement the execute + artifact capture proof.\n\nRead:\n- docs/execute-proof-boundary.md\n- docs/execute-proof-no-regression-checklist.md\n- docs/execute-proof-plan.md\n\nRequirements:\n1. implement the execute primitive and structured result types\n2. add build/test scripts as needed\n3. add real tests for success, JSON parsing, missing command, and timeout\n4. use the 80-to-100 discipline: run tests, fix failures, rerun until green\n5. keep the slice bounded and mergeable\n\nEnd with RELAYFILE_CLI_EXECUTE_PROOF_IMPLEMENTATION_READY.`,
      verification: { type: 'exit_code' },
    })

    .step('validate-execute-proof', {
      type: 'deterministic',
      dependsOn: ['implement-execute-proof'],
      command: [
        'npm test 2>&1 || true',
        'npm run build 2>&1 || true',
        'find src -maxdepth 2 -type f | sort | sed -n "1,200p" || true',
        'find tests -maxdepth 2 -type f | sort | sed -n "1,200p" || true',
      ].join(' && '),
      captureOutput: true,
      failOnError: false,
    })

    .step('review-execute-proof', {
      agent: 'review-codex',
      dependsOn: ['validate-execute-proof'],
      task: `Review the execute + artifact capture proof.\n\nRead:\n- docs/execute-proof-boundary.md\n- docs/execute-proof-no-regression-checklist.md\n- docs/execute-proof-plan.md\n- changed files\n- validation output:\n{{steps.validate-execute-proof.output}}\n\nWrite:\n- docs/execute-proof-review-verdict.md\n\nAssess:\n1. did this actually clear the 80-to-100 bar?\n2. are the tests sufficient and trustworthy?\n3. did the slice stay inside the repo boundary?\n4. what should the next relayfile-cli proof be?\n\nEnd with RELAYFILE_CLI_EXECUTE_PROOF_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/execute-proof-review-verdict.md' },
    })

    .step('verify-execute-proof-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-execute-proof'],
      command: [
        'test -f docs/execute-proof-boundary.md',
        'test -f docs/execute-proof-no-regression-checklist.md',
        'test -f docs/execute-proof-plan.md',
        'test -f docs/execute-proof-review-verdict.md',
        'grep -q "RELAYFILE_CLI_EXECUTE_PROOF_REVIEW_COMPLETE" docs/execute-proof-review-verdict.md',
        'echo "RELAYFILE_CLI_EXECUTE_PROOF_VERIFIED"',
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
