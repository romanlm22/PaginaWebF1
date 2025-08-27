PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  image TEXT,
  section TEXT NOT NULL CHECK (section IN ('index','catalog')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, section)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- Semillas de productos (opcional)
INSERT OR IGNORE INTO products (name, price, image, section) VALUES
 ('Gorra F1', 18.99, 'https://via.placeholder.com/300x200?text=Gorra+F1', 'index'),
 ('Remera Equipo', 24.50, 'https://via.placeholder.com/300x200?text=Remera+Equipo', 'index'),
 ('Poster Clásico', 9.90, 'https://via.placeholder.com/300x200?text=Poster+F1', 'index'),
 ('Chomba Ferrari', 13900, 'https://via.placeholder.com/300x200?text=Ferrari+Chomba', 'catalog'),
 ('Buzo Mercedes', 29940, 'https://via.placeholder.com/300x200?text=Mercedes+Buzo', 'catalog'),
 ('Remera Red Bull', 5999, 'https://via.placeholder.com/300x200?text=RedBull+Remera', 'catalog'),
 ('Lotus E20 1/43', 15000, 'https://via.placeholder.com/300x200?text=Lotus+E20', 'catalog');
