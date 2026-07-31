-- Four new discovery agents. Postgres allows several ADD VALUE in one
-- migration (PG12+), but a new enum value cannot be USED in the same
-- transaction that adds it — this migration therefore writes no data.
ALTER TYPE "ProspectSource" ADD VALUE 'OSM';
ALTER TYPE "ProspectSource" ADD VALUE 'FDA_DEVICE';
ALTER TYPE "ProspectSource" ADD VALUE 'EDGAR';
ALTER TYPE "ProspectSource" ADD VALUE 'TRADEMARK';
