# Autopilot contract v1

`dealbot-sync` accepts server-to-server POST requests authenticated by the existing Supabase secret-key middleware. Never send a server key to the browser or commit it. The runtime supplies the privileged database client. `@supabase/server` is pinned to 1.6.0. Source adapters receive data and return a canonical envelope; only the SQL engine writes catalog data. No affiliate service is connected.

## Request

```json
{
  "action": "submit",
  "adapter": "canonical-v1",
  "batch": {
    "source": "configured-source",
    "key": "stable-delivery-key",
    "revision": 1,
    "complete": false,
    "offers": [{
      "external_id": "product-1",
      "name": "Product name",
      "price": 100,
      "old_price": 125,
      "currency": "MUR",
      "availability": "in_stock",
      "original_url": "https://example.com/product-1",
      "merchant": {"external_id":"shop-1","name":"Shop","website_url":"https://example.com"},
      "category": {"external_id":"technology","name_fr":"Technologie","name_en":"Technology"}
    }]
  }
}
```

Source registration is an owner/service operation on `private.sync_sources`: no client-side registration or automatic trust. Fixtures default to unpublished drafts. A production source needs `fixture=false`, explicit `auto_publish=true` and a nonempty exact destination host allowlist. Merchant verification is never accepted from the incoming payload.

Other actions: `health` (database check), `status` with numeric `id`, `retry` with `id` (transient dead letters only). A durable accepted job may return 202 even when immediate execution loses its database connection; poll status and retry delivery with the SAME key and SAME body. 422 means a persisted validation failure. Unknown source, adapter or invalid envelope is rejected. No stack, secret or raw database error message is returned.

## Validation and limits

- Entire HTTP body <= 2 MiB; canonical batch 1..500 offers. Empty batches require `allow_empty:true` explicitly.
- Stable nonempty source-specific product/merchant/category IDs. Duplicate products or contradictory shared entity metadata inside a batch reject the entire batch.
- Prices must be JSON numbers, nonnegative, <= 999999999999.99, <= two decimals; reference price >= current price. MUR/EUR/USD/GBP only.
- Text is trimmed, bounded and rejects control characters. Currency is uppercased; availability is a known enum. Unknown fields are rejected.
- HTTPS only; no credentials, whitespace, backslashes or arbitrary ports. Dates require explicit timezone and correct ordering. Optional description/image/affiliate URL are validated.
- Adapter `fixture-v1` converts controlled sku/title/reference_price/stock/url fields. It does not fetch data. Add an Admitad adapter only after authorization, mapping its IDs, currencies, timestamps and availability into this same contract.

## Atomicity, identity and reconciliation

Each batch is committed atomically. The durable queue record is created before execution. An exception rolls back all offer/entity/history writes for that attempt while retaining an error event and retry state. Idempotency key reuse with changed content is rejected. A new key with the same offers creates no duplicates/history; source-specific unique identities include source + external ID. Source revisions are positive, monotonically increasing integers; older deliveries become superseded after a newer revision succeeds.

`complete:true` asserts that the batch is the ENTIRE source snapshot. Only after validation and successful writes does the engine expire absent offers belonging to that source. Never set complete on one page of a paginated feed. With this version, full-snapshot reconciliation is bounded to 500 offers; larger feeds must use incremental batches (`complete:false`) and explicit expires_at, or gain a durable multi-page staging adapter before full reconciliation is enabled. This limit is intentional and enforced, not silent truncation.

Imports preserve manually paused/archived offers and merchant verification; other source-owned fields are refreshed on changed content. They do not modify editorial offers without source identity. Do not manually reassign an imported offer's merchant: the source owns that relationship. A change of merchant identity for an existing external product is supported subject to the existing merchant/external-ID uniqueness constraint.

## Score v1

Score is integer sum, 0..100:

- Discount: rounded percentage off the supplied reference price, capped at 50 points; absent/zero reference gives 0.
- Stock: in_stock=20, limited=15, unknown=5, out_of_stock=0.
- Completeness: description=5 and image=5.
- Trust: merchant verified in DealBot database=20; unverified=0.

The calculation and components are saved as `score_method=automatic-v1` and `score_details`. This measures supplied data quality, not market-wide cheapest price or predicted future value. The reference price still needs source verification. Editorial offers retain their own label; an administrator cannot silently overwrite an automatic score through the existing editor.

An administrator correcting an imported price or stock value causes the database to recompute its automatic score. The previous source hash is invalidated so that the next import rechecks source-owned fields. A manually paused/archived offer remains withdrawn.

## Worker, retries and observability

Supabase pg_cron runs `private.sync_tick()` every minute, with a 45-second statement timeout, up to five jobs/tick. Transaction-scoped source locks prevent simultaneous application; a second worker receives busy and leaves the queue intact. The tick also expires stored deadlines. A terminated transaction leaves a queued/retry job rather than a permanent running lease.

SQLSTATE classes 08/40/53/57 and 55P03 retry with exponential delays 30/60/120/240 seconds, maximum five attempts. Permanent errors fail immediately. After the transient limit, an owner may explicitly request retry; this writes a manual_retry event. Superseded revisions never overwrite newer state. Queue payloads, hashes, attempt counts, results and events are private, RLS-enabled and inaccessible to browser roles. No retention purge is enabled: define archival/retention before sustained volume.

Cron processes already-submitted batches; it does NOT periodically fetch Admitad or another feed. Future collection scheduling must enqueue canonical batches and keep source credentials server-side. Cron itself requires no secret or HTTP request.

## Multipart snapshots (v6)

POST `{action:"snapshot",request:{...}}` using the same server authentication.

1. `op:"begin", source, key, revision, pages, offers`: reserve a unique manifest. `pages` and `offers` are the expected total counts, not the current page counts. Persist this manifest and the exact chunk boundaries in the collector.
2. `op:"chunk", id, page, offers:[...]`: zero-based contiguous page, at most 500 offers and 2 MiB including JSON overhead. Response gives its SHA-256 digest. Exact replay is safe; changed content for the same page is rejected.
3. `op:"seal", id, digests:[...]`: supply receipt digests in page order. Only all expected pages and offers can seal. Response includes `run_id`; sealing queues the atomic import (HTTP 202). Poll the existing `status` action with that run ID. Cron processes it.
4. `op:"status", id`: snapshot receipt progress. Uploads older than 24 hours are abandoned by hourly retention. Never treat an abandoned upload as a completed source.

Current explicitly bounded operating envelope: **10,000 offers, 1,000 chunks, 64 MiB per snapshot**. A feed exceeding this capacity is rejected, never silently truncated. Chunks solve the HTTP 2 MiB/500-offer limit; the final database transaction still applies one complete snapshot atomically. This is not an unlimited streaming database engine. The 5,000-offer workload has been exercised on the existing Supabase project.

`stream.mjs` creates byte-aware UTF-8 chunks and uploads manifests with stable receipts. It accepts already canonical offers, independent of network. A collector must finish/verify its source pagination before announcing expected totals; page-level transport success alone cannot prove the upstream feed is complete. For inputs beyond the operating envelope, explicitly partition independent source catalogs or extend/test capacity; do not falsely seal a partial source.

Duplicate offer IDs and conflicting merchant/category definitions across pages reject the entire import. No catalog data changes while uploading; successful processing updates offers and performs absence reconciliation together. A source revision reserved by a snapshot cannot also be submitted as a direct batch. Monotonic source revision watermarks survive journal cleanup.

## Retention and worker budget

- Worker every minute, one atomic run per tick, transaction timeout 45 seconds.
- Hourly bounded retention: uploading snapshots abandoned after 24h; abandoned/sealed terminal staging removed after 7 days (100 snapshots/pass).
- Successful/superseded payload bodies removed after 7 days; receipt hashes and status retained for 30 days. Failed payloads retained for the full 90-day retry window.
- Queued/retrying work older than 7 days becomes `failed / QUEUE_EXPIRED`; it requires a new revision, not blind retry.
- Successful/superseded runs and their events deleted after 30 days; failed runs after 90 days (500 runs/pass). Pending work is not silently purged.
- Autopilot Cron execution history retained 14 days, cleaned daily.
- Catalog, users, favorites, alerts and price history are never removed by this policy. Automatic imports use per-run events rather than duplicating every row operation into admin audit logs; human admin actions remain audited.

Exact replay receipts are only guaranteed inside retention windows. After receipts expire, the source revision watermark rejects old successful revisions. Keep collector checkpoints; use a new revision for new upstream data.

## Admitad connection boundary

`sources/admitad.mjs` is a connection factory with injected, authorized `pages()` and `normalize()` functions. It intentionally throws `ADMITAD_CONNECTION_REQUIRED` without them. It contains **no API endpoint, OAuth scope, query parameter or guessed response mapping**. Selecting the actual approved account feed/program determines these details. All network-specific auth, quota, pagination and mapping stay in that connection layer; the snapshot engine does not depend on Admitad.

This is prepared for connecting the real account, not a claim that a live Admitad collector already exists. No network request to Admitad has been made.
