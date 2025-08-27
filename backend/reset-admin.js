import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new sqlite3.Database(path.join(__dirname, '..', 'data.sqlite'));

// Hash bcrypt de "1234"
const HASH_1234 = '$2b$10$UksJv3tET16Ipi7X5iV0XOcHbJ4vWf5zjdxXz2Mzt6zkXJztpbDqe';

db.serialize(() => {
  db.run('UPDATE users SET password_hash=?, is_admin=1 WHERE email=?', [HASH_1234, 'admin@test.com'], function (err) {
    if (err) { console.error('UPDATE error', err); process.exit(1); }
    if (this.changes === 0) {
      db.run('INSERT INTO users (email,password_hash,is_admin) VALUES (?,?,1)', ['admin@test.com', HASH_1234], function (e2) {
        if (e2) { console.error('INSERT error', e2); process.exit(1); }
        console.log('Admin creado: admin@test.com / 1234');
        process.exit(0);
      });
    } else {
      console.log('Admin actualizado: admin@test.com / 1234');
      process.exit(0);
    }
  });
});
