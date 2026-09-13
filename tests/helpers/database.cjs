const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
async function rebuild() {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb,created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  await db.exec(fs.readFileSync('supabase/bootstrap/schema.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/bootstrap/seed.sql','utf8'));
  for(const name of fs.readdirSync('supabase/migrations').filter(n=>n.includes('_dealbot_autopilot')&&!n.includes('_schedule')).sort()) await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  return db;
}
module.exports={rebuild};
