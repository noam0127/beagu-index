# v1.11.15.2 automatic opening candidate
- Install the SQL before the three Edge functions; no production fixture or release approval.
- The dashboard shows aggregates and exceptions only. Existing legacy review UI is retained only as regression fixture; not loaded in production.
- Auto-percentile publication reuses exact existing v1.3 evidence or a trusted verifier's exact snapshot-bound record in the private auto_evidence table. Common scope compatibility is required. No browser writer and no automatic creation of privacy or uniqueness evidence.
- Current live cohort has zero such verified school records. The source evidence producer still needs verified inputs; do not fabricate records or assume that a low flag count proves anonymity. A single observation can pass only with complete verified evidence.
- Reaggregation requests are durable holds, not execution of the scoring pipeline. A source operator must validate and exclude confirmed invalid rows in a separate source workflow; original answers remain untouched. Hold removal must be implemented with fresh evidence and explicit owner authorization before resumption.
- Report reasons private; no identity fields, question identifier, raw answers or Q31. Existing correction route is preserved.
- Verify actual API authorization with owner MFA after staged rollout; preserve live Q45 shared wording.
