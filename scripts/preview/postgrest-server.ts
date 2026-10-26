// Sandbox only: serve the local test database through the Supabase stand-in (PostgREST RPC + Auth) on a fixed port.
import { startSupabaseMock } from "../../tests/helpers/supabase-mock";
import { checkLocalTestPg } from "../../tests/helpers/local-db-guard";
const target = checkLocalTestPg(process.env.PA_TEST_PG ?? "/tmp:54329:postgres");
if (!target.ok) throw new Error(target.reason);
const { host, port, user } = target;
void startSupabaseMock({ host, port, user, database: process.env.PA_DB ?? "pa_it" }, { anon: "test-anon-key-000", service: "test-service-key-000" }, 54400).then((m) =>
  console.log("postgrest mock at", m.url),
);
