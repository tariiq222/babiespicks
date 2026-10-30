-- Additive: old readers/writers remain compatible. Roll back app without dropping category labels.
ALTER TABLE "categories" ADD COLUMN "nameEn" TEXT;
