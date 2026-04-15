import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('006-canonical-file-schema-boundary')
    .description('Define where canonical relayfile file schemas should live and how CLI-derived files should conform to them without collapsing repo boundaries.')
    .pattern('supervisor')
    .channel('wf-006-canonical-file-schema-boundary')
    .maxConcurrency(4)
    .timeout(8_400_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the canonical file-schema boundary across relayfile-cli, relayfile-adapters, relayfile-providers, and downstream consumers.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Writes the schema-boundary docs and first proof direction.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews whether the schema placement is clean and keeps CLI/file/consumer layers distinct.',
      retries: 1,
    })

    .step('read-schema-context', {
      type: 'deterministic',
      command: [
        'echo "---REPO BOUNDARY---"',
        'sed -n "1,260p" docs/repo-boundary.md',
        'echo "" && echo "---MATERIALIZATION BOUNDARY---"',
        'sed -n "1,260p" docs/materialization-boundary.md',
        'echo "" && echo "---BRIDGE BOUNDARY---"',
        'sed -n "1,280p" docs/relayfile-bridge-boundary.md',
        'echo "" && echo "---RELAYFILE README---"',
        'sed -n "1,220p" ../relayfile/README.md || true',
        'echo "" && echo "---ADAPTERS README---"',
        'sed -n "1,220p" ../relayfile-adapters/README.md || true',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-canonical-schema-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-schema-context'],
      task: `Define where canonical relayfile file schemas should live and how CLI-derived files should conform to them.\n\n{{steps.read-schema-context.output}}\n\nRequirements:\n1. distinguish raw CLI schema from canonical relayfile file schema from downstream consumer schema\n2. define which repo/layer should own canonical file schemas\n3. explain how relayfile-cli should target those schemas without absorbing adapter logic\n4. keep NightCTO and other consumers file-centric\n5. define the first bounded proof direction after this boundary\n6. keep the slice mergeable and honest\n\nWrite:\n- docs/canonical-file-schema-boundary.md\n- docs/canonical-file-schema-proof-direction.md\n- docs/canonical-file-schema-review-verdict.md\n\nEnd with RELAYFILE_CLI_CANONICAL_SCHEMA_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/canonical-file-schema-boundary.md' },
    })

    .step('review-canonical-schema-boundary', {
      agent: 'review-codex',
      dependsOn: ['define-canonical-schema-boundary'],
      task: `Review the canonical file-schema boundary.\n\nRead:\n- docs/canonical-file-schema-boundary.md\n- docs/canonical-file-schema-proof-direction.md\n- docs/canonical-file-schema-review-verdict.md\n\nAssess:\n1. are raw CLI schema, canonical file schema, and consumer schema clearly separated?\n2. is canonical schema ownership placed in the right repo/layer?\n3. does the boundary keep relayfile-cli generic and adapters authoritative?\n4. is the next proof direction sensible?\n\nEnd with RELAYFILE_CLI_CANONICAL_SCHEMA_BOUNDARY_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/canonical-file-schema-review-verdict.md' },
    })

    .step('verify-canonical-schema-boundary-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-canonical-schema-boundary'],
      command: [
        'test -f docs/canonical-file-schema-boundary.md',
        'test -f docs/canonical-file-schema-proof-direction.md',
        'test -f docs/canonical-file-schema-review-verdict.md',
        'grep -q "RELAYFILE_CLI_CANONICAL_SCHEMA_BOUNDARY_REVIEW_COMPLETE" docs/canonical-file-schema-review-verdict.md',
        'echo "RELAYFILE_CLI_CANONICAL_SCHEMA_BOUNDARY_VERIFIED"',
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
