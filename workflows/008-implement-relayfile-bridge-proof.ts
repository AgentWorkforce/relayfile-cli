import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('008-implement-relayfile-bridge-proof')
    .description('Implement the first bridge proof showing relayfile-cli materialized files can align with relayfile path conventions while keeping consumers file-centric.')
    .pattern('supervisor')
    .channel('wf-008-implement-relayfile-bridge-proof')
    .maxConcurrency(4)
    .timeout(10_800_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the exact bounded bridge implementation slice.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Implements the bridge proof on top of execute + materialize.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews whether the bridge proof is bounded, file-centric, and keeps repo boundaries clean.',
      retries: 1,
    })

    .step('read-bridge-proof-context', {
      type: 'deterministic',
      command: [
        'echo "---BRIDGE BOUNDARY---"',
        'sed -n "1,320p" docs/relayfile-bridge-boundary.md',
        'echo "" && echo "---BRIDGE PROOF DIRECTION---"',
        'sed -n "1,280p" docs/relayfile-bridge-proof-direction.md',
        'echo "" && echo "---MATERIALIZATION REVIEW---"',
        'sed -n "1,240p" docs/materialization-implementation-review-verdict.md',
        'echo "" && echo "---CANONICAL SCHEMA BOUNDARY---"',
        'sed -n "1,240p" docs/canonical-file-schema-boundary.md',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-bridge-proof-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-bridge-proof-context'],
      task: `Define the exact bounded bridge implementation proof.\n\n{{steps.read-bridge-proof-context.output}}\n\nRequirements:\n1. prove file-path alignment using a provider convention as a proving case, not an architectural dependency\n2. keep the proof file-centric and local-filesystem-based\n3. avoid importing relayfile core, adapters, or providers into runtime code\n4. define exact files/tests/validation gates\n5. keep the slice bounded and mergeable\n\nWrite:\n- docs/relayfile-bridge-implementation-boundary.md\n- docs/relayfile-bridge-implementation-checklist.md\n- docs/relayfile-bridge-implementation-plan.md\n\nEnd with RELAYFILE_CLI_BRIDGE_IMPLEMENTATION_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/relayfile-bridge-implementation-boundary.md' },
    })

    .step('implement-bridge-proof', {
      agent: 'impl-codex',
      dependsOn: ['define-bridge-proof-boundary'],
      task: `Implement the relayfile-cli bridge proof.\n\nRead:\n- docs/relayfile-bridge-implementation-boundary.md\n- docs/relayfile-bridge-implementation-checklist.md\n- docs/relayfile-bridge-implementation-plan.md\n\nRequirements:\n1. implement the smallest bridge proof that demonstrates path-aligned file materialization\n2. add deterministic tests that prove the resulting files are readable and aligned with expected relayfile-style paths\n3. keep the proof bounded and generic\n4. do not add runtime dependencies on core relayfile/adapters/providers\n5. use the 80-to-100 discipline\n\nEnd with RELAYFILE_CLI_BRIDGE_IMPLEMENTATION_READY.`,
      verification: { type: 'exit_code' },
    })

    .step('validate-bridge-proof', {
      type: 'deterministic',
      dependsOn: ['implement-bridge-proof'],
      command: [
        'npm test 2>&1 || true',
        'npm run build 2>&1 || true',
      ].join(' && '),
      captureOutput: true,
      failOnError: false,
    })

    .step('review-bridge-proof', {
      agent: 'review-codex',
      dependsOn: ['validate-bridge-proof'],
      task: `Review the relayfile-cli bridge proof.\n\nRead:\n- docs/relayfile-bridge-implementation-boundary.md\n- docs/relayfile-bridge-implementation-checklist.md\n- docs/relayfile-bridge-implementation-plan.md\n- changed files\n- validation output:\n{{steps.validate-bridge-proof.output}}\n\nWrite:\n- docs/relayfile-bridge-implementation-review-verdict.md\n\nAssess:\n1. does the proof really show the bridge works at the file level?\n2. does it stay generic and boundary-safe?\n3. is the repo now ready for canonical-schema conformance proof work?\n\nEnd with RELAYFILE_CLI_BRIDGE_IMPLEMENTATION_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/relayfile-bridge-implementation-review-verdict.md' },
    })

    .step('verify-bridge-proof-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-bridge-proof'],
      command: [
        'test -f docs/relayfile-bridge-implementation-boundary.md',
        'test -f docs/relayfile-bridge-implementation-checklist.md',
        'test -f docs/relayfile-bridge-implementation-plan.md',
        'test -f docs/relayfile-bridge-implementation-review-verdict.md',
        'grep -q "RELAYFILE_CLI_BRIDGE_IMPLEMENTATION_REVIEW_COMPLETE" docs/relayfile-bridge-implementation-review-verdict.md',
        'echo "RELAYFILE_CLI_BRIDGE_IMPLEMENTATION_VERIFIED"',
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
