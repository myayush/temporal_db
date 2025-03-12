const Storage = require('../src/storage');
require('fake-indexeddb/auto');

describe('Storage', () => {
  let storage;
  
  beforeEach(async () => {
    storage = new Storage('test-db');
    await storage.init();
  });
  
  afterEach(() => {
    storage.close();
    
    // Clear the database for the next test
    indexedDB.deleteDatabase('test-db');
  });
  
  test('puts and gets objects', async () => {
    const testData = { name: 'test', value: 42 };
    const hash = await storage.put(testData);
    
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    
    const retrieved = await storage.get(hash);
    expect(retrieved).toEqual(testData);
  });
  
  test('checks if objects exist', async () => {
    const testData = { name: 'test', value: 42 };
    const hash = await storage.put(testData);
    
    const exists = await storage.exists(hash);
    expect(exists).toBe(true);
    
    const nonexistent = await storage.exists('nonexistentHash');
    expect(nonexistent).toBe(false);
  });
  
  test('manages refs', async () => {
    await storage.saveRef('main', 'commit123');
    const hash = await storage.getRef('main');
    
    expect(hash).toBe('commit123');
    
    const nonexistent = await storage.getRef('nonexistent');
    expect(nonexistent).toBeUndefined();
  });
  
  test('lists refs with prefix', async () => {
    await storage.saveRef('branch/main', 'commit123');
    await storage.saveRef('branch/feature', 'commit456');
    await storage.saveRef('tag/v1.0', 'commit789');
    
    const branches = await storage.listRefs('branch/');
    expect(Object.keys(branches).length).toBe(2);
    expect(branches['branch/main']).toBe('commit123');
    expect(branches['branch/feature']).toBe('commit456');
    
    const tags = await storage.listRefs('tag/');
    expect(Object.keys(tags).length).toBe(1);
    expect(tags['tag/v1.0']).toBe('commit789');
    
    const all = await storage.listRefs();
    expect(Object.keys(all).length).toBe(3);
  });
  
  test('manages commits', async () => {
    const commit = {
      hash: 'commit123',
      parent: null,
      branch: 'main',
      message: 'Initial commit',
      timestamp: Date.now(),
      rootHash: 'root123'
    };
    
    await storage.saveCommit(commit);
    const retrieved = await storage.getCommit('commit123');
    
    expect(retrieved).toEqual(commit);
  });
  
  test('gets commits for branch', async () => {
    const commits = [
      {
        hash: 'commit1',
        parent: null,
        branch: 'main',
        message: 'First commit',
        timestamp: 1000,
        rootHash: 'root1'
      },
      {
        hash: 'commit2',
        parent: 'commit1',
        branch: 'main',
        message: 'Second commit',
        timestamp: 2000,
        rootHash: 'root2'
      },
      {
        hash: 'commit3',
        parent: 'commit1',
        branch: 'feature',
        message: 'Feature commit',
        timestamp: 3000,
        rootHash: 'root3'
      }
    ];
    
    for (const commit of commits) {
      await storage.saveCommit(commit);
    }
    
    const mainCommits = await storage.getCommitsForBranch('main');
    expect(mainCommits.length).toBe(2);
    expect(mainCommits[0].hash).toBe('commit2'); // most recent first
    expect(mainCommits[1].hash).toBe('commit1');
    
    const featureCommits = await storage.getCommitsForBranch('feature');
    expect(featureCommits.length).toBe(1);
    expect(featureCommits[0].hash).toBe('commit3');
  });
  
  test('path utilities work with nested objects', () => {
    const obj = {
      a: {
        b: {
          c: 42
        },
        d: [1, 2, 3]
      },
      e: 'test'
    };
    
    // Get value
    expect(Storage.getValueAtPath(obj, 'a.b.c')).toBe(42);
    expect(Storage.getValueAtPath(obj, 'a.d[1]')).toBe(2);
    expect(Storage.getValueAtPath(obj, 'nonexistent')).toBeUndefined();
    
    // Set value
    const modified = Storage.setValueAtPath(obj, 'a.b.c', 99);
    expect(modified.a.b.c).toBe(99);
    expect(obj.a.b.c).toBe(42); // Original unchanged
    
    const withNewPath = Storage.setValueAtPath(obj, 'x.y.z', 'new');
    expect(withNewPath.x.y.z).toBe('new');
    
    // Delete value
    const deleted = Storage.deleteValueAtPath(obj, 'a.b');
    expect(deleted.a.b).toBeUndefined();
    expect(deleted.a.d).toEqual([1, 2, 3]);
    expect(obj.a.b).toBeDefined(); // Original unchanged
    
    // Compare values
    expect(Storage.valuesEqual(obj.a.d, [1, 2, 3])).toBe(true);
    expect(Storage.valuesEqual(obj.a.d, [1, 2, 4])).toBe(false);
  });
});