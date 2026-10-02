-- AlterTable
ALTER TABLE `wedding_hall_disclosures` MODIFY `venueName` TEXT NOT NULL,
    MODIFY `address` TEXT NULL,
    MODIFY `fileName` TEXT NULL;

-- AlterTable
ALTER TABLE `wedding_hall_price_items` MODIFY `hallName` TEXT NOT NULL,
    MODIFY `itemGroup` TEXT NULL,
    MODIFY `itemName` TEXT NOT NULL,
    MODIFY `rawValue` TEXT NULL;

-- AlterTable
ALTER TABLE `wedding_hall_refund_policies` MODIFY `periodText` TEXT NOT NULL,
    MODIFY `ruleText` TEXT NOT NULL;
