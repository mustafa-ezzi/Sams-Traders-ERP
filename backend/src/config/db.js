import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "inventory_db",
  password: "Mustafa101",
  port: 5432,
});

export default pool;