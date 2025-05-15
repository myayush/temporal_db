# TemporalDB

A lightweight, versioned JSON database with branching, merging, and time-travel capabilities.

## Installation

```bash
npm install temporal-db  
```

## Basic Usage

```javascript
// Initialize  
const db = new TemporalDB();  
await db.init();  

// Save data  
await db.commit('main', {  
  users: [{ id: 1, name: 'Alice' }],  
  settings: { theme: 'light' }  
}, 'Initial commit');  

// Get data  
const data = await db.getData();  
console.log(data);  
```

## Real-world Example: Document Editor

```javascript
// Initialize editor database  
const db = new TemporalDB();  
await db.init();  

// Save initial document  
await db.commit('main', {  
  title: 'My Document',  
  content: 'Hello world',  
  lastEdited: new Date().toISOString()  
}, 'First draft');  

// Make edits  
async function saveChanges(newContent) {  
  const doc = await db.getData();  
  doc.content = newContent;  
  doc.lastEdited = new Date().toISOString();  
  await db.commit('main', doc, 'Updated content');  
}  

// View revision history  
function getHistory() {  
  return db.getHistory('main');  
}  

// Restore old version  
async function restoreVersion(timestamp) {  
  const oldDoc = await db.getDataAt('main', timestamp);  
  await db.commit('main', oldDoc, 'Restored old version');  
  return oldDoc;  
}  

// Create experimental branch  
async function createExperiment() {  
  await db.branch('experiment', 'main');  
  await db.checkout('experiment');  
  
  // Try new formatting  
  const doc = await db.getData();  
  doc.content = doc.content.toUpperCase();  
  await db.commit('experiment', doc, 'ALL CAPS experiment');  
}  

// If experiment works, bring changes back to main  
async function applyExperiment() {  
  await db.checkout('main');  
  await db.merge('experiment', 'main');  
}  
```

## Key Features

### Branching

```javascript
// Create a branch for experiments  
await db.branch('experimental', 'main');  
await db.checkout('experimental');  

// Make changes on this branch only  
const data = await db.getData();  
data.settings.theme = 'dark';  
await db.commit('experimental', data, 'Try dark theme');  
```

### Merging

```javascript
// Go back to main branch  
await db.checkout('main');  

// Bring in changes from experimental branch  
await db.merge('experimental', 'main');  
```

### Time Travel

```javascript
// Get data from a specific time  
const oldData = await db.getDataAt('main', '2023-04-01T12:00:00Z');  

// See all your changes  
const history = await db.getHistory('main');  
```

## Core API

* `db.init()` – Start the database
* `db.commit(branch, data, message)` – Save data with a commit message
* `db.getData()` – Get current data state
* `db.branch(newBranch, source)` – Create a new branch from source
* `db.checkout(branch)` – Switch to a different branch
* `db.merge(source, target)` – Merge source branch into target
* `db.getDataAt(branch, time)` – Retrieve data at a given timestamp
* `db.getHistory(branch)` – List commit history for a branch

## License

MIT
