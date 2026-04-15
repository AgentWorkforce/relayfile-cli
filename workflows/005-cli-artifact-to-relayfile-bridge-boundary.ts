import { workflow } from '@agent-relay/sdk/workflows';
import { ClaudeModels, CodexModels } from '@agent-relay/config';

async function main() {
  const result = await workflow('005-cli-artifact-to-relayfile-bridge-boundary')
    .description('Define the clean bridge from relayfile-cli artifacts into relayfile file-shaped state, preserving adapter/provider boundaries and keeping downstream consumers like NightCTO file-centric.')
    .pattern('supervisor')
    .channel('wf-005-cli-artifact-to-relayfile-bridge-boundary')
    .maxConcurrency(4)
    .timeout(8_400_000)

    .agent('lead-claude', {
      cli: 'claude',
      model: ClaudeModels.OPUS,
      preset: 'analyst',
      role: 'Defines the clean CLI artifact → relayfile bridge boundary.',
      retries: 1,
    })
    .agent('impl-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      role: 'Writes the first bridge boundary docs and proof direction.',
      retries: 1,
    })
    .agent('review-codex', {
      cli: 'codex',
      model: CodexModels.GPT_5_4,
      preset: 'reviewer',
      role: 'Reviews whether the bridge keeps relayfile-cli, relayfile, adapters, providers, and NightCTO cleanly separated.',
      retries: 1,
    })

    .step('read-bridge-context', {
      type: 'deterministic',
      command: [
        'echo "---README---"',
        'sed -n "1,260p" README.md',
        'echo "" && echo "---REPO BOUNDARY---"',
        'sed -n "1,260p" docs/repo-boundary.md',
        'echo "" && echo "---MATERIALIZATION BOUNDARY---"',
        'sed -n "1,320p" docs/materialization-boundary.md',
        'echo "" && echo "---RELAYFILE README---"',
        'sed -n "1,240p" ../relayfile/README.md || true',
      ].join(' && '),
      captureOutput: true,
      failOnError: true,
    })

    .step('define-bridge-boundary', {
      agent: 'lead-claude',
      dependsOn: ['read-bridge-context'],
      task: `Define the clean bridge from relayfile-cli artifacts to relayfile file-shaped state.\n\n{{steps.read-bridge-context.output}}\n\nRequirements:\n1. keep NightCTO and other consumers file-centric rather than CLI-centric\n2. define what relayfile-cli owns vs what core relayfile owns vs what adapters/providers own\n3. explain how CLI-derived artifacts become path-mapped file state without collapsing boundaries\n4. make clear whether adapter-style mapping rules participate in this bridge and how\n5. define the first bounded proof direction after this boundary\n6. keep the slice mergeable and honest\n\nWrite:\n- docs/relayfile-bridge-boundary.md\n- docs/relayfile-bridge-proof-direction.md\n- docs/relayfile-bridge-review-verdict.md\n\nEnd with RELAYFILE_CLI_BRIDGE_BOUNDARY_READY.`,
      verification: { type: 'file_exists', value: 'docs/relayfile-bridge-boundary.md' },
    })

    .step('review-bridge-boundary', {
      agent: 'review-codex',
      dependsOn: ['define-bridge-boundary'],
      task: `Review the CLI artifact → relayfile bridge boundary.\n\nRead:\n- docs/relayfile-bridge-boundary.md\n- docs/relayfile-bridge-proof-direction.md\n- docs/relayfile-bridge-review-verdict.md\n\nAssess:\n1. does the bridge keep relayfile-cli generic?\n2. does it keep relayfile as the canonical file-shaped layer?\n3. are adapters/providers still in the right roles?\n4. does it keep NightCTO and other consumers at the file level?\n5. is the next proof direction sensible?\n\nEnd with RELAYFILE_CLI_BRIDGE_BOUNDARY_REVIEW_COMPLETE.`,
      verification: { type: 'file_exists', value: 'docs/relayfile-bridge-review-verdict.md' },
    })

    .step('verify-bridge-boundary-artifacts', {
      type: 'deterministic',
      dependsOn: ['review-bridge-boundary'],
      command: [
        'test -f docs/relayfile-bridge-boundary.md',
        'test -f docs/relayfile-bridge-proof-direction.md',
        'test -f docs/relayfile-bridge-review-verdict.md',
        'grep -q "RELAYFILE_CLI_BRIDGE_BOUNDARY_REVIEW_COMPLETE" docs/relayfile-bridge-review-verdict.md',
        'echo "RELAYFILE_CLI_BRIDGE_BOUNDARY_VERIFIED"',
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
