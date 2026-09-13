# Admitad connection handoff — 13 September 2026

Account state reported by owner: official DealBot ad space under review. No network request to Admitad, credential, program, feed URL or production offer has been created.

## Verified existing system

Production starts at main 563679b77b13d46658e98155fbe554ff83c75536. Supabase dealbot-sync is ACTIVE v6 with pinned server secret authentication. Fourteen migrations are registered. Worker, retention and Cron-history jobs are active; 62 executions succeeded in the inspected preceding hour. Sources, runs and deals are empty. Five private import tables have RLS and no anon/authenticated SELECT grants; six sync RPCs deny execution to both roles.

Existing tests and AUTOPILOT-CONNECTION-READINESS.md document real 1,500-offer HTTP import/replay/update/expiration and a rolled-back 5,000-offer SQL load test. These expensive scenarios were not repeated during this preparation.

## Boundary and mapping contract

sources/admitad.mjs already accepts injected authorized pages() and normalize(record). It deliberately throws ADMITAD_CONNECTION_REQUIRED without them. This is a prepared adapter boundary, not an implemented Admitad client. No additional guessed mapping is useful before the approved transport and schema are available.

Only DealBot canonical destinations are known:

| Canonical destination | Required verification from actual authorized source |
|---|---|
| source / external_id | Stable identity and scope across programs, countries and variants; one reconciliation source per complete feed scope |
| merchant.external_id / name / website_url | Advertiser identity, name and public website; no credentials |
| category.external_id / name_fr / name_en | Actual source category semantics; explicit maintained mapping where translation is absent |
| name / description / image_url | Permitted content usage, supported encoding and HTTPS image availability |
| price / old_price / currency | Unit price, currency, decimal precision, taxes/delivery and genuine reference-price meaning; do not invent reductions |
| availability / starts_at / expires_at | Supported stock values, timestamps and timezone; unknown stays unknown |
| original_url / affiliate_url | Actual destination and approved attribution link; no API tokens or signed feed URLs stored as product links |

Collector requirements after approval: approved transport, credential lifecycle, exact response schema, pagination termination, complete-vs-delta semantics, rate limits/backoff, resumable fetch checkpoints and scheduler. The existing Cron processes queued imports; it does NOT fetch Admitad. Never reconcile an incomplete/failed feed as complete. A delta feed requires preserved full source state or documented explicit deletion handling before reconciliation.

Limits: 10,000 offers / 64 MiB / 1,000 pages per complete snapshot; requests <=500 offers / 2 MiB (helper targets 400 / 1.8 MB). Partition larger feeds by stable non-overlapping scopes and reconcile each complete scope independently. Do not silently truncate.

## Activation steps after approval

1. Owner authorizes the official account, confirmed ad space and approved programs; supplies private documentation/feed access through a secure channel only where it cannot be discovered from that access.
2. Implement and test the actual collector/mapping from authoritative documentation and real permitted samples. Store secrets only on the server; redact transport errors and never log signed URLs or tokens.
3. Configure source identity, allowed merchant/affiliate hosts, non-fixture mode and publishing policy using actual program rules. Review permitted territories and content/price update requirements.
4. Validate one bounded real import as drafts, price/links/images and attribution, then authorize automatic publication for the approved scope. Schedule collection and test its automatic refresh, failed/incomplete-feed recovery and expiration.

No credential values or program identifiers are needed while review is pending.

## Admin monitoring

The protected existing offers table includes merchant, price, availability, actual publication status, score and score method. It now also displays source, source offer identity, revision and affiliate hostname (not query parameters). Full product affiliate URL remains in the existing authorized edit form. No private run payload, credential or sync RPC is exposed to the frontend. Technical run/error/retry monitoring remains in Supabase, not a new DealBot job dashboard.

The schema, RLS, Edge function, Cron, public catalogue and Mitgo meta tag are unchanged by this admin-only preparation.
