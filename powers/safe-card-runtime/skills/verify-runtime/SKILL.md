---
name: verify-runtime
description: Check NecroCard interpreter and room invariants with independent properties.
---
# Verify a bounded card runtime
1. Read the selected requirements and identify the invariant under change.
2. Find the pure boundary: parse, interpret, canonicalize, apply operation or grant.
3. Define valid generators and malformed/boundary generators separately.
4. Use an independent oracle, not the implementation copied into the assertion.
5. Run fast-check through Vitest. Keep shrinking enabled on discovery runs.
6. For a failure, preserve seed/path/minimal case; add a focused regression.
7. Verify instruction limits and absence of effects for denied permissions.
8. Check AI proposal scope/revision and atomic budget reservations.
9. Check pointer coordinate transforms, cancellation and theme/document separation.
10. Report actual output and requirement IDs. Passing cases are evidence, not proof.
Do not change deployment, secrets, dependencies or scope as part of this workflow.
