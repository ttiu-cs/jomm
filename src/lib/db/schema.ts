export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS merchants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id), name TEXT NOT NULL,
  timezone TEXT NOT NULL, open_hour INTEGER NOT NULL, close_hour INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), sku TEXT NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL, currency TEXT NOT NULL, base_price_cents INTEGER NOT NULL, unit TEXT NOT NULL,
  demand_model_json TEXT NOT NULL, UNIQUE(store_id, sku)
);
CREATE TABLE IF NOT EXISTS inventory_batches (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), sim_day INTEGER NOT NULL,
  qty_produced INTEGER NOT NULL, created_at TEXT NOT NULL, sell_by_hour INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSED')), cost_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_snapshots (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), created_at TEXT NOT NULL,
  costs_json TEXT NOT NULL, actor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pricing_policies (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), version INTEGER NOT NULL,
  policy_json TEXT NOT NULL, active INTEGER NOT NULL, created_at TEXT NOT NULL, actor TEXT NOT NULL,
  UNIQUE(product_id, version)
);
CREATE TABLE IF NOT EXISTS sim_state (
  product_id TEXT PRIMARY KEY REFERENCES products(id), seed INTEGER NOT NULL, sim_day INTEGER NOT NULL,
  current_hour INTEGER NOT NULL, weather TEXT NOT NULL, event TEXT NOT NULL, demand_multiplier REAL NOT NULL,
  updated_at TEXT NOT NULL
);
-- Conversion denominator: views/quotes/abandons, both simulated and real storefront.
CREATE TABLE IF NOT EXISTS exposure_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, sim_day INTEGER NOT NULL, sim_hour INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('SIMULATED','STOREFRONT','SYNTHETIC_HISTORY')),
  kind TEXT NOT NULL CHECK (kind IN ('VIEW','QUOTE','ABANDON','PURCHASE')), count INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exposure ON exposure_events(product_id, sim_day, sim_hour);
-- Forecast recorded at decision time vs. eventual outcome for each store hour.
CREATE TABLE IF NOT EXISTS hour_outcomes (
  product_id TEXT NOT NULL, sim_day INTEGER NOT NULL, sim_hour INTEGER NOT NULL, price_cents INTEGER NOT NULL,
  predicted_visits REAL NOT NULL, predicted_sales REAL NOT NULL, simulated_visits INTEGER NOT NULL,
  simulated_sales INTEGER NOT NULL, real_sales INTEGER NOT NULL, stockout INTEGER NOT NULL,
  PRIMARY KEY (product_id, sim_day, sim_hour)
);
CREATE TABLE IF NOT EXISTS price_decisions (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, sim_day INTEGER NOT NULL, sim_hour INTEGER NOT NULL,
  created_at TEXT NOT NULL, actor TEXT NOT NULL, model_version TEXT NOT NULL, policy_version INTEGER NOT NULL,
  current_price_cents INTEGER NOT NULL, recommended_price_cents INTEGER NOT NULL, action TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL, explanation_json TEXT NOT NULL, result_json TEXT NOT NULL, inputs_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROPOSED','PUBLISHED','HELD','REJECTED','SUPERSEDED')),
  published_price_id TEXT
);
CREATE TABLE IF NOT EXISTS published_prices (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, price_cents INTEGER NOT NULL, currency TEXT NOT NULL,
  version INTEGER NOT NULL, effective_at TEXT NOT NULL, sim_day INTEGER NOT NULL, sim_hour INTEGER NOT NULL,
  decision_id TEXT, actor TEXT NOT NULL, UNIQUE(product_id, version)
);
CREATE TABLE IF NOT EXISTS price_quotes (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, price_version INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0), total_cents INTEGER NOT NULL, currency TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CONSUMED','EXPIRED','CANCELLED')),
  sim_day INTEGER NOT NULL, sim_hour INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL UNIQUE REFERENCES price_quotes(id), product_id TEXT NOT NULL,
  qty INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, currency TEXT NOT NULL,
  payment_source TEXT NOT NULL CHECK (payment_source IN ('PAYPAL_SANDBOX','MOCK_CHECKOUT')),
  status TEXT NOT NULL CHECK (status IN ('CREATED','AWAITING_APPROVAL','CAPTURING','PAID','PAYMENT_PENDING','FAILED','CANCELLED','EXPIRED')),
  failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), provider TEXT NOT NULL,
  provider_order_id TEXT UNIQUE, capture_id TEXT UNIQUE, status TEXT NOT NULL,
  amount_cents INTEGER, currency TEXT, idempotency_key TEXT NOT NULL UNIQUE, verified INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, batch_id TEXT NOT NULL REFERENCES inventory_batches(id),
  type TEXT NOT NULL CHECK (type IN ('PRODUCTION','SALE','WASTE','ADJUSTMENT')), qty_delta INTEGER NOT NULL,
  unit_price_cents INTEGER,
  source TEXT NOT NULL CHECK (source IN ('SIMULATED','PAYPAL_SANDBOX','MOCK_CHECKOUT','MERCHANT','SYSTEM')),
  order_id TEXT UNIQUE REFERENCES orders(id), sim_day INTEGER NOT NULL, sim_hour INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL, received_at TEXT NOT NULL, verified INTEGER NOT NULL,
  processed INTEGER NOT NULL, note TEXT
);
-- Buyer-agent negotiations (one unit). walk_away_cents is seller-private.
CREATE TABLE IF NOT EXISTS negotiations (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, sim_day INTEGER NOT NULL, sim_hour INTEGER NOT NULL,
  buyer_label TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('OPEN','AGREED','CLOSED','EXPIRED')),
  buyer_offers INTEGER NOT NULL DEFAULT 0, last_counter_cents INTEGER, final_counter INTEGER NOT NULL DEFAULT 0,
  agreed_price_cents INTEGER, quote_id TEXT, published_cents INTEGER NOT NULL, walk_away_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS negotiation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, negotiation_id TEXT NOT NULL REFERENCES negotiations(id),
  role TEXT NOT NULL CHECK (role IN ('buyer','seller')),
  kind TEXT NOT NULL CHECK (kind IN ('OFFER','COUNTER','FINAL','ACCEPT','REJECT','DECLINE')),
  price_cents INTEGER, text TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id TEXT, details_json TEXT NOT NULL
);
`;
