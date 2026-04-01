ALTER TABLE "customers" RENAME COLUMN "mobile_number" TO "phone_number";
ALTER TABLE "customers" DROP COLUMN "location";

ALTER TABLE "suppliers" RENAME COLUMN "mobile_number" TO "phone_number";
ALTER TABLE "suppliers" DROP COLUMN "location";
