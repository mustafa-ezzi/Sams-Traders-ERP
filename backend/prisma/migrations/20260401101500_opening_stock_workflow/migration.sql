CREATE TABLE "opening_stocks" (
    "id" UUID NOT NULL,
    "tenant_id" "TenantId" NOT NULL,
    "date" DATE NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "purchase_quantity" DECIMAL(18,2) NOT NULL,
    "selling_quantity" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "opening_stocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "opening_stocks_tenant_id_date_warehouse_id_raw_material_id_key"
ON "opening_stocks"("tenant_id", "date", "warehouse_id", "raw_material_id");

CREATE INDEX "opening_stocks_tenant_id_warehouse_id_idx"
ON "opening_stocks"("tenant_id", "warehouse_id");

CREATE INDEX "opening_stocks_tenant_id_raw_material_id_idx"
ON "opening_stocks"("tenant_id", "raw_material_id");

ALTER TABLE "opening_stocks"
ADD CONSTRAINT "opening_stocks_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opening_stocks"
ADD CONSTRAINT "opening_stocks_raw_material_id_fkey"
FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
