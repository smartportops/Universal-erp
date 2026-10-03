-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "counterparty" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "netCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "netAccountId" TEXT NOT NULL,
    "taxAccountId" TEXT,
    "contraAccountId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL DEFAULT '',
    "filename" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Voucher_organizationId_issuedAt_idx" ON "Voucher"("organizationId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_organizationId_number_key" ON "Voucher"("organizationId", "number");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_netAccountId_fkey" FOREIGN KEY ("netAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_taxAccountId_fkey" FOREIGN KEY ("taxAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_contraAccountId_fkey" FOREIGN KEY ("contraAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extra accounts for companies created before vouchers existed.
INSERT INTO "Account" ("id", "organizationId", "code", "name", "type")
SELECT md5(o."id" || ':account:' || a.code), o."id", a.code, a.name, a.type
FROM "Organization" o
CROSS JOIN (VALUES
  ('0900', 'Eigenkapital', 'equity'),
  ('1570', 'Vorsteuer', 'asset'),
  ('4200', 'Erlöse ermäßigt', 'revenue'),
  ('4300', 'Steuerfreie Erlöse', 'revenue'),
  ('6000', 'Raumkosten', 'expense'),
  ('6300', 'Versicherungen', 'expense'),
  ('6800', 'Porto und Telekommunikation', 'expense'),
  ('6815', 'Bürobedarf', 'expense'),
  ('7000', 'Fremdleistungen', 'expense')
) AS a(code, name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM "Account" existing
  WHERE existing."organizationId" = o."id" AND existing."code" = a.code
);

INSERT INTO "NumberSequence" ("id", "organizationId", "key", "prefix", "nextNumber", "padding")
SELECT md5(o."id" || ':voucher'), o."id", 'voucher', 'BE-', 1, 5
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "NumberSequence" n
  WHERE n."organizationId" = o."id" AND n."key" = 'voucher'
);
