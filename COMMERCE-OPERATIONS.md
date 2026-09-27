# Production commerce — 2026-09-27

## Proven automatic collection
GitHub scheduled workflow + Supabase worker remain unchanged. Eight successful scheduled runs from September 20–27. Latest database run 53: 837 received, 15 created, 822 updated, 217 expired. Source: official Admitad AliExpress Hot Products USD 75–100 discounted partition, complete XML required, at most 100 per allowed category/1000 overall. Selection is stable and category-balanced after validation/exclusions; it is NOT a popularity/trending signal. No full-market coverage claimed.

Existing safeguards: deduplication, complete-snapshot seal, shrink guard, retries, durable run/error journals, OIDC short-lived collector authentication, DB budget guard, hourly retention and stale-offer withdrawal. These do not require ChatGPT. Monitor GitHub Actions and the existing admin import view. Failed/truncated downloads must never expire the previous catalogue.

## Country and currency
/api/market uses Vercel's country header only. No GPS or visitor IP sent to the public ExchangeRate-API provider. Manual selection persists locally and overrides detection. Rates are cached per warm function for one hour; dated rates older than three days or invalid are rejected. Provider unavailable => original prices. Approximate conversion displays alongside original currency. Alert thresholds and history charts retain their original currency. Attribution is displayed. No paid account/key.

Market restrictions filter offers only when source-backed commerce.markets exists. Missing coverage does NOT claim shipping eligibility; UI asks visitors to confirm delivery. Current AliExpress feed does not establish per-country shipping costs or coverage.

## Exact-product comparison contract
Nullable public deals.commerce metadata is protected by existing admin/service write policies. No credentials belong here. Allowed keys:
- verified: true only after source evidence validates identity.
- gtin: valid GTIN-8/12/13/14 check digit; OR brand + manufacturer part number.
- variant_complete: true only when every variant-defining attribute is known.
- variant: nonempty mapping of actual capacity, size, colour, pack quantity etc. Do not use a placeholder to qualify unknown variants.
- markets: official eligible ISO country codes; absent means unknown.
- shipping: reserved factual market-specific cost/currency metadata; currently not used to calculate totals.

The UI groups only identical references AND complete identical variants. Merchant buttons use existing tracking RPC. No fuzzy title matching. No shipping-inclusive total is inferred. Metadata must be attached through existing privileged server/admin database access when a future approved adapter supplies the evidence; the existing AliExpress collector does not generate it.

Only AliExpress currently connected; ZERO proven cross-merchant product matches. Additional approved feeds and exact reference/variant data remain necessary for actual multi-merchant comparisons. Names alone are not sufficient.

## Intelligence
Real catalogue photos, score method, actual category coverage counts (not country popularity), native-currency price history, date/value axes and keyboard-accessible timeline. Fewer than two usable observations => explicit insufficient-history state. History is fetched on demand for eight products and cached for one minute. No simulated sales, trends or charts.

## Verification
Node suite includes DOM/auth/regressions, collector engine/database reconstruction, FX, reference/variant matching, market persistence and history interaction. New metadata migration tested on isolated Postgres and applied to production without modifying any offers. Browser production checks recorded in delivery report. Real mobile viewport verification depends on available browser controls.
