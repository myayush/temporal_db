// examples/file-storage.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class FileStorage {
  constructor(options = {}) {
    this.storageDir = options.dir || path.join(os.homedir(), '.temporal-db');
    this.dbFile = path.join(this.storageDir, 'db.json');
    this.db = { 
      objects: {},  // content-addressable objects
      refs: {},     // branches and tags
      commits: {}   // commit metadata
    };
    this.ensureStorageDir();
    this.loadDatabase();
  }

  ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  loadDatabase() {
    if (fs.existsSync(this.dbFile)) {
      try {
        const data = fs.readFileSync(this.dbFile, 'utf8');
        this.db = JSON.parse(data);
      } catch (error) {
        console.error('Error loading database:', error.message);
      }
    }
  }

  saveDatabase() {
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify(this.db, null, 2));
    } catch (error) {
      console.error('Error saving database:', error.message);
    }
  }
  
  async init() {
    // Already initialized in constructor
    return Promise.resolve();
  }
  
  close() {
    this.saveDatabase();
  }
  
  async put(data, providedHash) {
    const json = JSON.stringify(data);
    const hash = providedHash || crypto.createHash('sha256').update(json).digest('hex');
    this.db.objects[hash] = json;
    this.saveDatabase();
    return hash;
  }
  
  async get(hash) {
    const json = this.db.objects[hash];
    return json ? JSON.parse(json) : null;
  }
  
  async exists(hash) {
    return this.db.objects.hasOwnProperty(hash);
  }
  
  async saveRef(name, hash) {
    this.db.refs[name] = hash;
    this.saveDatabase();
  }
  
  async getRef(name) {
    return this.db.refs[name];
  }
  
  async deleteRef(name) {
    delete this.db.refs[name];
    this.saveDatabase();
  }
  
  async listRefs(prefix = '') {
    const refs = {};
    for (const [key, value] of Object.entries(this.db.refs)) {
      if (!prefix || key.startsWith(prefix)) {
        refs[key] = value;
      }
    }
    return refs;
  }
  
  async saveCommit(commit) {
    this.db.commits[commit.hash] = commit;
    this.saveDatabase();
  }
  
  async getCommit(hash) {
    return this.db.commits[hash];
  }
  
  async getCommitsForBranch(branch) {
    return Object.values(this.db.commits)
      .filter(commit => commit.branch === branch)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  async getCommitsAfterDate(branch, date) {
    const timestamp = date.getTime();
    return Object.values(this.db.commits)
      .filter(commit => commit.branch === branch && commit.timestamp >= timestamp)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}

// Add static path utilities
FileStorage.getValueAtPath = function(obj, path) {
  if (!obj) return undefined;
  
  // Convert path to array if it's a string
  const parts = typeof path === 'string' ? path.split('.') : path;
  let current = obj;
  
  for (const part of parts) {
    // Handle array indices
    if (part.includes('[') && part.includes(']')) {
      const [name, indexStr] = part.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      
      if (!current[name] || !Array.isArray(current[name]) || index >= current[name].length) {
        return undefined;
      }
      current = current[name][index];
    } else {
      // Handle regular object properties
      if (current[part] === undefined) {
        return undefined;
      }
      current = current[part];
    }
  }
  
  return current;
};

FileStorage.setValueAtPath = function(obj, path, value) {
  const result = JSON.parse(JSON.stringify(obj || {}));
  
  // Convert path to array if it's a string
  const parts = typeof path === 'string' ? path.split('.') : path;
  let current = result;
  
  // Traverse the path, creating objects/arrays as needed
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    // Handle array indices
    if (part.includes('[') && part.includes(']')) {
      const [name, indexStr] = part.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      
      if (!current[name]) {
        current[name] = [];
      }
      
      if (!Array.isArray(current[name])) {
        current[name] = [];
      }
      
      while (current[name].length <= index) {
        current[name].push({});
      }
      
      current = current[name][index];
    } else {
      // Handle regular object properties
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
  }
  
  // Set the value at the final path part
  const lastPart = parts[parts.length - 1];
  
  if (lastPart.includes('[') && lastPart.includes(']')) {
    const [name, indexStr] = lastPart.split('[');
    const index = parseInt(indexStr.replace(']', ''));
    
    if (!current[name]) {
      current[name] = [];
    }
    
    while (current[name].length <= index) {
      current[name].push(null);
    }
    
    current[name][index] = value;
  } else {
    current[lastPart] = value;
  }
  
  return result;
};

FileStorage.deleteValueAtPath = function(obj, path) {
  const result = JSON.parse(JSON.stringify(obj));
  
  // Convert path to array if it's a string
  const parts = typeof path === 'string' ? path.split('.') : path;
  
  // If it's a root-level property, handle specially
  if (parts.length === 1) {
    delete result[parts[0]];
    return result;
  }
  
  // For nested properties, navigate to the parent
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    if (current[part] === undefined) {
      // Path doesn't exist, nothing to delete
      return result;
    }
    
    current = current[part];
  }
  
  // Delete the property
  delete current[parts[parts.length - 1]];
  return result;
};

FileStorage.valuesEqual = function(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
};

module.exports = FileStorage;