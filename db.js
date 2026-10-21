import pg from 'pg';
const { Pool } = pg;

// Render автоматически подставит сюда секретный URL базы данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Создаем таблицы при старте
const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nominees (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'game',
      twitch_login TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      nominee_id INTEGER NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_login TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, nominee_id)
    );
  `);

  // Сид (добавляем номинантов, если база пустая)
  const res = await pool.query('SELECT COUNT(*) FROM nominees');
  if (parseInt(res.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO nominees (name, description, category) VALUES 
      ('VoidSlayer', 'Танк-мейн, мемы и лучшие камбэки года', 'game'),
      ('HealQueen', 'Саппорт-ангел комьюнити, всегда на связи', 'game'),
      ('FlexLord', 'Играет на всём, стримит каждый день', 'game'),
      ('TiltMaster', 'Артист тильта и любимец чата', 'fun');
    `);
  }
};
initDb().catch(console.error);

export const db = {
  query: (text, params) => pool.query(text, params)
};