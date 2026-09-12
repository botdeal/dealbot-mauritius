import { withSupabase } from "npm:@supabase/server";

type TableCheck = {
  count: number;
  error: string | null;
};

function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  fetch: withSupabase(
    { auth: "secret" },

    async (req, ctx) => {
      const startedAt = new Date().toISOString();

      if (req.method !== "POST") {
        return json(
          {
            ok: false,
            service: "dealbot-sync",
            error: "Method not allowed",
          },
          405,
        );
      }

      try {
        /*
         * DEALBOT AUTOPILOT
         *
         * Production pipeline:
         *
         * Authorized affiliate sources
         *        ↓
         * ingestion
         *        ↓
         * validation
         *        ↓
         * normalization
         *        ↓
         * deduplication
         *        ↓
         * DealBot scoring
         *        ↓
         * merchants / categories / deals
         *        ↓
         * price history
         *        ↓
         * stale-deal expiration
         *        ↓
         * frontend publication
         *
         * ctx.supabaseAdmin is server-side only
         * and bypasses RLS.
         */

        const supabaseAdmin = ctx.supabaseAdmin;

        const [
          dealsResult,
          merchantsResult,
          categoriesResult,
        ] = await Promise.all([
          supabaseAdmin
            .from("deals")
            .select("id", {
              count: "exact",
              head: true,
            }),

          supabaseAdmin
            .from("merchants")
            .select("id", {
              count: "exact",
              head: true,
            }),

          supabaseAdmin
            .from("categories")
            .select("id", {
              count: "exact",
              head: true,
            }),
        ]);

        const database: Record<string, TableCheck> = {
          deals: {
            count: dealsResult.count ?? 0,
            error: dealsResult.error?.message ?? null,
          },

          merchants: {
            count: merchantsResult.count ?? 0,
            error: merchantsResult.error?.message ?? null,
          },

          categories: {
            count: categoriesResult.count ?? 0,
            error: categoriesResult.error?.message ?? null,
          },
        };

        const databaseErrors = Object.entries(database)
          .filter(([, result]) => result.error !== null)
          .map(([table, result]) => ({
            table,
            error: result.error,
          }));

        if (databaseErrors.length > 0) {
          console.error(
            "DealBot database verification failed",
            databaseErrors,
          );

          return json(
            {
              ok: false,
              service: "dealbot-sync",
              mode: "production",
              status: "database_error",
              started_at: startedAt,
              finished_at: new Date().toISOString(),
              database,
              errors: databaseErrors,
            },
            500,
          );
        }

        /*
         * Source connectors are intentionally isolated from
         * the core engine.
         *
         * Admitad and future authorized affiliate feeds/APIs
         * will plug into this stage without changing the
         * database/authentication foundation.
         */

        const syncReport = {
          sources_processed: 0,
          received: 0,
          validated: 0,
          created: 0,
          updated: 0,
          rejected: 0,
          expired: 0,
          price_changes: 0,
        };

        const finishedAt = new Date().toISOString();

        console.info("DealBot sync completed", {
          startedAt,
          finishedAt,
          ...syncReport,
        });

        return json({
          ok: true,
          service: "dealbot-sync",
          mode: "production",
          status: "ready",
          started_at: startedAt,
          finished_at: finishedAt,

          database: {
            deals: database.deals.count,
            merchants: database.merchants.count,
            categories: database.categories.count,
          },

          sync: syncReport,

          next_stage:
            "affiliate_source_connection",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        console.error(
          "DealBot sync execution failed",
          message,
        );

        return json(
          {
            ok: false,
            service: "dealbot-sync",
            mode: "production",
            status: "error",
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            error: message,
          },
          500,
        );
      }
    },
  ),
};
