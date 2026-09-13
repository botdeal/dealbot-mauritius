# Autopilot — readiness to connect an account

Continuation of 8971fd3, only supabase-integration. No Admitad connection or main change.

## Delivered and verified

The deployed dealbot-sync is v6. Its secret-authenticated HTTP endpoint accepts immutable multipart snapshots, checks an ordered manifest of page receipts and expected counts, then queues atomic PostgreSQL processing. Missing pages, changed pages, cross-page duplicate offers and inconsistent shared entities prevent reconciliation. Source revisions remain monotonic after receipt retention expires. Network-specific collection and mapping remain separate from this engine.

Operating envelope: 10,000 offers / 64 MiB / 1,000 pages per snapshot. Each request remains bounded to 500 offers / 2 MiB; the helper targets 400 offers / 1.8 MB. This is bounded multipart ingestion, not unlimited streaming. A complete snapshot is assembled inside PostgreSQL and applied in one transaction. Upstream pagination completeness must be established by the collector before sealing.

42 Node tests pass, zero failures, after the final retention fix and reconstruction migration alignment. The tests cover the existing app, database reconstruction, auth/RLS regressions, imports, multipart transport, rejected manifests, price history, reconciliation and retry retention. The final targeted test also passed on real Supabase: failed payload retained for eight days, cleanup, manual retry, real offer created, then ROLLBACK.

## Real authenticated HTTP proof (12 September 2026)

A temporary fixture-only Edge runner used the platform's existing secret key internally on the apikey header to call the deployed dealbot-sync URL. The platform key never left Supabase. The runner required a random 256-bit capability checked by hash and an expiration, accepted only a fixed fixture scenario, and has since been replaced by an inert HTTP 410 handler.

- Initial snapshot: 1,500 offers, 4,279,171 UTF-8 bytes, four chunks. Actual Edge responses 200 for receipt operations, 202 for sealing. Run 36 succeeded through the permanent Cron worker; PostgreSQL contained exactly 1,500 deals and 1,500 history rows.
- Exact HTTP replay returned the same run 36, without duplicates.
- Revision 2: run 39 succeeded; 100 price updates and 1,400 unchanged offers.
- Revision 3: run 42 succeeded; 100 absent offers expired, 1,400 unchanged.
- Direct PostgreSQL verification: 1,500 total deals, 100 expired, 1,600 history rows.
- Concurrency: while another live connection held the source advisory lock, sync_process returned {"id":36,"state":"busy"}. The temporary Cron lock task was removed.
- All fixture sources, deals, merchants, categories, snapshots, chunks, runs, events and associated test audit records were cleaned. Existing reference categories and profile remained. The rollback load test left no records.

This is a real Edge HTTP authentication → PostgreSQL staging → Cron processing → catalog verification test, not a mocked HTTP handler test. Source collection is intentionally absent.

## Representative live load

`tests/autopilot-load.sql` ran on the existing Supabase PostgreSQL 17 and rolled back all fixtures.

| Step | Result | Elapsed SQL time |
|---|---|---|
| Import 5,000 offers | 5,000 created | 5.806805 s |
| New revision, same 5,000 offers | 5,000 unchanged, no duplicates | 5.923629 s |
| 4,500 retained offers, 500 price changes | 500 updated, 500 expired | 5.191674 s |
| Controlled SQL 40001 failure | Durable retry, atomic rollback | 2.455802 s |
| Resume | Succeeded on attempt 2 | Functional assertions passed |

Final assertions: 5,000 unique deals, 10 merchants, 5 categories, 6,000 price-history rows, 500 expired offers. Four stored run payloads represented 50,297,720 bytes of JSON text and occupied 1,836,012 bytes as compressed PostgreSQL values. This is payload storage, not total database size or peak RAM. Per-process CPU/RAM and a long-duration soak were not measured; no claim of unlimited capacity is made.

The expensive quadratic shared-entity validation was replaced with SQL grouping. The worker processes one atomic snapshot per minute with a 45-second statement budget, avoiding five large snapshots in one transaction.

## Retention

Hourly bounded cleanup is installed and its logic has been tested locally and directly on Supabase:

- Upload abandonment after 24 hours; terminal/abandoned staging removed after seven days.
- Successful/superseded payload bodies removed after seven days, receipts retained 30 days.
- Failed payloads and failure records retained 90 days, so retry is still meaningful.
- Queued/retrying runs older than seven days become explicit QUEUE_EXPIRED failures.
- Up to 100 snapshots and 500 run records per cleanup pass.
- Autopilot Cron history retained 14 days, with a daily cleanup job.
- Catalog, personal data and price history are never purged by this policy.
- Automatic per-row admin-audit duplication is suppressed; durable run events record import activity. Human admin actions remain audited.

Three Cron jobs are active: worker every minute; retention at minute 17 of each hour; Cron-history cleanup daily at 03:23 UTC. The worker's actual automatic consumption was observed; retention execution logic was also invoked directly. No external feed is fetched by these jobs.

## Admitad boundary

READY TO CONNECT REAL ADMITAD ACCOUNT: YES — within the documented operating envelope, ready to begin the real authorized integration.

This does not mean a live Admitad collector is already implemented. `sources/admitad.mjs` provides an explicit connection factory with injected authorized pagination and canonical mapping. Without these, it throws ADMITAD_CONNECTION_REQUIRED. It contains no guessed endpoint, OAuth parameter, credential, scope or response field.

After account authorization, the selected approved feed/program and its actual documentation determine the transport, scopes, quota handling and field mapping. These are subsequent integration work; the generic engine does not need rewriting. Live publishing must remain disabled until that real mapping is tested. No Admitad requests or credentials have been used.

Security advisor: private ingestion tables intentionally have RLS with no client policies/grants; the pre-existing Auth leaked-password-protection warning remains outside this server-only import work. No new public privileged API access was introduced.
