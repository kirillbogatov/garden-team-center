'use strict';

// Замена встроенного node:sqlite: тот же DatabaseSync/prepare().run/get/all,
// но поверх sql.js (SQLite в WASM). sql.js инициализирует boot.js до загрузки
// серверного бандла и кладёт готовый модуль в globalThis.__GARDEN_SQL__.

const SQL = globalThis.__GARDEN_SQL__;
if (!SQL) throw new Error('sql.js не инициализирован: boot.js должен выставить __GARDEN_SQL__ до загрузки сервера');

const normalize = (params) => params.map((value) => (value === undefined ? null : value));

class StatementSync {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
  }

  run(...params) {
    const stmt = this.owner._statement(this.sql);
    try {
      stmt.bind(normalize(params));
      stmt.step();
    } finally {
      stmt.reset();
    }
    return { changes: this.owner._db.getRowsModified(), lastInsertRowid: 0 };
  }

  get(...params) {
    const stmt = this.owner._statement(this.sql);
    try {
      stmt.bind(normalize(params));
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.reset();
    }
  }

  all(...params) {
    const stmt = this.owner._statement(this.sql);
    try {
      stmt.bind(normalize(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.reset();
    }
  }
}

class DatabaseSync {
  constructor() {
    const saved = globalThis.__GARDEN_SAVED_DB__ || undefined;
    this._db = new SQL.Database(saved);
    this._statements = new Map();
    this._db.run('PRAGMA foreign_keys = ON');
    globalThis.__GARDEN_SQLITE__ = this;
  }

  exec(sql) {
    this._db.exec(sql);
  }

  prepare(sql) {
    return new StatementSync(this, sql);
  }

  close() {
    this._statements.clear();
    this._db.close();
  }

  // Подготовленные statements живут в кэше владельца, потому что sql.js
  // освобождает их при export() и заново открывает базу.
  _statement(sql) {
    let stmt = this._statements.get(sql);
    if (!stmt) {
      stmt = this._db.prepare(sql);
      this._statements.set(sql, stmt);
    }
    return stmt;
  }

  // Снимок базы для сохранения в IndexedDB. export() закрывает и заново
  // открывает соединение, поэтому сбрасываем кэш и возвращаем PRAGMA.
  snapshot() {
    this._statements.clear();
    const data = this._db.export();
    this._db.run('PRAGMA foreign_keys = ON');
    return data;
  }
}

module.exports = { DatabaseSync };
