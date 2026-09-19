# Official AliExpress collector

Account-observed source: Admitad DealBot ad space 2993975, AliExpress WW 6115,
Hot Products feed 50003. The URL in `scripts/admitad/collect.py` was generated
through the official Product Feeds UI on 2026-09-19 (USD 75–100, discounted products only, YML).
The endpoint responds with streamed XML without account cookies or an API secret.
Do not generalize these parameters to another account or feed.

## Execution and access

The standard Ubuntu GitHub Actions runner in this **public** repository reads
the feed progressively. No giant feed is downloaded by the owner or retained as
an artifact. Standard public-repository runners are free. The job refuses a
private repository, uses no paid runner, has a 45-minute timeout and serializes
collector runs. Daily schedule: 04:37 UTC, plus manual dispatch and relevant
code pushes. GitHub can delay schedules or disable them after repository
inactivity; inspect Actions status rather than claiming guaranteed delivery.

GitHub obtains a short-lived OIDC token with audience `dealbot-admitad-collector`.
The deployed `dealbot-sync` verifies its RSA signature against GitHub JWKS,
issuer, audience, subject, immutable repository/owner IDs, `main`, exact workflow,
allowed event, expiration and GitHub-hosted/public runner context. Forks, pull
requests and other workflows cannot import. Existing secret-key authentication
is preserved. GitHub never receives a Supabase service key. The service-only
`admitad_snapshot` RPC can manipulate only this registered source's snapshots.

## Catalogue scope and truthfulness

The feed is read through a verified final XML envelope before **any** manifest is uploaded. Envelope errors,
truncation, resource caps, conflicting duplicate products, empty selection,
abnormal validation failures and greater-than-50% catalogue shrink preserve the
previous catalogue. A failed upload cannot reconcile until every chunk seals.
Exact request retries reuse the same manifest and page bodies. A new workflow
attempt uses a new revision and rescans the feed. No HTTP Range/resume support
has been assumed: failures restart a streaming scan, never skip unknown bytes.

Ten explicitly allowed everyday-product categories, a deterministic per-category
selection and a hard ceiling of 1,000 offers limit database/frontend costs.
Initial runs select up to three products/category for validation. Scale to 20,
then 100 after the live checks. The complete snapshot means this **curated scope**,
not the hundreds of thousands of upstream products. Changing the selection
policy is an operational change; do not silently lower its limits after scaling.

Identity uses the real offer ID. Price, currency, name, image and affiliate URL
come directly from XML. The original product URL is extracted from the actual
embedded deeplink, with host and product-ID verification; it is never constructed.
Affiliate URLs are kept byte-for-byte after XML entity decoding. Unknown stock
stays `unknown`; absent old prices/descriptions stay absent. No discount is
inferred from tracking parameters. Merchant is the AliExpress marketplace, not
an invented underlying shop. No ratings, commissions or shipping promises are
invented. Automatic DealBot scoring remains the existing transparent calculation.

## Persistence and budgets

The existing multipart Autopilot validates, deduplicates, scores, writes price
history and atomically reconciles absent selected products. Source registration
starts with `auto_publish=false`; enable only after the real draft import is
verified. The UI, authentication, RLS and other sources are unchanged.

The existing minute worker, hourly retention and daily Cron-log cleanup stay in
place. An additional hourly task withdraws this source's active offers if they
have not been checked in 72 hours. This is a DealBot freshness policy, not an
invented merchant expiration date. Successful complete snapshots normally expire
disappeared offers earlier. Stale withdrawal never deletes data.

The collector caps input at 2 GiB, one million offers and 35 minutes, keeps only
selected offers in memory and uses a disposable disk-backed deduplication index.
The narrow RPC caps snapshots at 1,000 offers/10 pages and stops ingestion when
the database exceeds 350 MiB. No images are copied into Supabase Storage. Existing
retention policies apply to import queues; product history is preserved.

## Validation

`python3 -m unittest discover -s scripts/admitad -p 'test_*.py'`

`npm test`

Live validation must additionally confirm the authenticated GitHub workflow →
deployed Edge → PostgreSQL import, source-scoped rows, public rendering and one
user-authorized affiliate redirect. A 200 feed response alone is not this test.
Never record tokens, raw authorization headers or full product payloads in job logs.

References:
- https://docs.github.com/en/actions/reference/security/oidc
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://supabase.com/docs/guides/functions/limits

## Upstream malformed-record handling

The 10–25 USD feed failed strict whole-document parsing at line 2284286; the
discount-only variant failed at line 1580077. The collector now parses each
bounded offer independently, excludes malformed records without repairing URLs
or prices, counts rejections, and still requires the complete valid closing
envelope. Excessive invalid records abort the entire import. The selected
75–100 USD official partition reduces upstream volume. No undocumented cursor,
category parameter or range request is used.
