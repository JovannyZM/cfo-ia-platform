ALTER TABLE "DailyCloseDelivery"
ADD COLUMN "telegramMessageId" INTEGER,
ADD COLUMN "telegramMessageDateUtc" TIMESTAMP(3),
ADD COLUMN "telegramChatId" TEXT,
ADD COLUMN "telegramResponseOk" BOOLEAN;
