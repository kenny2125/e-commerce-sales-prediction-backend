-- Users table for authentication
CREATE TABLE IF NOT EXISTS tbl_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  gender VARCHAR(10),
  address TEXT,
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Insert a default admin user (password: admin123)
INSERT INTO tbl_users (username, email, password, first_name, last_name, role)
VALUES 
  ('admin', 'admin@redpc.com', '$2a$10$mLK.rrdlvx9DCFb6Eck1t.TlltnGulepXnov3bBp5T2TloO1MYj52', 'Admin', 'User', 'admin')
ON CONFLICT (username) DO NOTHING;
