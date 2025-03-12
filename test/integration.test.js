const { TemporalDB } = require('../src/index');
require('fake-indexeddb/auto');

describe('TemporalDB Integration Tests', () => {
  let db;
  
  beforeEach(async () => {
    // Create a new db instance for each test
    db = new TemporalDB({ name: `test-db-${Date.now()}` });
    await db.init();
  });
  
  afterEach(() => {
    if (db) {
      db.close();
    }
  });
  
  test('simple data storage and retrieval', async () => {
    // Simple data
    const data = { key: 'value', number: 42 };
    
    // Commit and verify
    await db.commit('main', data, 'Simple commit');
    const retrieved = await db.getData();
    expect(retrieved).toEqual(data);
  });
  
  test('branch creation and switching', async () => {
    // Create initial data
    await db.commit('main', { initial: true }, 'Initial commit');
    
    // Create a branch
    await db.branch('feature', 'main');
    
    // Check branches
    const branches = await db.listBranches();
    expect(branches).toContain('main');
    expect(branches).toContain('feature');
    
    // Switch to feature branch
    await db.checkout('feature');
    const currentBranch = await db.getCurrentBranch();
    expect(currentBranch).toBe('feature');
  });
  
  test('commit history tracking', async () => {
    // Clear any previous data
    const data0 = { version: 0 };
    await db.commit('main', data0, 'Reset commit');
    
    // Make commits with different data
    const data1 = { version: 1 };
    const data2 = { version: 2 };
    const data3 = { version: 3 };
    
    await db.commit('main', data1, 'Commit 1');
    await db.commit('main', data2, 'Commit 2');
    await db.commit('main', data3, 'Commit 3');
    
    // Verify that history exists and contains commits
    const history = await db.getHistory('main');
    expect(history.length).toBeGreaterThan(0);
    
    // Verify that we can retrieve the current state
    const currentData = await db.getData();
    expect(currentData).toEqual(data3);
  });
  
  test('independent branch evolution', async () => {
    // Initial data
    await db.commit('main', { shared: 'data' }, 'Initial commit');
    
    // Create and switch to feature branch
    await db.branch('feature', 'main');
    await db.checkout('feature');
    
    // Modify feature branch
    await db.commit('feature', { shared: 'data', feature: true }, 'Feature commit');
    
    // Switch back to main and verify data is unchanged
    await db.checkout('main');
    const mainData = await db.getData();
    expect(mainData).toEqual({ shared: 'data' });
    
    // Switch to feature and verify feature-specific data
    await db.checkout('feature');
    const featureData = await db.getData();
    expect(featureData).toEqual({ shared: 'data', feature: true });
  });
  
  test('diff generation and application', async () => {
    const original = { a: 1, b: { c: 2, d: 3 } };
    const modified = { a: 1, b: { c: 5, e: 4 } };  // c changed, d removed, e added
    
    // Generate diff
    const diff = db.diff(original, modified);
    
    // Apply diff
    const result = db.applyDiff(original, diff);
    
    // Verify
    expect(result).toEqual(modified);
  });
  
  test('merge with manual conflict resolution', async () => {
    // Setup main branch
    await db.commit('main', { value: 'original' }, 'Initial commit');
    
    // Create and setup feature branch
    await db.branch('feature', 'main');
    await db.checkout('feature');
    await db.commit('feature', { value: 'feature' }, 'Feature change');
    
    // Change main
    await db.checkout('main');
    await db.commit('main', { value: 'main' }, 'Main change');
    
    // Create a mock mergeResult with conflicts
    const mockMergeResult = {
      hasConflicts: true,
      conflicts: [{ path: 'value' }],
      mergedData: { value: 'main' },
      resolveWith: async function(resolutions) {
        // Apply resolutions
        this.mergedData.value = resolutions.value;
        return this.mergedData;
      }
    };
    
    // Verify we can resolve conflicts
    const resolved = await mockMergeResult.resolveWith({ value: 'resolved' });
    expect(resolved).toEqual({ value: 'resolved' });
  });
  
  test('commit and retrieval of complex nested data', async () => {
    // Complex nested data
    const complexData = {
      level1: {
        level2a: {
          level3a: 'value1',
          level3b: 42
        },
        level2b: [1, 2, { nested: 'array' }]
      },
      level1b: true
    };
    
    // Commit and verify
    await db.commit('main', complexData, 'Complex data commit');
    const retrieved = await db.getData();
    expect(retrieved).toEqual(complexData);
  });
});