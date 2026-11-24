# v1.11.10 코트 정돈

Base: 12fe60fdbbf2d9dedce46250c0bbe0e5a93ae97e (v1.11.9; prior official CI successful).

- Home: move the existing two public 2025 school cards immediately below survey actions; rotate once at midnight KST, stable across users for the same public data snapshot. Keep source, high/low criteria and level-aware links. Independent visit statistics card restored (today/month/total), followed by single-line notice with explicit expansion. Existing server notice audience and visit data remain unchanged.
- Search: remove the showcase and the 2026 publication-criteria disclosure, not the publication policy or enforcement.
- School report: experience link beside Post-it; verified public school ID passed to the hub and both existing pickers. Demo has no experience link. No automatic game start; existing access and eligibility checks remain.
- Main navigation: five destinations, locker room hidden; Post-it routes and server code preserved.
- No production deployment, database changes, Vercel use, account or integrated control tower changes.
- Candidate remains unregistered until exact-SHA official CI and registration preflight pass. Browser tests use intercepted network fixtures; no production writes.

Follow-up: remove generic home experience button; each daily school, public/verified search result and report links directly to teacher-volleyball.html with school ID. Keep the hub route available via main navigation. Existing picker and game start API remain authoritative. Added actual game-page intercepted-browser checks for selected school, easy/extreme readiness, start, and ineligible school; no DB writes.

Home showcase polish: matching card hierarchy, neutral tier tags, readable percentiles, year left and detail/game actions right. Mobile <=640px uses stacked full-width cards. Existing level-aware detail and direct volleyball routes remain unchanged.
