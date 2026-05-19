-- Sub-frente 3.0b — Migration 3: tabela hub_aliases + RLS + seed
CREATE TABLE IF NOT EXISTS hub_aliases (
  name_alias text PRIMARY KEY,
  name_canonical text NOT NULL REFERENCES hubs(name) ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE hub_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read aliases" ON hub_aliases;
CREATE POLICY "Authenticated can read aliases"
  ON hub_aliases FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Stock admins manage aliases" ON hub_aliases;
CREATE POLICY "Stock admins manage aliases"
  ON hub_aliases FOR ALL
  TO authenticated
  USING (is_stock_admin())
  WITH CHECK (is_stock_admin());

INSERT INTO hub_aliases (name_alias, name_canonical) VALUES
  ('G+SHIP CWB', 'HUB CWB'),
  ('G+SHIP RJ', 'HUB RJ'),
  ('G+SHIP VG', 'HUB VG')
ON CONFLICT (name_alias) DO NOTHING;

NOTIFY pgrst, 'reload schema';
