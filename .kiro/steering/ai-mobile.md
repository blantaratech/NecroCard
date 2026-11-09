---
inclusion: fileMatch
fileMatchPattern: ["src/app/**", "src/ai/**", "supabase/functions/**", "tests/**"]
---
# Cross-device AI authoring
Use shared domain logic; do not create separate phone behavior implementations.
All MVP controls work at 320 CSS px, touch and keyboard. Use 48px primary targets.
Pointer geometry comes from the current element rect, including after rotation.
Spooky styling never obscures text, focus, validation, save state or consent.
AI output is a proposal for one selected existing button; never execute generated JS.
Require schema/compiler checks, visible review, explicit Apply and current revision.
Never auto-approve MCP tools from an AI suggestion. Reserve cost before inference.
Do not send the whole stack or private drafts when selected context is sufficient.
