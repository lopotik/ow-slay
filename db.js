import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      filter TEXT NOT NULL DEFAULT 'game',
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS nominees (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'game',
      twitch_login TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      created_by TEXT DEFAULT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      nominee_id INTEGER NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_login TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, category)
    );
  `);

  const res = await pool.query('SELECT COUNT(*) FROM categories');
  if (parseInt(res.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO categories (id, title, description, icon, filter, sort_order) VALUES 
      ('slay_of_year', 'Slay of the Year', 'Главная номинация: тот, кто сделал больше всего для комьюнити за год.', '👑', 'game', 1),
      ('best_flex', 'Лучший флекс', 'Играет на всём и везде — танк, дд, хил, без токсика.', '🔀', 'game', 2),
      ('heal_angel', 'Хиловый ангел', 'Самый заботливый саппорт-мейн, всегда спасёт тиммейта.', '😇', 'game', 3),
      ('tank_stand', 'Танковый стенд', 'Держит линию, даже когда вся команда разбежалась.', '🛡️', 'game', 4),
      ('sniper', 'Снайпер года', 'Лучшие хедшоты и самые «читерские» моменты.', '🎯', 'game', 5),
      ('memelord', 'Мем-лорд', 'Самый вирусный клип или мем, разлетевшийся по комьюнити.', '😂', 'fun', 6),
      ('philosopher', 'Стример-философ', '«Почему я вообще играю в эту игру?» — самые глубокие мысли в чате.', '🧠', 'fun', 7),
      ('carry', 'Кэрри-потенциал', 'Тащит даже в соло-кью, но никогда не получает похвалы.', '💪', 'game', 8),
      ('tilt', 'Лучший тильт', 'Самый эпичный срыв на стриме — с любовью и за артистизм.', '💢', 'fun', 9),
      ('loud_chat', 'Самый громкий чат', 'Всегда хаос, спам и KEKW в чате.', '📢', 'fun', 10),
      ('queue_king', 'Король очереди', 'Стоит в очереди 40 минут и всё равно не попадает в катку.', '⏳', 'fun', 11),
      ('pick_master', 'Мастер пика', 'Самый странный пик героя, который сработал (или нет).', '🎲', 'fun', 12),
      ('toxic_charm', 'Токсичный, но обаятельный', 'Умеет быть язвительным, но не переходит черту.', '😈', 'fun', 13),
      ('broken_mic', 'Сломанный микрофон', 'Самый эпичный технический фейл на стриме.', '🎤', 'fun', 14),
      ('community_soul', 'Душа комьюнити', 'Помогает новичкам, отвечает в чате и создаёт уют.', '🫶', 'comm', 15),
      ('best_mod', 'Лучший модератор', 'Незаметный герой, который держит чат в порядке.', '🛡️', 'comm', 16),
      ('clip_maker', 'Клип-мейкер', 'Лучшие нарезки и трейлеры по стримам.', '🎬', 'comm', 17),
      ('artist', 'Художник Overwatch', 'Лучший фанарт или эмоут, ставший символом комьюнити.', '🎨', 'comm', 18),
      ('voice', 'Голос комьюнити', 'Лучший подкаст, обсуждение или новостной дайджест.', '🎙️', 'comm', 19),
      ('newbie', 'Открытие года', 'Новичок, который быстро заявил о себе.', '🚀', 'spec', 20),
      ('legend', 'Легенда Slay', 'Почётная награда за вклад в комьюнити на протяжении года.', '🏆', 'spec', 21),
      ('comeback', 'Лучший камбэк', 'Вернулся после перерыва и снова зажёг.', '🔄', 'spec', 22),
      ('stable', 'Самый стабильный стрим', 'Стримы по расписанию, без опозданий.', '📅', 'spec', 23),
      ('fan_art', 'Фан-арт года', 'Лучшая визуальная работа по мотивам стримов и комьюнити.', '🖼️', 'comm', 24);
    `);
  }
};
initDb().catch(console.error);

export const db = {
  query: (text, params) => pool.query(text, params)
};