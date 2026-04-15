import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('009-implement-canonical-schema-conformance-proof')
    .description('Implement the first relayfile-cli canonical schema conformance proof on top of execute + materialize + bridge foundations.')
    .pattern('supervisor')
    .channel('wf-009-implement-canonical-schema-conformance-proof')
    .maxConcurrency(4)
    .timeout(10_800_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the exact bounded canonical schema conformance proof slice.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Implements the canonical schema conformance proof and deterministic tests.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews whether the proof demonstrates canonical-shape conformance without collapsing boundaries.',
      retries: 1,
    })

    .step('read-canonical-proof-context', {
      type: 'deterministic',
      command: [
        'echo "---CANONICAL SCHEMA BOUNDARY---"',
        'sed -n "1,320p" docs/canonical-file-schema-boundary.md',
        'echo "" && echo "---CANONICAL PROOF DIRECTION---"',
        'sed -n "1,280p" docs/canonical-file-schema-proof-direction.md',
        'echo "" && echo "---BRIDGE IMPLEMENTATION REVIEW---"',
        'sed -n "1,240p" docs/relayfile-bridge-implementation-review-verdict.md',
        'echo "" && echo "---MATERIALIZATION REVIEW---"',
        'sed -n "1,240p" docs/materialization-implementation-review-verdict.md',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-canonical-proof-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-canonical-proof-context'],
      task: `Define the exact bounded canonical schema conformance proof.\n\n{{steps.read-canonical-proof-context.output}}\n\nRequirements:\n1. prove conformance to a documented expected canonical file shape using one provider-style example\n2. keep relayfile-cli schema-unaware in runtime code\n3. keep conformance logic outside relayfile-cli core primitives\n4. define exact files/tests/validation gates\n5. keep the slice bounded and mergeable\n\nWrite:\n- docs/canonical-schema-implementation-boundary.md\n- docs/canonical-schema-implementation-checklist.md\n- docs/canonical-schema-implementation-plan.md\n\nEnd with RELAYFILE_CLI_CANONICAL_SCHEMA_IMPLEMENTATION_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/canonical-schema-implementation-boundary.md' },
    })

    .step('implement-canonical-proof', {
      agent: 'impl-codex',
      dependsOn: ['define-canonical-proof-boundary'],
      task: `Implement the relayfile-cli canonical schema conformance proof.\n\nRead:\n- docs/canonical-schema-implementation-boundary.md\n- docs/canonical-schema-implementation-checklist.md\n- docs/canonical-schema-implementation-plan.md\n\nRequirements:\n1. implement the smallest bounded proof that shows CLI-derived output can conform to a documented canonical file shape\n2. keep runtime code generic and schema-unaware\n3. add deterministic tests for conforming vs diverging shapes and file-level readability\n4. do not import relayfile core, adapters, or providers into runtime code\n5. use the 80-to-100 discipline\n\nEnd with RELAYFILE_CLI_CANONICAL_SCHEMA_IMPLEMENTATION_READY.`,
      verification: { type: 'exit_code' },
    })

    .step('validate-canonical-proof', {
      type: 'deterministic',
      dependsOn: ['implement-canonical-proof'],
      command: [
        'npm test 2>&1 || true',
        'npm run build 2>&1 || true',
      ].join(' && '),
      captureOutput: true,
      failOnError: false,
    })

    .step('review-canonical-proof', {
      agent: 'review-codex',
      dependsOn: ['validate-canonical-proof'],
      task: `Review the relayfile-cli canonical schema conformance proof.\n\nRead:\n- docs/canonical-schema-implementation-boundary.md\n- docs/canonical-schema-implementation-checklist.md\n- docs/canonical-schema-implementation-plan.md\n- changed files\n- validation output:\n{{steps.validate-canonical-proof.output}}\n\nWrite:\n- docs/canonical-schema-implementation-review-verdict.md\n\nAssess:\n1. does the proof really demonstrate canonical-shape conformance?\n2. does it keep relayfile-cli generic and boundary-safe?\n3. is the repo now credible as a reusable ecosystem substrate?\n\nEnd with RELAYFILE_CLI_CANONICAL_SCHEMA_IMPLEMENTATION_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/canonical-schema-implementation-review-verdict.md' },
    })

    .step('verify-canonical-proof-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-canonical-proof'],
      command: [
        'test -f docs/canonical-schema-implementation-boundary.md',
        'test -f docs/canonical-schema-implementation-checklist.md',
        'test -f docs/canonical-schema-implementation-plan.md',
        'test -f docs/canonical-schema-implementation-review-verdict.md',
        'grep -q "RELAYFILE_CLI_CANONICAL_SCHEMA_IMPLEMENTATION_REVIEW_COMPLETE" docs/canonical-schema-implementation-review-verdict.md',
        'echo "RELAYFILE_CLI_CANONICAL_SCHEMA_IMPLEMENTATION_VERIFIED"',
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
