-- New AI task kind for RFQ intake (docs/ai-roadmap.md 1.1).
-- No data written here: Postgres cannot USE a new enum value in the
-- transaction that adds it.
ALTER TYPE "AiTaskKind" ADD VALUE 'RFQ_EXTRACTION';
