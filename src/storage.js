

const CryptoJS = require('crypto-js');
const _ = require('lodash');

/**
 * Storage class that implements content-addressable storage using IndexedDB
 * and provides utilities for working with nested object paths
 */
class Storage {
  /**
   * Creates a new Storage instance
   * @param {string} dbName - Name of the IndexedDB database to use
   */
  constructor(dbName = 'temporal-db') {
    this.dbName = dbName;
    this.db = null;
    this.stores = {
      objects: 'objects', // content-addressable objects
      refs: 'refs',       // branches and tags
      commits: 'commits'  // commit metadata
    };
  }

  /**
   * Initialize the storage and create database stores if needed
   * @returns {Promise<void>}
   */
  async init() {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      // For Node.js environment, use a polyfill (requires fake-indexeddb in test)
      if (typeof window === 'undefined' && typeof global !== 'undefined') {
        try {
          // Try to require fake-indexeddb and set it up as a polyfill
          const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
          global.indexedDB = indexedDB;
          global.IDBKeyRange = IDBKeyRange;
        } catch (error) {
          reject(new Error('IndexedDB polyfill not available. Please install fake-indexeddb: npm install fake-indexeddb'));
          return;
        }
      }

      const request = indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        reject(new Error(`Failed to open database: ${event.target.error}`));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object store for content-addressable objects
        if (!db.objectStoreNames.contains(this.stores.objects)) {
          db.createObjectStore(this.stores.objects);
        }
        
        // Create object store for refs (branches, tags)
        if (!db.objectStoreNames.contains(this.stores.refs)) {
          db.createObjectStore(this.stores.refs);
        }
        
        // Create object store for commit metadata
        if (!db.objectStoreNames.contains(this.stores.commits)) {
          const commitStore = db.createObjectStore(this.stores.commits, { keyPath: 'hash' });
          commitStore.createIndex('branch', 'branch', { unique: false });
          commitStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Store an object and return its hash
   * @param {Object} data - Data to store
   * @param {string} [providedHash] - Optional hash to use as key
   * @returns {Promise<string>} Hash of the stored data
   */
  async put(data, providedHash) {
    const json = JSON.stringify(data);
    const hash = providedHash || CryptoJS.SHA256(json).toString();
    
    await this._withStore(this.stores.objects, 'readwrite', (store) => {
      store.put(json, hash);
    });
    
    return hash;
  }

  /**
   * Retrieve an object by its hash
   * @param {string} hash - Hash of the object to retrieve
   * @returns {Promise<Object|null>} Retrieved object or null if not found
   */
  async get(hash) {
    const json = await this._withStore(this.stores.objects, 'readonly', (store) => {
      return store.get(hash);
    });
    
    return json ? JSON.parse(json) : null;
  }

  /**
   * Check if an object with the given hash exists
   * @param {string} hash - Hash to check
   * @returns {Promise<boolean>} True if object exists
   */
  async exists(hash) {
    const result = await this._withStore(this.stores.objects, 'readonly', (store) => {
      return store.count(hash);
    });
    
    return result > 0;
  }

  /**
   * Save a ref (branch pointer or tag)
   * @param {string} name - Ref name
   * @param {string} hash - Hash the ref points to
   * @returns {Promise<void>}
   */
  async saveRef(name, hash) {
    await this._withStore(this.stores.refs, 'readwrite', (store) => {
      store.put(hash, name);
    });
  }

  /**
   * Get a ref by name
   * @param {string} name - Ref name to retrieve
   * @returns {Promise<string|null>} Hash the ref points to or null
   */
  async getRef(name) {
    return this._withStore(this.stores.refs, 'readonly', (store) => {
      return store.get(name);
    });
  }

  /**
   * Delete a ref by name
   * @param {string} name - Ref name to delete
   * @returns {Promise<void>}
   */
  async deleteRef(name) {
    await this._withStore(this.stores.refs, 'readwrite', (store) => {
      store.delete(name);
    });
  }

  /**
   * List all refs with optional prefix
   * @param {string} [prefix=''] - Optional prefix to filter refs
   * @returns {Promise<Object>} Object mapping ref names to their hashes
   */
  async listRefs(prefix = '') {
    return this._withStore(this.stores.refs, 'readonly', (store) => {
      return new Promise((resolve) => {
        const refs = {};
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const key = cursor.key;
            if (!prefix || key.startsWith(prefix)) {
              refs[key] = cursor.value;
            }
            cursor.continue();
          } else {
            resolve(refs);
          }
        };
      });
    });
  }

  /**
   * Save commit metadata
   * @param {Object} commit - Commit object with hash, parent, branch and timestamp
   * @returns {Promise<void>}
   */
  async saveCommit(commit) {
    await this._withStore(this.stores.commits, 'readwrite', (store) => {
      store.put(commit);
    });
  }

  /**
   * Get commit metadata by hash
   * @param {string} hash - Commit hash
   * @returns {Promise<Object|null>} Commit metadata or null
   */
  async getCommit(hash) {
    return this._withStore(this.stores.commits, 'readonly', (store) => {
      return store.get(hash);
    });
  }

  /**
   * List commits for a branch, most recent first
   * @param {string} branch - Branch name
   * @returns {Promise<Array<Object>>} Array of commit metadata objects
   */
  async getCommitsForBranch(branch) {
    return this._withStore(this.stores.commits, 'readonly', (store) => {
      return new Promise((resolve) => {
        const index = store.index('branch');
        const commits = [];
        const request = index.openCursor(IDBKeyRange.only(branch), 'prev');
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            commits.push(cursor.value);
            cursor.continue();
          } else {
            resolve(commits);
          }
        };
      });
    });
  }

  /**
   * Get commits after a specific date
   * @param {string} branch - Branch name
   * @param {Date} date - Date to filter by
   * @returns {Promise<Array<Object>>} Array of commit metadata objects
   */
  async getCommitsAfterDate(branch, date) {
    return this._withStore(this.stores.commits, 'readonly', (store) => {
      return new Promise((resolve) => {
        const index = store.index('timestamp');
        const commits = [];
        const timestamp = date.getTime();
        
        // Get commits after the timestamp for the specific branch
        const request = index.openCursor(IDBKeyRange.lowerBound(timestamp), 'next');
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            if (cursor.value.branch === branch) {
              commits.push(cursor.value);
            }
            cursor.continue();
          } else {
            resolve(commits);
          }
        };
      });
    });
  }

  /**
   * Helper for working with object stores
   * @private
   * @param {string} storeName - Name of the store to use
   * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
   * @param {Function} callback - Function to execute with the store
   * @returns {Promise<any>} Result of the callback
   */
  async _withStore(storeName, mode, callback) {
    if (!this.db) {
      throw new Error('Database not initialized, call init() first');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      
      transaction.oncomplete = () => {
        resolve(result);
      };
      
      transaction.onerror = (event) => {
        reject(new Error(`Transaction error: ${event.target.error}`));
      };
      
      let result;
      try {
        result = callback(store);
        if (result instanceof IDBRequest) {
          result.onsuccess = () => {
            result = result.result;
          };
          result.onerror = (event) => {
            reject(new Error(`Request error: ${event.target.error}`));
          };
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  // Path Utilities

  /**
   * Get a value at a specified path in an object
   * @param {Object} obj - Object to get value from
   * @param {string|Array<string>} path - Path to the value
   * @returns {*} Value at path or undefined
   */
  static getValueAtPath(obj, path) {
    return _.get(obj, path);
  }

  /**
   * Set a value at a specified path in an object
   * @param {Object} obj - Object to modify
   * @param {string|Array<string>} path - Path to set
   * @param {*} value - Value to set
   * @returns {Object} New object with the value set
   */
  static setValueAtPath(obj, path, value) {
    return _.set(_.cloneDeep(obj), path, value);
  }

  /**
   * Delete a value at a specified path in an object
   * @param {Object} obj - Object to modify
   * @param {string|Array<string>} path - Path to delete
   * @returns {Object} New object with the value removed
   */
  static deleteValueAtPath(obj, path) {
    const result = _.cloneDeep(obj);
    _.unset(result, path);
    return result;
  }

  /**
   * Compare two values and determine if they are equal
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean} True if values are equal
   */
  static valuesEqual(a, b) {
    return _.isEqual(a, b);
  }
}

module.exports = Storage;