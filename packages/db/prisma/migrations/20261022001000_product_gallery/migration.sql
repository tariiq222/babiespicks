-- Additive: old readers/writers remain compatible. Roll back app without dropping gallery data.
ALTER TABLE "products" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
