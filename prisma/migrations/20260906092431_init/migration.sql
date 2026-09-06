-- ============================================================================
-- Estensioni richieste PRIMA dei vincoli di esclusione.
-- btree_gist e' vincolante (D-06): senza, il divieto di sovrapposizione
-- vivrebbe solo nel codice applicativo e due richieste concorrenti lo
-- attraverserebbero entrambe.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('PLANNING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('PHONE', 'WHATSAPP', 'RECEPTION', 'WEB', 'OTHER');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeclaredBy" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('EARNED', 'USED', 'REVERSED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CreditUnit" AS ENUM ('EUR', 'POINTS');

-- CreateEnum
CREATE TYPE "MapFeatureKind" AS ENUM ('WALKWAY', 'CORRIDOR', 'ENTRANCE', 'SERVICE', 'BLOCKED_AREA');

-- CreateEnum
CREATE TYPE "SeaProximity" AS ENUM ('NEAR', 'FAR', 'INDIFFERENT');

-- CreateEnum
CREATE TYPE "UmbrellaSide" AS ENUM ('LEFT', 'RIGHT', 'CENTER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('DAILY', 'SEASONAL');

-- CreateTable
CREATE TABLE "beach_club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beach_club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beach_map" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "season_id" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Mappa principale',
    "width" INTEGER NOT NULL DEFAULT 20,
    "height" INTEGER NOT NULL DEFAULT 12,

    CONSTRAINT "beach_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "beach_map_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#888888',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_feature" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "beach_map_id" TEXT NOT NULL,
    "kind" "MapFeatureKind" NOT NULL,
    "label" TEXT,
    "pos_x" INTEGER NOT NULL,
    "pos_y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1,
    "height" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "map_feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umbrella" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "beach_map_id" TEXT NOT NULL,
    "zone_id" TEXT,
    "visible_number" TEXT NOT NULL,
    "row_label" TEXT NOT NULL,
    "pos_x" INTEGER NOT NULL,
    "pos_y" INTEGER NOT NULL,
    "category" TEXT,
    "base_price_cents" INTEGER,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "blocked_until" DATE,
    "notes" TEXT,

    CONSTRAINT "umbrella_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_raw" TEXT,
    "phone_normalized" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "is_seasonal" BOOLEAN NOT NULL DEFAULT false,
    "anonymized_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_preference" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "preferred_row" TEXT,
    "preferred_zone_id" TEXT,
    "preferred_umbrella_id" TEXT,
    "near_customer_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sea_proximity" "SeaProximity",
    "side" "UmbrellaSide",
    "free_notes" TEXT,

    CONSTRAINT "customer_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_contract" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "umbrella_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "access_token_hash" TEXT NOT NULL,
    "token_revoked_at" TIMESTAMP(3),
    "credit_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasonal_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_absence" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "seasonal_contract_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declared_by" "DeclaredBy" NOT NULL,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelled_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "seasonal_absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "people_count" INTEGER NOT NULL DEFAULT 2,
    "source" "ReservationSource" NOT NULL DEFAULT 'RECEPTION',
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_item" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "umbrella_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "price_cents" INTEGER NOT NULL,
    "price_breakdown" JSONB NOT NULL DEFAULT '[]',
    "is_temporary_slot" BOOLEAN NOT NULL DEFAULT false,
    "seasonal_absence_id" TEXT,

    CONSTRAINT "reservation_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rule" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "zone_id" TEXT,
    "row_label" TEXT,
    "category" TEXT,
    "date_from" DATE,
    "date_to" DATE,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "min_days" INTEGER,
    "max_days" INTEGER,
    "customer_type" "CustomerType",
    "price_cents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "price_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected_by_id" TEXT,
    "provider_ref" TEXT,
    "notes" TEXT,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transaction" (
    "id" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "seasonal_contract_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "unit" "CreditUnit" NOT NULL DEFAULT 'EUR',
    "kind" "CreditKind" NOT NULL,
    "absence_date" DATE,
    "source_reservation_id" TEXT,
    "seasonal_absence_id" TEXT,
    "description" TEXT NOT NULL,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "key" TEXT NOT NULL,
    "beach_club_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "beach_club_slug_key" ON "beach_club"("slug");

-- CreateIndex
CREATE INDEX "season_beach_club_id_status_idx" ON "season"("beach_club_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "season_beach_club_id_year_key" ON "season"("beach_club_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "season_beach_club_id_id_key" ON "season"("beach_club_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "user_beach_club_id_email_key" ON "user"("beach_club_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "user_beach_club_id_id_key" ON "user"("beach_club_id", "id");

-- CreateIndex
CREATE INDEX "beach_map_beach_club_id_idx" ON "beach_map"("beach_club_id");

-- CreateIndex
CREATE UNIQUE INDEX "beach_map_beach_club_id_id_key" ON "beach_map"("beach_club_id", "id");

-- CreateIndex
CREATE INDEX "zone_beach_club_id_beach_map_id_idx" ON "zone"("beach_club_id", "beach_map_id");

-- CreateIndex
CREATE UNIQUE INDEX "zone_beach_club_id_id_key" ON "zone"("beach_club_id", "id");

-- CreateIndex
CREATE INDEX "map_feature_beach_club_id_beach_map_id_idx" ON "map_feature"("beach_club_id", "beach_map_id");

-- CreateIndex
CREATE INDEX "umbrella_beach_club_id_beach_map_id_idx" ON "umbrella"("beach_club_id", "beach_map_id");

-- CreateIndex
CREATE INDEX "umbrella_beach_club_id_row_label_idx" ON "umbrella"("beach_club_id", "row_label");

-- CreateIndex
CREATE UNIQUE INDEX "umbrella_beach_club_id_visible_number_key" ON "umbrella"("beach_club_id", "visible_number");

-- CreateIndex
CREATE UNIQUE INDEX "umbrella_beach_club_id_id_key" ON "umbrella"("beach_club_id", "id");

-- CreateIndex
CREATE INDEX "customer_beach_club_id_phone_normalized_idx" ON "customer"("beach_club_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "customer_beach_club_id_last_name_idx" ON "customer"("beach_club_id", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_beach_club_id_id_key" ON "customer"("beach_club_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_preference_customer_id_key" ON "customer_preference"("customer_id");

-- CreateIndex
CREATE INDEX "customer_preference_beach_club_id_idx" ON "customer_preference"("beach_club_id");

-- CreateIndex
CREATE INDEX "seasonal_contract_beach_club_id_season_id_umbrella_id_idx" ON "seasonal_contract"("beach_club_id", "season_id", "umbrella_id");

-- CreateIndex
CREATE INDEX "seasonal_contract_access_token_hash_idx" ON "seasonal_contract"("access_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "seasonal_contract_beach_club_id_id_key" ON "seasonal_contract"("beach_club_id", "id");

-- CreateIndex
CREATE INDEX "seasonal_absence_beach_club_id_start_date_end_date_idx" ON "seasonal_absence"("beach_club_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "seasonal_absence_beach_club_id_id_key" ON "seasonal_absence"("beach_club_id", "id");

-- CreateIndex
CREATE INDEX "reservation_beach_club_id_createdAt_idx" ON "reservation"("beach_club_id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_beach_club_id_id_key" ON "reservation"("beach_club_id", "id");

-- CreateIndex
CREATE INDEX "reservation_item_beach_club_id_start_date_end_date_idx" ON "reservation_item"("beach_club_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "reservation_item_umbrella_id_start_date_end_date_idx" ON "reservation_item"("umbrella_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "price_rule_beach_club_id_season_id_priority_idx" ON "price_rule"("beach_club_id", "season_id", "priority");

-- CreateIndex
CREATE INDEX "payment_beach_club_id_paid_at_idx" ON "payment"("beach_club_id", "paid_at");

-- CreateIndex
CREATE INDEX "credit_transaction_beach_club_id_seasonal_contract_id_creat_idx" ON "credit_transaction"("beach_club_id", "seasonal_contract_id", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_beach_club_id_entity_type_entity_id_createdAt_idx" ON "audit_log"("beach_club_id", "entity_type", "entity_id", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_key_createdAt_idx" ON "idempotency_key"("createdAt");

-- AddForeignKey
ALTER TABLE "season" ADD CONSTRAINT "season_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beach_map" ADD CONSTRAINT "beach_map_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beach_map" ADD CONSTRAINT "beach_map_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone" ADD CONSTRAINT "zone_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone" ADD CONSTRAINT "zone_beach_map_id_fkey" FOREIGN KEY ("beach_map_id") REFERENCES "beach_map"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_feature" ADD CONSTRAINT "map_feature_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_feature" ADD CONSTRAINT "map_feature_beach_map_id_fkey" FOREIGN KEY ("beach_map_id") REFERENCES "beach_map"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "umbrella" ADD CONSTRAINT "umbrella_beach_club_id_beach_map_id_fkey" FOREIGN KEY ("beach_club_id", "beach_map_id") REFERENCES "beach_map"("beach_club_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "umbrella" ADD CONSTRAINT "umbrella_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_preference" ADD CONSTRAINT "customer_preference_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_preference" ADD CONSTRAINT "customer_preference_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_preference" ADD CONSTRAINT "customer_preference_preferred_zone_id_fkey" FOREIGN KEY ("preferred_zone_id") REFERENCES "zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_preference" ADD CONSTRAINT "customer_preference_preferred_umbrella_id_fkey" FOREIGN KEY ("preferred_umbrella_id") REFERENCES "umbrella"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_contract" ADD CONSTRAINT "seasonal_contract_beach_club_id_season_id_fkey" FOREIGN KEY ("beach_club_id", "season_id") REFERENCES "season"("beach_club_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_contract" ADD CONSTRAINT "seasonal_contract_beach_club_id_customer_id_fkey" FOREIGN KEY ("beach_club_id", "customer_id") REFERENCES "customer"("beach_club_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_contract" ADD CONSTRAINT "seasonal_contract_beach_club_id_umbrella_id_fkey" FOREIGN KEY ("beach_club_id", "umbrella_id") REFERENCES "umbrella"("beach_club_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_absence" ADD CONSTRAINT "seasonal_absence_beach_club_id_seasonal_contract_id_fkey" FOREIGN KEY ("beach_club_id", "seasonal_contract_id") REFERENCES "seasonal_contract"("beach_club_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_beach_club_id_season_id_fkey" FOREIGN KEY ("beach_club_id", "season_id") REFERENCES "season"("beach_club_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_beach_club_id_customer_id_fkey" FOREIGN KEY ("beach_club_id", "customer_id") REFERENCES "customer"("beach_club_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item" ADD CONSTRAINT "reservation_item_beach_club_id_reservation_id_fkey" FOREIGN KEY ("beach_club_id", "reservation_id") REFERENCES "reservation"("beach_club_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item" ADD CONSTRAINT "reservation_item_beach_club_id_umbrella_id_fkey" FOREIGN KEY ("beach_club_id", "umbrella_id") REFERENCES "umbrella"("beach_club_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item" ADD CONSTRAINT "reservation_item_seasonal_absence_id_fkey" FOREIGN KEY ("seasonal_absence_id") REFERENCES "seasonal_absence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rule" ADD CONSTRAINT "price_rule_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rule" ADD CONSTRAINT "price_rule_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rule" ADD CONSTRAINT "price_rule_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_seasonal_contract_id_fkey" FOREIGN KEY ("seasonal_contract_id") REFERENCES "seasonal_contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_source_reservation_id_fkey" FOREIGN KEY ("source_reservation_id") REFERENCES "reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_seasonal_absence_id_fkey" FOREIGN KEY ("seasonal_absence_id") REFERENCES "seasonal_absence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_beach_club_id_fkey" FOREIGN KEY ("beach_club_id") REFERENCES "beach_club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- VINCOLI CRITICI — docs/03 §5
-- Non sono ottimizzazioni: sono le garanzie che il codice applicativo non puo'
-- dare sotto concorrenza. Le chiavi esterne composte di D-14 stanno invece
-- nello schema Prisma: aggiunte qui a mano, ogni `migrate dev` le rimuoverebbe.
-- ============================================================================

-- RD-02 · nessuna sovrapposizione di prenotazioni sullo stesso ombrellone.
-- '[]' rende l'intervallo inclusivo: il 10-12 occupa anche il 12.
-- La clausola WHERE lascia annullate e no-show nello storico senza bloccare.
ALTER TABLE "reservation_item"
  ADD CONSTRAINT "reservation_item_no_overlap"
  EXCLUDE USING gist (
    "umbrella_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" IN ('CONFIRMED', 'CHECKED_IN'));

-- Senza questo, il doppio tap del cliente crea due assenze e il credito raddoppia.
ALTER TABLE "seasonal_absence"
  ADD CONSTRAINT "seasonal_absence_no_overlap"
  EXCLUDE USING gist (
    "seasonal_contract_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" = 'ACTIVE');

ALTER TABLE "seasonal_contract"
  ADD CONSTRAINT "seasonal_contract_no_overlap"
  EXCLUDE USING gist (
    "umbrella_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" = 'ACTIVE');

-- Coerenza di intervalli e importi.
ALTER TABLE "reservation_item"  ADD CONSTRAINT "ri_dates_valid" CHECK ("start_date" <= "end_date");
ALTER TABLE "seasonal_absence"  ADD CONSTRAINT "sa_dates_valid" CHECK ("start_date" <= "end_date");
ALTER TABLE "seasonal_contract" ADD CONSTRAINT "sc_dates_valid" CHECK ("start_date" <= "end_date");
ALTER TABLE "season"            ADD CONSTRAINT "se_dates_valid" CHECK ("start_date" <= "end_date");
ALTER TABLE "reservation_item"  ADD CONSTRAINT "ri_price_non_negative" CHECK ("price_cents" >= 0);
ALTER TABLE "umbrella"          ADD CONSTRAINT "u_capacity_positive"   CHECK ("capacity" > 0);

-- Una sola stagione ACTIVE per stabilimento.
CREATE UNIQUE INDEX "season_one_active_per_club"
  ON "season" ("beach_club_id") WHERE ("status" = 'ACTIVE');

-- Telefono unico per stabilimento, ignorando i clienti anonimizzati (GDPR).
CREATE UNIQUE INDEX "customer_phone_unique"
  ON "customer" ("beach_club_id", "phone_normalized")
  WHERE "phone_normalized" IS NOT NULL AND "anonymized_at" IS NULL;

-- Ricerca cliente mentre si digita (scenario E).
CREATE INDEX "customer_name_trgm"
  ON "customer" USING gin (("first_name" || ' ' || "last_name") gin_trgm_ops);

-- A supporto del vincolo di sovrapposizione e della mappa giornaliera.
CREATE INDEX "ri_lookup"
  ON "reservation_item" USING gist ("umbrella_id", daterange("start_date", "end_date", '[]'))
  WHERE "status" IN ('CONFIRMED', 'CHECKED_IN');

CREATE INDEX "sa_lookup"
  ON "seasonal_absence" ("beach_club_id", "start_date", "end_date") WHERE "status" = 'ACTIVE';

CREATE INDEX "sc_lookup"
  ON "seasonal_contract" ("beach_club_id", "season_id", "umbrella_id") WHERE "status" = 'ACTIVE';

-- ============================================================================
-- L'audit log e' append-only. Non per convenzione: per costruzione.
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'audit_log e'' append-only: % non consentito', TG_OP;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- ============================================================================
-- Lo stato dell'item segue quello della testata. Mantenuto dal database, non
-- dal codice: il vincolo EXCLUDE filtra su reservation_item.status e un
-- disallineamento produrrebbe una doppia vendita.
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_reservation_item_status() RETURNS trigger AS $fn$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    UPDATE "reservation_item" SET "status" = NEW."status" WHERE "reservation_id" = NEW."id";
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER reservation_status_sync AFTER UPDATE ON "reservation"
  FOR EACH ROW EXECUTE FUNCTION sync_reservation_item_status();
