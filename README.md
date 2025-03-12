# TemporalDB

## What is it?

TemporalDB lets you add **versioning, branching, and time travel** to your application data—similar to Git but for JavaScript objects.

## Installation

```bash
npm install temporal-db
```

---

## Browser vs Node.js Usage

### Browser Environment (Primary Use Case)

TemporalDB is primarily designed for browser applications where it uses the native **IndexedDB** as its storage engine. In browsers, data is persistent between sessions, allowing your application to maintain its data history even after refresh or restart.

#### Example Usage:

```javascript
import { TemporalDB } from 'temporal-db';

// Create and initialize
const db = new TemporalDB();
await db.init();

// Save some data
await db.commit('main', {
  users: [{ id: 1, name: 'Alice' }],
  settings: { theme: 'light' }
}, 'Initial commit');

// Data is stored in IndexedDB and persists between page refreshes
```

#### **Browser Benefits:**
- **Data Persistence:** All history and branches are saved to the browser's IndexedDB.
- **Performance:** Leverages browser's native storage capabilities.
- **Offline Support:** Works without an internet connection.
- **No Backend Required:** All versioning happens client-side.

---

### Node.js Environment (Testing & Server-Side)

In Node.js, TemporalDB requires a polyfill since IndexedDB is a browser API. This is primarily useful for **testing** or for **server-side rendering** scenarios.

#### Example Usage:

```javascript
// First set up the IndexedDB polyfill
require('fake-indexeddb/auto');

// Then use TemporalDB as normal
const { TemporalDB } = require('temporal-db');

const db = new TemporalDB();
await db.init();

// Now you can use all the same methods as in the browser
await db.commit('main', { key: 'value' }, 'Initial commit');
```

💡 **Don't forget to install the polyfill:**
```bash
npm install fake-indexeddb
```

#### **Node.js Limitations:**
- **In-Memory Storage:** Data is stored in memory and doesn’t persist between application restarts.
- **Testing Only:** Primarily useful for testing or server-side rendering.
- **No Persistence:** You'll need to implement your own persistence mechanism if needed.

---

## Basic Usage

```javascript
// Create and initialize
const db = new TemporalDB();
await db.init();

// Save some data
await db.commit('main', {
  users: [{ id: 1, name: 'Alice' }],
  settings: { theme: 'light' }
}, 'Initial commit');

// Get your data
const data = await db.getData();
console.log(data);
```

---

## 🔑 Key Features

### **Branching**

Create branches to experiment with data without affecting your main version.

```javascript
// Create a branch
await db.branch('feature', 'main');

// Switch to the branch
await db.checkout('feature');

// Make changes on this branch
const data = await db.getData();
data.settings.theme = 'dark';
await db.commit('feature', data, 'Changed theme');
```

---

### **Merging**

Combine changes from different branches.

```javascript
// Switch back to main
await db.checkout('main');

// Merge the feature branch in
const mergeResult = await db.merge('feature', 'main');

// Handle conflicts if they exist
if (mergeResult.hasConflicts) {
  await mergeResult.resolveWith({
    'settings.theme': 'dark' // Choose which value to keep
  }, 'Resolved merge conflicts');
} else {
  await mergeResult.apply('Merged feature branch');
}
```

---

### **Time Travel**

View data from any point in time.

```javascript
// Get data as it was yesterday
const yesterday = new Date(Date.now() - 86400000);
const pastData = await db.getDataAt('main', yesterday);

// Get history of changes
const history = await db.getHistory('main');
console.log(history.map(commit => commit.message));
```

---

## Common Tasks

### **Updating Data**

```javascript
// Get current data
const data = await db.getData();

// Update it
data.users.push({ id: 2, name: 'Bob' });
data.lastUpdated = new Date().toISOString();

// Save it
await db.commit('main', data, 'Added Bob');
```

---

### **Finding Differences**

```javascript
// Compare two objects
const oldObj = { count: 1, active: true };
const newObj = { count: 2, active: true };

const diff = db.diff(oldObj, newObj);
console.log(diff);
// → { added: [], modified: [{ path: 'count', value: 2 }], deleted: [] }
```

---

### **Handling Array Merges**

When arrays are modified in different branches, you might need to manually merge them.

```javascript
// Get data from both branches
const featureData = await db.getBranchData('feature');
const mainData = await db.getBranchData('main');

// Combine arrays
const allUsers = [
  ...mainData.users,
  ...featureData.users.filter(user => !mainData.users.some(u => u.id === user.id))
];

// Create merged data
const merged = {
  ...mainData,
  users: allUsers,
  settings: { ...mainData.settings, theme: featureData.settings.theme }
};

// Save merged result
await db.commit('main', merged, 'Manual merge');
```

---

## API Summary

### **Core**
- `db.init()` - Initialize the database
- `db.commit(branch, data, message)` - Save data
- `db.getData()` - Get current data

### **Branches**
- `db.branch(newBranch, sourceBranch)` - Create a branch
- `db.checkout(branch)` - Switch branches
- `db.listBranches()` - List all branches

### **History & Time Travel**
- `db.getDataAt(branch, timestamp)` - Get historical data
- `db.getHistory(branch)` - Get commit history

