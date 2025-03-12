const MerkleTree = require('./merkle');
const Diff = require('./diff');

/**
 * Manages branches and commits
 */
class Branch {
  /**
   * Creates a new Branch manager
   * @param {Object} storage - Storage instance
   */
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Initialize with default main branch if it doesn't exist
   * @returns {Promise<boolean>} True if initialization was needed
   */
  async init() {
    const mainExists = await this.storage.getRef('branch/main');
    
    if (!mainExists) {
      const emptyTree = MerkleTree.fromObject({});
      const rootHash = await MerkleTree.storeTree(this.storage, emptyTree);
      
      const commit = {
        hash: rootHash,
        parent: null,
        branch: 'main',
        message: 'Initial commit',
        timestamp: Date.now(),
        rootHash
      };
      
      await this.storage.saveCommit(commit);
      await this.storage.saveRef('branch/main', rootHash);
      await this.storage.saveRef('HEAD', 'branch/main');
      
      return true;
    }
    
    return false;
  }

  /**
   * Get the current branch name
   * @returns {Promise<string>} Current branch name
   */
  async getCurrentBranch() {
    const headRef = await this.storage.getRef('HEAD');
    if (!headRef) {
      throw new Error('HEAD reference not found');
    }
    
    if (headRef.startsWith('branch/')) {
      return headRef.substring(7); // Remove 'branch/' prefix
    }
    
    throw new Error('HEAD is in detached state');
  }

  /**
   * Get the latest commit hash for a branch
   * @param {string} branchName - Branch name
   * @returns {Promise<string>} Latest commit hash or null
   */
  async getBranchHead(branchName) {
    return this.storage.getRef(`branch/${branchName}`);
  }

  /**
   * List all branches
   * @returns {Promise<Array<string>>} Array of branch names
   */
  async listBranches() {
    const refs = await this.storage.listRefs('branch/');
    return Object.keys(refs).map(ref => ref.substring(7)); // Remove 'branch/' prefix
  }

  /**
   * Create a new branch from a source branch
   * @param {string} newBranchName - Name for the new branch
   * @param {string} sourceBranchName - Source branch name
   * @returns {Promise<string>} New branch head commit hash
   */
  async createBranch(newBranchName, sourceBranchName) {
    if (!newBranchName) {
      throw new Error('Branch name is required');
    }
    
    const exists = await this.storage.getRef(`branch/${newBranchName}`);
    if (exists) {
      throw new Error(`Branch '${newBranchName}' already exists`);
    }
    
    // Get source branch head
    const sourceHead = await this.getBranchHead(sourceBranchName);
    if (!sourceHead) {
      throw new Error(`Source branch '${sourceBranchName}' does not exist`);
    }
    
    // Create new branch pointing to the same commit
    await this.storage.saveRef(`branch/${newBranchName}`, sourceHead);
    
    return sourceHead;
  }

  /**
   * Switch to a different branch
   * @param {string} branchName - Branch to switch to
   * @returns {Promise<string>} New HEAD commit hash
   */
  async checkout(branchName) {
    const branchHead = await this.getBranchHead(branchName);
    if (!branchHead) {
      throw new Error(`Branch '${branchName}' does not exist`);
    }
    
    await this.storage.saveRef('HEAD', `branch/${branchName}`);
    
    return branchHead;
  }

  /**
   * Create and store a new commit
   * @param {string} branchName - Branch to commit to
   * @param {Object} data - Data to commit
   * @param {string} message - Commit message
   * @returns {Promise<Object>} Commit object
   */
  async commit(branchName, data, message) {
    const branchRef = `branch/${branchName}`;
    
    // Get the current branch head
    const parentHash = await this.storage.getRef(branchRef);
    
    // Create Merkle tree from new data
    const tree = MerkleTree.fromObject(data);
    const rootHash = await MerkleTree.storeTree(this.storage, tree);
    
    // Create commit object
    const timestamp = Date.now();
    const commit = {
      hash: rootHash,
      parent: parentHash,
      branch: branchName,
      message: message || 'Update',
      timestamp,
      rootHash
    };
    
    // Store commit metadata
    await this.storage.saveCommit(commit);
    
    // Update branch reference
    await this.storage.saveRef(branchRef, rootHash);
    
    return commit;
  }

  /**
   * Get data at a specific commit
   * @param {string} commitHash - Commit hash
   * @returns {Promise<Object>} Data at that commit
   */
  async getDataAtCommit(commitHash) {
    const commit = await this.storage.getCommit(commitHash);
    if (!commit) {
      throw new Error(`Commit '${commitHash}' not found`);
    }
    
    const tree = await MerkleTree.retrieveTree(this.storage, commit.rootHash);
    return MerkleTree.toObject(tree);
  }

  /**
   * Get data for a branch at the latest commit
   * @param {string} branchName - Branch name
   * @returns {Promise<Object>} Latest data for the branch
   */
  async getBranchData(branchName) {
    const headHash = await this.getBranchHead(branchName);
    if (!headHash) {
      throw new Error(`Branch '${branchName}' not found`);
    }
    
    return this.getDataAtCommit(headHash);
  }

  /**
   * Get data at a specific point in time
   * @param {string} branchName - Branch name
   * @param {Date|string|number} timestamp - Point in time
   * @returns {Promise<Object>} Data at that time
   */
  async getDataAtTime(branchName, timestamp) {
    // Convert timestamp to Date object if needed
    const time = typeof timestamp === 'string'
      ? new Date(timestamp)
      : (timestamp instanceof Date ? timestamp : new Date(timestamp));
    
    // Get all commits for the branch
    const commits = await this.storage.getCommitsForBranch(branchName);
    
    // Find the most recent commit before or at the specified time
    let targetCommit = null;
    for (const commit of commits) {
      if (commit.timestamp <= time.getTime()) {
        targetCommit = commit;
        break; // commits are ordered most recent first
      }
    }
    
    if (!targetCommit) {
      throw new Error(`No commit found on branch '${branchName}' before ${time.toISOString()}`);
    }
    
    return this.getDataAtCommit(targetCommit.hash);
  }

  /**
   * Get commit history for a branch
   * @param {string} branchName - Branch name
   * @returns {Promise<Array<Object>>} Array of commit objects
   */
  async getHistory(branchName) {
    return this.storage.getCommitsForBranch(branchName);
  }

  /**
   * Delete a branch
   * @param {string} branchName - Branch to delete
   * @returns {Promise<void>}
   */
  async deleteBranch(branchName) {
    // Cannot delete the main branch
    if (branchName === 'main') {
      throw new Error('Cannot delete the main branch');
    }
    
    // Check if we're on this branch
    const currentBranch = await this.getCurrentBranch();
    if (currentBranch === branchName) {
      throw new Error(`Cannot delete the currently checked out branch '${branchName}'`);
    }
    
    // Check if branch exists
    const exists = await this.getBranchHead(branchName);
    if (!exists) {
      throw new Error(`Branch '${branchName}' not found`);
    }
    
    // Delete the branch reference
    await this.storage.deleteRef(`branch/${branchName}`);
  }
}

module.exports = Branch;