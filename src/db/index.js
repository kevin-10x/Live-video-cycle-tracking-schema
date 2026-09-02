import sqlite3 from 'sqlite3';
import { config } from '../config/index.js';

const db = new sqlite3.Database(config.dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function transaction(fn) {
  return (async () => {
    await run('BEGIN');
    try {
      const result = await fn();
      await run('COMMIT');
      return result;
    } catch (e) {
      await run('ROLLBACK');
      throw e;
    }
  })();
}

export { run, get, all, transaction };
