const { TemporalDB } = require('../../src/index');

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const branchSelect = document.getElementById('branch-select');
  const sourceBranchSelect = document.getElementById('source-branch');
  const mergeBranchSelect = document.getElementById('merge-branch');
  const newBranchInput = document.getElementById('new-branch');
  const dataEditor = document.getElementById('data-editor');
  const commitMessageInput = document.getElementById('commit-message');
  const timeSlider = document.getElementById('time-slider');
  const currentTimeSpan = document.getElementById('current-time');
  const branchesList = document.getElementById('branches-list');
  const logElement = document.getElementById('log');
  
  // Buttons
  const checkoutBtn = document.getElementById('checkout-btn');
  const createBranchBtn = document.getElementById('create-branch-btn');
  const mergeBtn = document.getElementById('merge-btn');
  const saveBtn = document.getElementById('save-btn');
  const resetTimeBtn = document.getElementById('reset-time-btn');
  
  // App state
  let db;
  let currentBranch = '';
  let originalData = {};
  let commitHistory = [];
  let timeTravel = false;
  
  // Initialize the database
  async function initDB() {
    try {
      db = new TemporalDB({ name: 'temporal-db-demo' });
      await db.init();
      log('Database initialized');
      
      await updateBranchList();
      currentBranch = await db.getCurrentBranch();
      await loadData();
      
      updateUI();
    } catch (error) {
      log(`Error initializing database: ${error.message}`, 'error');
    }
  }
  
  // Load data for the current branch
  async function loadData() {
    try {
      originalData = await db.getData();
      dataEditor.value = JSON.stringify(originalData, null, 2);
      await updateCommitHistory();
      timeTravel = false;
      updateTimeSlider();
    } catch (error) {
      log(`Error loading data: ${error.message}`, 'error');
    }
  }
  
  // Load data for a specific commit
  async function loadDataAtCommit(commitIndex) {
    try {
      if (commitIndex >= commitHistory.length) {
        // Load latest data
        return loadData();
      }
      
      const commit = commitHistory[commitIndex];
      originalData = await db.getDataAtCommit(commit.hash);
      dataEditor.value = JSON.stringify(originalData, null, 2);
      timeTravel = true;
      
      currentTimeSpan.textContent = new Date(commit.timestamp).toLocaleString();
    } catch (error) {
      log(`Error loading data at commit: ${error.message}`, 'error');
    }
  }
  
  // Save changes to the current branch
  async function saveChanges() {
    try {
      const editorData = dataEditor.value.trim();
      if (!editorData) {
        log('Error: Data cannot be empty', 'error');
        return;
      }
      
      let data;
      try {
        data = JSON.parse(editorData);
      } catch (e) {
        log(`Error parsing JSON: ${e.message}`, 'error');
        return;
      }
      
      const message = commitMessageInput.value || 'Update data';
      await db.commit(currentBranch, data, message);
      
      log(`Changes committed to ${currentBranch}: ${message}`);
      originalData = data;
      timeTravel = false;
      
      await updateCommitHistory();
      updateTimeSlider();
    } catch (error) {
      log(`Error saving changes: ${error.message}`, 'error');
    }
  }
  
  // Create a new branch
  async function createBranch() {
    const newBranchName = newBranchInput.value.trim();
    if (!newBranchName) {
      log('Error: Branch name is required', 'error');
      return;
    }
    
    const sourceBranch = sourceBranchSelect.value;
    
    try {
      await db.branch(newBranchName, sourceBranch);
      log(`Branch '${newBranchName}' created from '${sourceBranch}'`);
      
      await updateBranchList();
      newBranchInput.value = '';
    } catch (error) {
      log(`Error creating branch: ${error.message}`, 'error');
    }
  }
  
  // Checkout a branch
  async function checkoutBranch() {
    const branchName = branchSelect.value;
    
    try {
      await db.checkout(branchName);
      currentBranch = branchName;
      log(`Switched to branch '${branchName}'`);
      
      await loadData();
      updateUI();
    } catch (error) {
      log(`Error checking out branch: ${error.message}`, 'error');
    }
  }
  
  // Merge branches
  async function mergeBranches() {
    const sourceBranch = mergeBranchSelect.value;
    
    try {
      const mergeResult = await db.merge(sourceBranch, currentBranch);
      
      if (mergeResult.hasConflicts()) {
        log(`Merge has conflicts that need to be resolved`, 'error');
        
        // Simple automatic conflict resolution - always choose the source branch's value
        const conflicts = mergeResult.getConflicts();
        const resolutions = {};
        
        conflicts.forEach(conflict => {
          log(`Conflict at path: ${conflict.path}`);
          resolutions[conflict.path] = conflict.source.value;
        });
        
        // Apply merge with automatic resolutions
        await mergeResult.resolveWith(resolutions, `Merge branch '${sourceBranch}' with automatic conflict resolution`);
        log(`Merged branch '${sourceBranch}' into '${currentBranch}' with automatic conflict resolution`);
      } else {
        await mergeResult.apply(`Merge branch '${sourceBranch}' into '${currentBranch}'`);
        log(`Merged branch '${sourceBranch}' into '${currentBranch}' (no conflicts)`);
      }
      
      await loadData();
    } catch (error) {
      log(`Error merging branches: ${error.message}`, 'error');
    }
  }
  
  // Update the branch list
  async function updateBranchList() {
    try {
      const branches = await db.listBranches();
      currentBranch = await db.getCurrentBranch();
      
      // Clear existing options
      branchSelect.innerHTML = '';
      sourceBranchSelect.innerHTML = '';
      mergeBranchSelect.innerHTML = '';
      
      // Add branches to selects
      branches.forEach(branch => {
        const option1 = document.createElement('option');
        option1.value = branch;
        option1.textContent = branch;
        branchSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = branch;
        option2.textContent = branch;
        sourceBranchSelect.appendChild(option2);
        
        if (branch !== currentBranch) {
          const option3 = document.createElement('option');
          option3.value = branch;
          option3.textContent = branch;
          mergeBranchSelect.appendChild(option3);
        }
      });
      
      // Set current branch as selected
      branchSelect.value = currentBranch;
      
      // Update branches list display
      branchesList.innerHTML = '';
      branches.forEach(branch => {
        const tag = document.createElement('span');
        tag.className = `branch-tag ${branch === currentBranch ? 'current-branch' : ''}`;
        tag.textContent = branch;
        branchesList.appendChild(tag);
      });
      
      // Disable merge button if no other branches
      mergeBtn.disabled = mergeBranchSelect.options.length === 0;
    } catch (error) {
      log(`Error updating branch list: ${error.message}`, 'error');
    }
  }
  
  // Update commit history
  async function updateCommitHistory() {
    try {
      commitHistory = await db.getHistory(currentBranch);
    } catch (error) {
      log(`Error getting commit history: ${error.message}`, 'error');
    }
  }
  
  // Update time slider based on commit history
  function updateTimeSlider() {
    if (commitHistory.length === 0) {
      timeSlider.disabled = true;
      return;
    }
    
    timeSlider.min = 0;
    timeSlider.max = commitHistory.length;
    timeSlider.value = commitHistory.length; // Latest commit
    timeSlider.disabled = false;
    
    currentTimeSpan.textContent = 'Current';
  }
  
  // Update UI elements
  function updateUI() {
    // Update branch select
    branchSelect.value = currentBranch;
    
    // Update save button state
    saveBtn.disabled = timeTravel;
    
    // Update branch list
    Array.from(branchesList.children).forEach(tag => {
      tag.className = `branch-tag ${tag.textContent === currentBranch ? 'current-branch' : ''}`;
    });
  }
  
  // Add a log message
  function log(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = `log-item ${type}`;
    logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logElement.appendChild(logItem);
    logElement.scrollTop = logElement.scrollHeight;
  }
  
  // Event Listeners
  checkoutBtn.addEventListener('click', checkoutBranch);
  createBranchBtn.addEventListener('click', createBranch);
  mergeBtn.addEventListener('click', mergeBranches);
  saveBtn.addEventListener('click', saveChanges);
  
  timeSlider.addEventListener('input', () => {
    const value = parseInt(timeSlider.value);
    loadDataAtCommit(value - 1);
  });
  
  resetTimeBtn.addEventListener('click', loadData);
  
  // Initialize the application
  initDB();
  
  // Add sample data if empty
  setTimeout(async () => {
    try {
      const data = await db.getData();
      
      // If data is empty (new database), add sample data
      if (Object.keys(data).length === 0) {
        const sampleData = {
          users: [
            { id: 1, name: 'Alice', email: 'alice@example.com' }
          ],
          settings: {
            theme: 'light',
            notifications: true
          },
          posts: [
            {
              id: 1,
              title: 'Getting Started with TemporalDB',
              content: 'This is a sample post to demonstrate TemporalDB...',
              author: 1,
              date: new Date().toISOString()
            }
          ]
        };
        
        await db.commit('main', sampleData, 'Initial sample data');
        log('Added sample data');
        await loadData();
      }
    } catch (error) {
      log(`Error adding sample data: ${error.message}`, 'error');
    }
  }, 500);
});