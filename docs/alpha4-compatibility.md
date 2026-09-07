# Harness Alpha.4 compatibility

ProjectFlow Agent Teams 0.1.16 targets DeepSeek Harness 0.1.2-alpha.4.

Alpha.4 removed the Alpha.2 registerContinuableSetup lifecycle hook. The
plugin now installs member lifecycle handlers through agent/created and the
new child agent.ctx, while preserving the Alpha.2 hook as a runtime fallback
for older development hosts. Member messages use Alpha.4 sendMessage; the
older followup path remains only as a fallback.

The package pins every DSH peer and development dependency to the exact
0.1.2-alpha.4 release. A host without either supported lifecycle seam does
not abort plugin loading: the plugin logs a compatibility warning, marks
member execution unavailable, and reports the required host version when a
member operation is attempted.

The published package contains generated lib/index.js and lib/client.js
entrypoints. Source installs run prepare and can also be built explicitly
with pnpm install --frozen-lockfile followed by pnpm build before local
linking.
