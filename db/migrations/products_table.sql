-- Products/Inventory table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(20) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'In Stock',
  quantity INTEGER NOT NULL DEFAULT 0,
  store_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add index for faster searches
CREATE INDEX IF NOT EXISTS idx_products_product_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);

-- Insert some sample data
INSERT INTO products (product_id, category, brand, product_name, status, quantity, store_price) VALUES
('GPU001', 'Video Card', 'NVIDIA', 'RTX 4090', 'In Stock', 5, 89999.99),
('GPU002', 'Video Card', 'AMD', 'RX 7900 XTX', 'In Stock', 3, 69999.99),
('CPU001', 'Processor', 'Intel', 'Core i9-14900K', 'In Stock', 10, 39999.99),
('CPU002', 'Processor', 'AMD', 'Ryzen 9 7950X', 'In Stock', 8, 37999.99),
('RAM001', 'Memory', 'G.Skill', 'Trident Z5 RGB 32GB', 'In Stock', 15, 12999.99),
('SSD001', 'Storage', 'Samsung', '990 PRO 2TB', 'In Stock', 20, 14999.99);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();