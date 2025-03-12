const Storage = require('./storage');
const MerkleTree = require('./merkle');
const Diff = require('./diff');
const Branch = require('./branch');
const { Merge, MergeResult } = require('./merge');

/**
 * TemporalDB main class - provides Git-like versioning for application data
 */
class TemporalDB {
  /**
   * Create a new TemporalDB instance
   * @param {Object} options - Configuration options
   * @param {string} [options.name='temporal-db'] - Database name
   */
  constructor(options = {}) {
    this.storage = new Storage(options.name || 'temporal-db');
    this.branchManager = null; // Renamed from branch to avoid naming conflicts
    this.mergeHandler = null;  // Using mergeHandler to avoid naming conflicts
    this.initialized = false;
  }

  /**
   * Initialize the database
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;
    
    await this.storage.init();
    this.branchManager = new Branch(this.storage);
    await this.branchManager.init();
    this.mergeHandler = new Merge(this.storage, this.branchManager);
    
    this.initialized = true;
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.initialized) {
      this.storage.close();
      this.initialized = false;
      this.branchManager = null;
      this.mergeHandler = null;
    }
  }

  /**
   * Get the current branch name
   * @returns {Promise<string>} Current branch name
   */
  async getCurrentBranch() {
    this._ensureInitialized();
    return this.branchManager.getCurrentBranch();
  }

  /**
   * List all branches
   * @returns {Promise<Array<string>>} Array of branch names
   */
  async listBranches() {
    this._ensureInitialized();
    return this.branchManager.listBranches();
  }

  /**
   * Create a new branch from a source branch
   * @param {string} newBranchName - Name for the new branch
   * @param {string} [sourceBranchName] - Source branch name (defaults to current branch)
   * @returns {Promise<string>} New branch head commit hash
   */
  async branch(newBranchName, sourceBranchName) {
    this._ensureInitialized();
    
    if (!sourceBranchName) {
      sourceBranchName = await this.getCurrentBranch();
    }
    
    return this.branchManager.createBranch(newBranchName, sourceBranchName);
  }

  /**
   * Switch to a different branch
   * @param {string} branchName - Branch to switch to
   * @returns {Promise<string>} New HEAD commit hash
   */
  async checkout(branchName) {
    this._ensureInitialized();
    return this.branchManager.checkout(branchName);
  }

  /**
   * Get the current data state
   * @returns {Promise<Object>} Current data state
   */
  async getData() {
    this._ensureInitialized();
    const currentBranch = await this.getCurrentBranch();
    return this.branchManager.getBranchData(currentBranch);
  }

  /**
   * Get data at a specific commit
   * @param {string} commitHash - Commit hash
   * @returns {Promise<Object>} Data at that commit
   */
  async getDataAtCommit(commitHash) {
    this._ensureInitialized();
    return this.branchManager.getDataAtCommit(commitHash);
  }

  /**
   * Get data for a specific branch
   * @param {string} branchName - Branch name
   * @returns {Promise<Object>} Latest data for the branch
   */
  async getBranchData(branchName) {
    this._ensureInitialized();
    return this.branchManager.getBranchData(branchName);
  }

  /**
   * Get data at a specific point in time
   * @param {string} branchName - Branch name
   * @param {Date|string|number} timestamp - Point in time
   * @returns {Promise<Object>} Data at that time
   */
  async getDataAt(branchName, timestamp) {
    this._ensureInitialized();
    return this.branchManager.getDataAtTime(branchName, timestamp);
  }

  /**
   * Create and store a new commit
   * @param {string} branchName - Branch to commit to (defaults to current branch)
   * @param {Object} data - Data to commit
   * @param {string} message - Commit message
   * @returns {Promise<Object>} Commit object
   */
  async commit(branchName, data, message) {
    this._ensureInitialized();
    
    if (typeof branchName === 'object' && !data) {
      // Handle case where branchName is omitted (commit(data, message))
      message = data;
      data = branchName;
      branchName = await this.getCurrentBranch();
    }
    
    return this.branchManager.commit(branchName, data, message);
  }

  /**
   * Get commit history for a branch
   * @param {string} [branchName] - Branch name (defaults to current branch)
   * @returns {Promise<Array<Object>>} Array of commit objects
   */
  async getHistory(branchName) {
    this._ensureInitialized();
    
    if (!branchName) {
      branchName = await this.getCurrentBranch();
    }
    
    return this.branchManager.getHistory(branchName);
  }

  /**
   * Delete a branch
   * @param {string} branchName - Branch to delete
   * @returns {Promise<void>}
   */
  async deleteBranch(branchName) {
    this._ensureInitialized();
    return this.branchManager.deleteBranch(branchName);
  }

  /**
   * Merge a source branch into a target branch
   * @param {string} sourceBranch - Branch to merge from
   * @param {string} [targetBranch] - Branch to merge into (defaults to current branch)
   * @returns {Promise<MergeResult>} Merge result
   */
  async merge(sourceBranch, targetBranch) {
    this._ensureInitialized();
    
    if (!targetBranch) {
      targetBranch = await this.getCurrentBranch();
    }
    
    return this.mergeHandler.mergeBranches(sourceBranch, targetBranch);
  }

  /**
   * Generate a diff between two objects
   * @param {Object} oldObj - Previous object state
   * @param {Object} newObj - New object state
   * @returns {Object} Diff object
   */
  diff(oldObj, newObj) {
    return Diff.generate(oldObj, newObj);
  }

  /**
   * Apply a diff to an object
   * @param {Object} obj - Object to patch
   * @param {Object} diff - Diff to apply
   * @returns {Object} New object with diff applied
   */
  applyDiff(obj, diff) {
    return Diff.apply(obj, diff);
  }

  /**
   * Helper to ensure the database is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Database not initialized, call init() first');
    }
  }
}

module.exports = { TemporalDB, Storage, MerkleTree, Diff };