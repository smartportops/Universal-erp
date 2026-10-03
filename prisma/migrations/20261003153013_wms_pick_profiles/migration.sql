-- CreateTable
CREATE TABLE "PickProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "customerType" TEXT NOT NULL DEFAULT '',
    "maxOrders" INTEGER NOT NULL DEFAULT 20,
    "maxLines" INTEGER NOT NULL DEFAULT 0,
    "carrier" TEXT NOT NULL DEFAULT 'DHL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickProfile_organizationId_idx" ON "PickProfile"("organizationId");

-- AddForeignKey
ALTER TABLE "PickProfile" ADD CONSTRAINT "PickProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
