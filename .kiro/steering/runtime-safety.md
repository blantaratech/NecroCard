---
inclusion: fileMatch
fileMatchPattern: ["src/domain/**", "src/runtime/**", "supabase/functions/**", "supabase/migrations/**", "tests/**"]
---
# Runtime invariants
No eval, Function, user HTML, arbitrary URLs or dynamic user imports.
Parse to typed commands; stable IDs; reject invalid names/references.
Validate before mutation. Persist snapshot and dedup atomically before ack.
No external network call inside database mutation transactions.
Verify user JWTs in Edge handlers before privileged calls.
No service key or Nebius key in browser code.
Reserve global AI cost atomically before inference; preserve uncertain usage.
Local play state is not shared authoring state.
Consent is scoped to a document hash; denial produces zero external calls.
Limit bytes before parsing. Do not log tokens, raw documents or private drafts.
For each critical change: state the invariant, implement, run a meaningful check,
and report actual results. Counterexample generators must include boundary cases.
