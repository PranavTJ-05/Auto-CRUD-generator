import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "manager",
  "user",
  "guest",
]);

export const propertyStatusEnum = pgEnum("property_status", [
  "available",
  "occupied",
  "maintenance",
  "archived",
]);

export const leaseStatusEnum = pgEnum("lease_status", [
  "active",
  "expired",
  "terminated",
  "pending",
]);

// ── Organizations ────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  website: varchar("website", { length: 500 }),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  properties: many(properties),
}));

// ── Users ────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  role: userRoleEnum("role").notNull().default("user"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  properties: many(properties),
  leases: many(leases),
}));

// ── Properties ───────────────────────────────────────────────

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  address: varchar("address", { length: 500 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }),
  zipCode: varchar("zip_code", { length: 20 }),
  country: varchar("country", { length: 100 }).notNull().default("US"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  status: propertyStatusEnum("status").notNull().default("available"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  areaSqft: numeric("area_sqft"),
  monthlyRent: numeric("monthly_rent").notNull(),
  depositAmount: numeric("deposit_amount"),
  amenities: jsonb("amenities"),
  images: jsonb("images"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.organizationId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [properties.ownerId],
    references: [users.id],
  }),
  units: many(units),
  leases: many(leases),
}));

// ── Units ────────────────────────────────────────────────────

export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => properties.id),
  unitNumber: varchar("unit_number", { length: 50 }).notNull(),
  floor: integer("floor"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  areaSqft: numeric("area_sqft"),
  monthlyRent: numeric("monthly_rent").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const unitsRelations = relations(units, ({ one }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
}));

// ── Leases ───────────────────────────────────────────────────

export const leases = pgTable("leases", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => properties.id),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => users.id),
  unitId: integer("unit_id").references(() => units.id),
  status: leaseStatusEnum("status").notNull().default("pending"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  monthlyRent: numeric("monthly_rent").notNull(),
  depositAmount: numeric("deposit_amount"),
  terms: jsonb("terms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leasesRelations = relations(leases, ({ one }) => ({
  property: one(properties, {
    fields: [leases.propertyId],
    references: [properties.id],
  }),
  tenant: one(users, {
    fields: [leases.tenantId],
    references: [users.id],
  }),
  unit: one(units, {
    fields: [leases.unitId],
    references: [units.id],
  }),
}));

// ── Payments ─────────────────────────────────────────────────

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  leaseId: integer("lease_id")
    .notNull()
    .references(() => leases.id),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => users.id),
  amount: numeric("amount").notNull(),
  paidAt: timestamp("paid_at"),
  dueDate: timestamp("due_date").notNull(),
  method: varchar("method", { length: 50 }),
  transactionRef: varchar("transaction_ref", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  lease: one(leases, {
    fields: [payments.leaseId],
    references: [leases.id],
  }),
  tenant: one(users, {
    fields: [payments.tenantId],
    references: [users.id],
  }),
}));
