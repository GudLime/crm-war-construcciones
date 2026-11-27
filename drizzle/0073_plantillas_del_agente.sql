-- v7 — Las respuestas rápidas que el agente puede mandar armadas (toggle por
-- plantilla). Apagado por defecto: el agente solo ve las que se marcan.
ALTER TABLE "quick_reply" ADD COLUMN IF NOT EXISTS "para_agente" boolean NOT NULL DEFAULT false;
