-- War: historial de las instrucciones del agente. Cada vez que cambian se
-- guarda la versión anterior (se conservan las últimas 20). Aditivo.
CREATE TABLE IF NOT EXISTS "agent_instrucciones_version" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "instructions" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "agent_instrucciones_version_org_idx"
  ON "agent_instrucciones_version" ("organization_id", "created_at");
