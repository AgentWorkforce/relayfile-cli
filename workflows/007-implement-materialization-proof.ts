import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('007-implement-materialization-proof')
    .description('Implement the first relayfile-cli materialization proof so CLI artifacts can deterministically become local file-shaped outputs.')
    .pattern('supervisor')
    .channel('wf-007-implement-materialization-proof')
    .maxConcurrency(4)
    .timeout(10_800_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the exact bounded 80-to-100 materialization implementation slice.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Implements materialization and drives the deterministic validation loop.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews whether the materialization proof is bounded, trustworthy, and ready for the bridge/conformance proofs.',
      retries: 1,
    })

    .step('read-materialization-proof-context', {
      type: 'deterministic',
      command: [
        'echo "---MATERIALIZATION BOUNDARY---"',
        'sed -n "1,320p" docs/materialization-boundary.md',
        'echo "" && echo "---MATERIALIZATION PROOF DIRECTION---"',
        'sed -n "1,280p" docs/materialization-proof-direction.md',
        'echo "" && echo "---BRIDGE BOUNDARY---"',
        'sed -n "1,240p" docs/relayfile-bridge-boundary.md',
        'echo "" && echo "---CANONICAL SCHEMA BOUNDARY---"',
        'sed -n "1,240p" docs/canonical-file-schema-boundary.md',
        'echo "" && echo "---PACKAGE---"',
        'cat package.json',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-materialization-proof-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-materialization-proof-context'],
      task: `Define the exact bounded 80-to-100 implementation slice for relayfile-cli materialization.\n\n{{steps.read-materialization-proof-context.output}}\n\nRequirements:\n1. keep the slice bounded to generic artifact-to-file materialization\n2. do not absorb adapter logic or canonical schema validation into relayfile-cli\n3. define the exact files to create/change\n4. define the exact deterministic validation gates and tests required\n5. keep the proof mergeable and trustworthy\n\nWrite:\n- docs/materialization-implementation-boundary.md\n- docs/materialization-implementation-checklist.md\n- docs/materialization-implementation-plan.md\n\nEnd with RELAYFILE_CLI_MATERIALIZATION_IMPLEMENTATION_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/materialization-implementation-boundary.md' },
    })

    .step('implement-materialization-proof', {
      agent: 'impl-codex',
      dependsOn: ['define-materialization-proof-boundary'],
      task: `Implement the relayfile-cli materialization proof.\n\nRead:\n- docs/materialization-implementation-boundary.md\n- docs/materialization-implementation-checklist.md\n- docs/materialization-implementation-plan.md\n\nRequirements:\n1. implement the materialization primitive and supporting types\n2. add deterministic tests for formats, conditions, conflict strategies, dry-run, and composition with execute()\n3. use the 80-to-100 discipline: run tests, fix failures, rerun until green\n4. keep the slice bounded and mergeable\n5. do not collapse boundaries with core relayfile or adapters\n\nEnd with RELAYFILE_CLI_MATERIALIZATION_IMPLEMENTATION_READY.`,
      verification: { type: 'exit_code' },
    })

    .step('validate-materialization-proof', {
      type: 'deterministic',
      dependsOn: ['implement-materialization-proof'],
      command: [
        'npm test 2>&1 || true',
        'npm run build 2>&1 || true',
        'find src -maxdepth 2 -type f | sort | sed -n "1,220p" || true',
        'find tests -maxdepth 2 -type f | sort | sed -n "1,220p" || true',
      ].join(' && '),
      captureOutput: true,
      failOnError: false,
    })

    .step('review-materialization-proof', {
      agent: 'review-codex',
      dependsOn: ['validate-materialization-proof'],
      task: `Review the relayfile-cli materialization proof.\n\nRead:\n- docs/materialization-implementation-boundary.md\n- docs/materialization-implementation-checklist.md\n- docs/materialization-implementation-plan.md\n- changed files\n- validation output:\n{{steps.validate-materialization-proof.output}}\n\nWrite:\n- docs/materialization-implementation-review-verdict.md\n\nAssess:\n1. did the proof clear the 80-to-100 bar?\n2. is materialization generic and bounded?\n3. are the tests sufficient to trust the primitive?\n4. is the repo now ready for bridge/conformance implementation slices?\n\nEnd with RELAYFILE_CLI_MATERIALIZATION_IMPLEMENTATION_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/materialization-implementation-review-verdict.md' },
    })

    .step('verify-materialization-proof-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-materialization-proof'],
      command: [
        'test -f docs/materialization-implementation-boundary.md',
        'test -f docs/materialization-implementation-checklist.md',
        'test -f docs/materialization-implementation-plan.md',
        'test -f docs/materialization-implementation-review-verdict.md',
        'grep -q "RELAYFILE_CLI_MATERIALIZATION_IMPLEMENTATION_REVIEW_COMPLETE" docs/materialization-implementation-review-verdict.md',
        'echo "RELAYFILE_CLI_MATERIALIZATION_IMPLEMENTATION_VERIFIED"',
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
