const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('server/skoolsys.db');
console.log(db.prepare('SELECT id, username, full_name, role, is_active FROM users').all());
db.close();
