const CryptoJS = require('crypto-js');
const _ = require('lodash');

/**
 * MerkleTree implementation for content-addressable storage
 * and efficient structural comparison of objects
 */
class MerkleTree {
  /**
   * Create a Merkle tree from an object
   * @param {Object} data - Source object to create tree from
   * @returns {Object} Merkle tree representation
   */
  static fromObject(data) {
    if (data === null || data === undefined) {
      return {
        hash: MerkleTree.hashData(null),
        value: null,
        type: 'null'
      };
    }

    const type = Array.isArray(data) ? 'array' : typeof data;

    // Handle primitive types directly
    if (type !== 'object' && type !== 'array') {
      return {
        hash: MerkleTree.hashData(data),
        value: data,
        type
      };
    }

    // Handle objects and arrays
    const children = {};
    const keys = Object.keys(data).sort(); // Sort keys for consistent hashing
    
    for (const key of keys) {
      children[key] = MerkleTree.fromObject(data[key]);
    }
    
    // Calculate hash based on children's hashes
    const childrenHashes = {};
    for (const key of keys) {
      childrenHashes[key] = children[key].hash;
    }
    
    const hash = MerkleTree.hashData(childrenHashes);
    
    return {
      hash,
      type,
      children
    };
  }

  /**
   * Convert a Merkle tree back to its original object
   * @param {Object} tree - Merkle tree to convert
   * @returns {*} Original object
   */
  static toObject(tree) {
    if (!tree) return null;
    
    // Handle primitive types
    if (tree.type !== 'object' && tree.type !== 'array') {
      return tree.value;
    }
    
    // Handle objects and arrays
    const result = tree.type === 'array' ? [] : {};
    
    if (tree.children) {
      for (const key of Object.keys(tree.children)) {
        result[key] = MerkleTree.toObject(tree.children[key]);
      }
    }
    
    return result;
  }

  /**
   * Hash data consistently
   * @param {*} data - Data to hash
   * @returns {string} Hash of the data
   */
  static hashData(data) {
    const json = JSON.stringify(data);
    return CryptoJS.SHA256(json).toString();
  }

  /**
   * Compare two trees and return paths to differences
   * @param {Object} oldTree - Previous Merkle tree
   * @param {Object} newTree - New Merkle tree
   * @param {string} [basePath=''] - Current path for recursion
   * @returns {Object} Object with added, modified, and deleted paths
   */
  static diff(oldTree, newTree, basePath = '') {
    const result = {
      added: [],
      modified: [],
      deleted: []
    };
    
    // Both trees are null or exactly the same
    if (!oldTree && !newTree) {
      return result;
    }
    
    // If either tree is null (but not both), the entire subtree is added/deleted
    if (!oldTree) {
      result.added.push(basePath || '.'); // Use '.' for root
      return result;
    }
    
    if (!newTree) {
      result.deleted.push(basePath || '.');
      return result;
    }
    
    // If hashes are the same, trees are identical - quick exit
    if (oldTree.hash === newTree.hash) {
      return result;
    }
    
    // Handle primitive values
    if (oldTree.type !== 'object' && oldTree.type !== 'array' &&
        newTree.type !== 'object' && newTree.type !== 'array') {
      result.modified.push(basePath || '.');
      return result;
    }
    
    // Type changed (e.g., object to array)
    if (oldTree.type !== newTree.type) {
      result.modified.push(basePath || '.');
      return result;
    }
    
    // Both are objects or arrays, compare children recursively
    const oldKeys = oldTree.children ? Object.keys(oldTree.children) : [];
    const newKeys = newTree.children ? Object.keys(newTree.children) : [];
    
    // Find deleted keys
    for (const key of oldKeys) {
      if (!newKeys.includes(key)) {
        const path = basePath ? `${basePath}.${key}` : key;
        result.deleted.push(path);
      }
    }
    
    // Find added and modified keys
    for (const key of newKeys) {
      const path = basePath ? `${basePath}.${key}` : key;
      
      if (!oldKeys.includes(key)) {
        result.added.push(path);
      } else if (oldTree.children[key].hash !== newTree.children[key].hash) {
        // Key exists in both but content differs, recurse
        const childDiff = MerkleTree.diff(oldTree.children[key], newTree.children[key], path);
        
        // If the child diff contains an exact modification of this path,
        // it means the whole subtree is different
        const hasDirectModification = childDiff.modified.includes(path);
        
        if (hasDirectModification) {
          result.modified.push(path);
        } else {
          // Otherwise, merge the child differences
          result.added = result.added.concat(childDiff.added);
          result.modified = result.modified.concat(childDiff.modified);
          result.deleted = result.deleted.concat(childDiff.deleted);
        }
      }
    }
    
    return result;
  }

  /**
   * Find the lowest common ancestor of multiple paths
   * @param {Array<string>} paths - Array of paths
   * @returns {string} Lowest common ancestor path
   */
  static findLowestCommonAncestor(paths) {
    if (!paths || paths.length === 0) return '';
    if (paths.length === 1) return paths[0];
    
    // Split paths into segments
    const segments = paths.map(path => path.split('.'));
    
    // Find the minimum length
    const minLength = Math.min(...segments.map(s => s.length));
    
    // Find common prefix
    let commonPrefix = [];
    for (let i = 0; i < minLength; i++) {
      const segment = segments[0][i];
      if (segments.every(s => s[i] === segment)) {
        commonPrefix.push(segment);
      } else {
        break;
      }
    }
    
    return commonPrefix.join('.');
  }

  /**
   * Store a Merkle tree in the storage layer
   * @param {Object} storage - Storage instance
   * @param {Object} tree - Merkle tree to store
   * @returns {Promise<string>} Root hash of the stored tree
   */
  static async storeTree(storage, tree) {
    // For primitive types, store directly
    if (tree.type !== 'object' && tree.type !== 'array') {
      await storage.put({ type: tree.type, value: tree.value }, tree.hash);
      return tree.hash;
    }
    
    // For objects and arrays, store children recursively first
    const storedChildren = {};
    for (const key of Object.keys(tree.children || {})) {
      storedChildren[key] = await MerkleTree.storeTree(storage, tree.children[key]);
    }
    
    // Store this node with references to children
    const node = {
      type: tree.type,
      children: storedChildren
    };
    
    // Store directly with the hash as the key
    await storage.put(node, tree.hash);
    return tree.hash;
  }

  /**
   * Retrieve a Merkle tree from storage
   * @param {Object} storage - Storage instance
   * @param {string} hash - Root hash of the tree to retrieve
   * @returns {Promise<Object>} Retrieved Merkle tree
   */
  static async retrieveTree(storage, hash) {
    if (!hash) return null;
    
    const node = await storage.get(hash);
    if (!node) {
      throw new Error(`Node with hash ${hash} not found in storage`);
    }
    
    // Leaf node with primitive value
    if (node.type !== 'object' && node.type !== 'array') {
      return {
        hash,
        type: node.type,
        value: node.value
      };
    }
    
    // Internal node with children
    const children = {};
    for (const key of Object.keys(node.children || {})) {
      const childHash = node.children[key];
      children[key] = await MerkleTree.retrieveTree(storage, childHash);
    }
    
    return {
      hash,
      type: node.type,
      children
    };
  }
}

module.exports = MerkleTree;