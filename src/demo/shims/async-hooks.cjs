'use strict';

// Хватает синхронного стека: серверные handlers в демо не содержат await.
class AsyncLocalStorage {
  constructor() { this.store = undefined; }

  run(store, fn, ...args) {
    const previous = this.store;
    this.store = store;
    try {
      return fn(...args);
    } finally {
      this.store = previous;
    }
  }

  getStore() { return this.store; }
}

module.exports = { AsyncLocalStorage };
