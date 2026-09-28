# Universal Product Search — shipped scope and limits

## Active execution path
Browser local index (accent folding, FR/EN aliases, token/prefix retrieval, explicit model/storage/colour conflict checks) → debounced PostgreSQL GIN search → public catalogue refresh. Search results remain usable if the server request fails. 4-second UI deadline, 2-second SQL statement limit, maximum 50 server results; 2-minute/50-query browser cache. No uncontrolled external web navigation.

The existing scheduled AliExpress collector is the only installed external source. It now executes through a capability-checked SourceOrchestrator, reads actual missing-search priorities using its existing GitHub OIDC → Edge → private RPC bridge, scans the entire approved feed partition, prefers matching products within the unchanged per-category/1000-offer cap, then submits the same validated Autopilot snapshots. Failed/truncated feeds still cannot reconcile/expire the catalogue. Retries, single-run concurrency, durable import journals, retention and 350 MB guard are preserved.

There is no authorized live product-search API or deeplink generator configured. A query not covered today does not launch a 1 GB download or pretend to search the entire Internet. The UI explicitly states scheduled-feed coverage. A matching product outside the current USD 75–100 discounted/category scope cannot be discovered by this adapter.

## Demand Intelligence
Only normalized product queries; country; capped result count; missing-result count; and searches that led to an actual tracked click are aggregated. No account ID/IP is stored in these new tables. Common email/URL/long-number/credential-like queries are discarded. Do Not Track disables browser telemetry. Product retrieval still works.

Deduplication: one query/country/session/day; hash of daily date + random session UUID, with receipt retained 24 hours. Maximum 30 distinct queries per session/day and 5000 receipts globally/day. Anonymous statistics are abuse-bounded signals, NOT verified unique people or market popularity. Aggregates retained 30 days, hourly cleanup. No raw queries appear in public logs.

Three distinct sessions over seven days with fewer than three results qualify for demand prioritization. At most 30 priorities, bounded weights. Source matches are counted only on a completed scan; import must succeed before the scan report is persisted. A telemetry failure cannot block collection. Admin monitoring is server-role-checked; tables have RLS, no public grants. Only the service-role-scoped OIDC collector can consume priorities/report matching.

Click attribution requires the original tracking RPC to have already recorded the actual offer + matching session within one minute; merely calling the attribution RPC cannot fabricate a click. No purchase/conversion/commission events are simulated.

## Product identity and comparison
Retrieval attributes inferred from a title are NOT merge evidence. Automatic grouping requires a valid GTIN or brand+MPN, explicit verified flag, complete identical primitive variant fields. matchEvidence confidence is deterministic 0/1 rule evidence, not a statistical probability. Uncertainty or any conflict keeps offers separate.

Comparison keeps native price/currency, conversion estimates, known market restrictions and actual shipping metadata. A total is only computed when shipping cost/currency are provided and tax_included is explicitly true. Unknown costs never become zero. A best-total identifier requires at least two fully calculable available offers; commission is not an input. Original and provided affiliate URLs, source ID, external ID, timestamps and network/program registry remain available. Merchant links still go through track_deal_click. Affiliate disclosure is shown on the product page.

Only AliExpress is actually connected. No second real merchant match currently exists. Official affiliate URLs are extracted and validated from the real Admitad feed, never synthesized; on-demand deeplink generation remains unavailable until an authorized API adapter is installed.

## Adding a source
Add an approved, cache-permitted source record and a server adapter implementing its documented capability and official mapping. Never pass credentials in browser code or allow client-selected endpoints. Keep the current OIDC scope limited to AliExpress; a new source needs an explicit server authorization path. Additional live-search adapters need their official credentials, quotas, country rules, caching rights and deep-link mechanism. Do not enable a capability merely by setting a flag.

## Verification
Regression suite includes isolated SQL reconstruction, unauthorized access, anonymous deduplication, expiry retention, exact variants, native/converted costs, progressive UI results and offline fallback. Python tests include source permission/link checks and real recorded-feed demand matching. Production database checks use real catalogue searches; write-path checks are rolled back, and do not create offers or clicks. GitHub push runs the existing real feed workflow, independent of Work.
