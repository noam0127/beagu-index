Independent staging controller (not yet active)

Requires BEAGU_STAGE_VERCEL_TOKEN in protected GitHub environment. No secret in repository. Only existing owner-MFA-approved jobs are claimed by signed OIDC worker. Stage jobs never publish Pages. Actual deployment is verified by Vercel metadata and alias, then recorded. Keep old production deployment unchanged until separate review. Test database feature parity and browser tests still required. Never put production DB secrets or real teacher responses in test environment.
