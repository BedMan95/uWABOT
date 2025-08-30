const { Pool } = require('pg');

// konfigurasi koneksi
const pool = new Pool({
  user: 'postgres',        // ganti sesuai user postgres kamu
  host: 'localhost',       // host database
  database: 'postgres',  // nama database
  password: 'postgres',  // password user postgres
  port: 5432,              // default port PostgreSQL
});

// fungsi untuk test koneksi
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    return true;
  } catch (err) {
    return false;
  }
}

testConnection();

module.exports = pool;
