import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

if (!fs.existsSync('./data')) fs.mkdirSync('./data');
const sqlite = new DatabaseSync('./data/slay.db');
sqlite.exec('PRAGMA foreign_keys = ON;');

sqlite.exec(`
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'game',
    twitch_login TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    created_by TEXT DEFAULT NULL,
    socials TEXT DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nominee_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_login TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category)
  );
`);

// Добавляем новые колонки, если база уже существует
try { sqlite.exec('ALTER TABLE nominees ADD COLUMN created_by TEXT DEFAULT NULL;'); } catch (e) {}
try { sqlite.exec('ALTER TABLE nominees ADD COLUMN sort_order INTEGER DEFAULT 0;'); } catch (e) {}
try { sqlite.exec('ALTER TABLE nominees ADD COLUMN socials TEXT DEFAULT "{}";'); } catch (e) {}
try { sqlite.exec('ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0;'); } catch (e) {}

const checkCats = sqlite.prepare('SELECT COUNT(*) as c FROM categories').get().c;
if (checkCats === 0) {
  const defaultCats = [
    { id: 'slay_of_year', title: 'Slay of the Year', desc: 'Главная номинация: тот, кто сделал больше всего для комьюнити за год.', icon: '👑', filter: 'game' },
    { id: 'best_flex', title: 'Лучший флекс', desc: 'Играет на всём и везде — танк, дд, хил, без токсика.', icon: '🔀', filter: 'game' },
    { id: 'heal_angel', title: 'Хиловый ангел', desc: 'Самый заботливый саппорт-мейн, всегда спасёт тиммейта.', icon: '😇', filter: 'game' },
    { id: 'tank_stand', title: 'Танковый стенд', desc: 'Держит линию, даже когда вся команда разбежалась.', icon: '🛡️', filter: 'game' },
    { id: 'sniper', title: 'Снайпер года', desc: 'Лучшие хедшоты и самые «читерские» моменты.', icon: '🎯', filter: 'game' },
    { id: 'memelord', title: 'Мем-лорд', desc: 'Самый вирусный клип или мем, разлетевшийся по комьюнити.', icon: '😂', filter: 'fun' },
    { id: 'philosopher', title: 'Стример-философ', desc: '«Почему я вообще играю в эту игру?» — самые глубокие мысли в чате.', icon: '🧠', filter: 'fun' },
    { id: 'carry', title: 'Кэрри-потенциал', desc: 'Тащит даже в соло-кью, но никогда не получает похвалы.', icon: '💪', filter: 'game' },
    { id: 'tilt', title: 'Лучший тильт', desc: 'Самый эпичный срыв на стриме — с любовью и за артистизм.', icon: '💢', filter: 'fun' },
    { id: 'loud_chat', title: 'Самый громкий чат', desc: 'Всегда хаос, спам и KEKW в чате.', icon: '📢', filter: 'fun' },
    { id: 'queue_king', title: 'Король очереди', desc: 'Стоит в очереди 40 минут и всё равно не попадает в катку.', icon: '⏳', filter: 'fun' },
    { id: 'pick_master', title: 'Мастер пика', desc: 'Самый странный пик героя, который сработал (или нет).', icon: '🎲', filter: 'fun' },
    { id: 'toxic_charm', title: 'Токсичный, но обаятельный', desc: 'Умеет быть язвительным, но не переходит черту.', icon: '😈', filter: 'fun' },
    { id: 'broken_mic', title: 'Сломанный микрофон', desc: 'Самый эпичный технический фейл на стриме.', icon: '🎤', filter: 'fun' },
    { id: 'community_soul', title: 'Душа комьюнити', desc: 'Помогает новичкам, отвечает в чате и создаёт уют.', icon: '🫶', filter: 'comm' },
    { id: 'best_mod', title: 'Лучший модератор', desc: 'Незаметный герой, который держит чат в порядке.', icon: '🛡️', filter: 'comm' },
    { id: 'clip_maker', title: 'Клип-мейкер', desc: 'Лучшие нарезки и трейлеры по стримам.', icon: '🎬', filter: 'comm' },
    { id: 'artist', title: 'Художник Overwatch', desc: 'Лучший фанарт или эмоут, ставший символом комьюнити.', icon: '🎨', filter: 'comm' },
    { id: 'voice', title: 'Голос комьюнити', desc: 'Лучший подкаст, обсуждение или новостной дайджест.', icon: '🎙️', filter: 'comm' },
    { id: 'newbie', title: 'Открытие года', desc: 'Новичок, который быстро заявил о себе.', icon: '🚀', filter: 'spec' },
    { id: 'legend', title: 'Легенда Slay', desc: 'Почётная награда за вклад в комьюнити на протяжении года.', icon: '🏆', filter: 'spec' },
    { id: 'comeback', title: 'Лучший камбэк', desc: 'Вернулся после перерыва и снова зажёг.', icon: '🔄', filter: 'spec' },
    { id: 'stable', title: 'Самый стабильный стрим', desc: 'Стримы по расписанию, без опозданий.', icon: '📅', filter: 'spec' },
    { id: 'fan_art', title: 'Фан-арт года', desc: 'Лучшая визуальная работа по мотивам стримов и комьюнити.', icon: '🖼️', filter: 'comm' }
  ];
  const insCat = sqlite.prepare('INSERT INTO categories (id, title, description, icon, filter, sort_order) VALUES (?,?,?,?,?,?)');
  defaultCats.forEach((c, index) => insCat.run(c.id, c.title, c.desc, c.icon, c.filter, index));
}

export const db = {
  query: async (text, params = []) => {
    const sqliteText = text.replace(/\$\d+/g, '?');
    const isSelect = sqliteText.trim().toUpperCase().startsWith('SELECT');
    try {
      if (isSelect) {
        const stmt = sqlite.prepare(sqliteText);
        const rows = stmt.all(...params);
        return { rows, rowCount: rows.length };
      } else {
        const stmt = sqlite.prepare(sqliteText);
        const info = stmt.run(...params);
        return { rows: [], rowCount: info.changes };
      }
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) throw new Error('unique constraint');
      throw e;
    }
  }
};