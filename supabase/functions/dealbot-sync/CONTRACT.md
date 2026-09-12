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
