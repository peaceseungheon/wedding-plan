-- CreateTable
CREATE TABLE `wedding_hall_disclosures` (
    `id` VARCHAR(191) NOT NULL,
    `boardSeq` INTEGER NOT NULL,
    `region` VARCHAR(191) NOT NULL,
    `venueName` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `fileRgtnSeq` INTEGER NULL,
    `fileName` VARCHAR(191) NULL,
    `disclosedAt` DATETIME(3) NULL,
    `scrapedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `wedding_hall_disclosures_boardSeq_key`(`boardSeq`),
    INDEX `wedding_hall_disclosures_region_idx`(`region`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wedding_hall_price_items` (
    `id` VARCHAR(191) NOT NULL,
    `disclosureId` VARCHAR(191) NOT NULL,
    `hallName` VARCHAR(191) NOT NULL,
    `itemGroup` VARCHAR(191) NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `rawValue` VARCHAR(191) NULL,
    `priceMin` INTEGER NULL,
    `priceMax` INTEGER NULL,
    `sortOrder` INTEGER NOT NULL,

    INDEX `wedding_hall_price_items_disclosureId_idx`(`disclosureId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wedding_hall_refund_policies` (
    `id` VARCHAR(191) NOT NULL,
    `disclosureId` VARCHAR(191) NOT NULL,
    `periodText` VARCHAR(191) NOT NULL,
    `ruleText` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,

    INDEX `wedding_hall_refund_policies_disclosureId_idx`(`disclosureId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wedding_hall_price_items` ADD CONSTRAINT `wedding_hall_price_items_disclosureId_fkey` FOREIGN KEY (`disclosureId`) REFERENCES `wedding_hall_disclosures`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wedding_hall_refund_policies` ADD CONSTRAINT `wedding_hall_refund_policies_disclosureId_fkey` FOREIGN KEY (`disclosureId`) REFERENCES `wedding_hall_disclosures`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
