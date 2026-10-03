-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "correctsId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'invoice';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "accountHolder" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "aiKeyCipher" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "aiProvider" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bic" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "iban" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "taxNumber" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "onHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'normal';

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "netCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quote_organizationId_idx" ON "Quote"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_organizationId_number_key" ON "Quote"("organizationId", "number");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "QuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_kind_idx" ON "Invoice"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "Invoice_correctsId_idx" ON "Invoice"("correctsId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Number ranges for the new commercial documents, one set per company.
INSERT INTO "NumberSequence" ("id", "organizationId", "key", "prefix", "nextNumber", "padding")
SELECT
  md5(o."id" || ':' || s.key),
  o."id",
  s.key,
  s.prefix,
  1,
  s.padding
FROM "Organization" o
CROSS JOIN (VALUES
  ('invoice_cancellation', 'ST-', 5),
  ('credit', 'RK-', 5),
  ('credit_cancellation', 'SK-', 5),
  ('quote', 'QT-', 5)
) AS s(key, prefix, padding)
WHERE NOT EXISTS (
  SELECT 1 FROM "NumberSequence" n
  WHERE n."organizationId" = o."id" AND n."key" = s.key
);
