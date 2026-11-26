# Closed-choice privacy candidate
- Base: 160f6fa6a419f4b4ab878200a25cb42dae35c467. No operational database writes, deployment, or changes to scores and percentiles.
- Historical verified original catalogue covers only a subset of questions (2023: 10, 2024: 13, 2025: 20). Unknown questions fail closed until original form options can be independently verified. Observed response strings are not an approved catalogue. The static observed list is cleared in this candidate; old Git objects and previously served copies are not removed.
- Historical mode, selections and categorical benchmark paths use exact original catalogue membership. Some existing modes and comparisons will be withheld pending verification; no inference or conversion of unverified strings.
- 2026 edited approved results project only known question/row/values; Q31/Q51 remain excluded. Exact structured time results retain existing validation.
- Original source records remain unchanged. Further audit of all routes, original form coverage, other static files and historical deployments is required before registration. No release action.

## Preservation revision
- User explicitly rejected removing ordinary objective responses. 125 observed 2025 labels now independently match the corresponding question's development draft (ignoring formatting only); they are restored in the candidate catalogue. The original final form is still required for the remaining changed and checkbox labels. This is partial candidate coverage, NOT approval to publish a restrictive candidate. No operational change.
- Original numbered labels support deterministic exact-text equivalence across Arabic/circled numbering, returning canonical catalogue text, not the raw response. No matching by ordinal alone.
- Do not register or deploy this candidate until existing valid objective responses are confirmed preserved. Remaining unknown choices must not be treated as proof of free text.

## Checkbox source corroboration (2026-11-26)
- Original calculation workbook 2025배구지수0004, 계산결과 rows 2 and 21, independently defines 16 Q03 and 9 Q04 labels, also present in the prior observed catalogue. Restore these 25 labels in the candidate, preserving exact documented strings. The workbook's calculation headers are corroboration, not proof of complete final-form coverage.
- Remaining 25 prior observed labels and any original options never observed remain unresolved. Do not mark them as free text by default. Do not register/deploy this incomplete candidate. The existing production UI and DB remain unchanged.
- Prior candidate 069a49479cb9198c9926ba4b8860c3593f626912: all 17 PR workflow runs succeeded (clean release 45750106686).

## Final elementary form PDF verification
- Two matching PDF exports dated 2026-02-26: Drive file IDs 1RUIYFVx8Z5tPoGnZVgprmgz64ln4IkzD and 1cZpyiQEQZwDJLL7-tofqBidJ7gNbNH7-. Form Q19–Q48 map to survey Q01–Q30; printed pp.18–32. All 170 fixed labels verified; Q31–Q50 three-option grid remains unchanged. Of 175 prior observed labels, 170 match the final form, five are not fixed choices in that final form. No respondent strings were added to the public catalogue. 20 additional fixed labels restored.
- 2023 and 2024 PDF archives available only show first sections, not the remaining unverified questions (2023 Q11–14, 2024 Q03). Do not assume those responses are free text. Existing production remains unchanged; no registration until cross-year preservation is verified.
- This confirms the archived final questionnaire, not necessarily every earlier revision. Existing historical scores and percentile datasets unchanged.

## Historical numeric preservation
- 2023-11-12 announcement archive (Drive 11YG0fOYius3NGwbKHVi07WFX7H5mqoXd) documents 6 choices per added Q11–Q14. Raw source sheet N2:Q6199 has 1,316 nonempty values per question, exclusively numeric 1–6. Restore announcement labels with explicit numeric code mapping; final form wording not independently confirmed.
- 2024 Q03 raw source V2:V10360 has 10,259 nonempty values exclusively 1–6. Preserve numeric codes without inventing verbal labels. Final wording not recovered. These five questions had zero rows in the two existing approved mode paths in a read-only DB query; do not create new aggregates or change release authorization here.
- Prior SHA 15eef6a1cbcab2e524403d2f6bde659aa48ca8f5: 17/17 workflows succeeded. New candidate still requires CI and audit of all previously served approved modes, static assets, and 2026 mixed-response behavior before registration. No deployment or operational writes.

## Preserve approved normal responses (targeted correction)
- 2024 Q12: 226 approved mode records store the internal placeholder for verified code 3; raw column AE contains 918 code-3 responses. Publish canonical numeric '3점' only, not invented wording.
- 2025 Q14: source column AG has exact unnumbered variants of all five final-form labels; match only full unique label after whitespace/terminal period normalization. No prefix or partial text acceptance.
- 2025 Q27: source column AT contains 40 occurrences of the exact numbered typo '① 대부 바르게 인사한다'; map this explicit alias to verified final-form option 1. No fuzzy matching.
- 2026: approved aggregate projection keeps fixed-choice results when other rows are invalid; literal '기타' is never projected and is excluded before selecting mode. Edited/browser projection removes only invalid strings. Structural validation, approval/evidence/hash gates, scoring, source ingestion and DB are unchanged. Mixed raw comma-delimited free text cannot safely be decomposed without structured source provenance; this patch does not re-interpret ambiguous raw entries or bypass review.
- Remaining unmatched historical values are not automatically certified as free text; the archived final form may not capture every earlier revision. Registration remains contingent on preservation audit and CI.
