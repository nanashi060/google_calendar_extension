/**
 * Popup script for Google Calendar Group Manager
 * Handles UI interactions and communication with content script
 */

/**
 * Storage utility functions
 */
const StorageUtils = {
  /**
   * Get data from chrome storage
   * @param {string|Array|null} keys - Keys to retrieve
   * @returns {Promise<Object>} Retrieved data
   */
  async get(keys = null) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, resolve);
    });
  },

  /**
   * Set data to chrome storage
   * @param {Object} data - Data to store
   * @returns {Promise<void>}
   */
  async set(data) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(data, resolve);
    });
  }
};

/**
 * Tab utility functions
 */
const TabUtils = {
  /**
   * Get current active tab
   * @returns {Promise<Object>} Current tab
   */
  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  },

  /**
   * Check if current tab is Google Calendar
   * @returns {Promise<boolean>} True if current tab is Google Calendar
   */
  async isGoogleCalendarTab() {
    const tab = await this.getCurrentTab();
    return tab && tab.url && tab.url.includes('calendar.google.com');
  },

  /**
   * Send message to content script
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response from content script
   */
  async sendMessageToContent(message) {
    const tab = await this.getCurrentTab();
    if (!tab) throw new Error('No active tab');
    
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
};

/**
 * Main Popup Manager class
 */
class PopupManager {
  constructor() {
    this.groups = {};
    this.currentActiveGroup = null;
    this.elements = {};
    this.init();
  }

  /**
   * Initialize popup
   */
  async init() {
    this.setupElements();
    this.setupEventListeners();
    await this.loadInitialData();
  }

  /**
   * Set up DOM element references
   */
  setupElements() {
    this.elements = {
      loadingState: document.getElementById('loadingState'),
      errorState: document.getElementById('errorState'),
      mainContent: document.getElementById('mainContent'),
      settingsBtn: document.getElementById('settingsBtn'),
      retryBtn: document.getElementById('retryBtn'),
      showAllBtn: document.getElementById('showAllBtn'),
      groupsList: document.getElementById('groupsList'),
      noGroups: document.getElementById('noGroups'),
      createGroupBtn: document.getElementById('createGroupBtn'),
      groupCount: document.getElementById('groupCount'),
      statusMessage: document.getElementById('statusMessage')
    };
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Settings button
    this.elements.settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Retry button
    this.elements.retryBtn.addEventListener('click', () => {
      this.loadInitialData();
    });

    // Show all button
    this.elements.showAllBtn.addEventListener('click', () => {
      this.handleShowAll();
    });

    // Create group button
    this.elements.createGroupBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.groups) {
        this.loadGroups();
      }
    });
  }

  /**
   * Load initial data
   */
  async loadInitialData() {
    try {
      this.showLoading();
      
      // Check if we're on Google Calendar
      const isGoogleCalendar = await TabUtils.isGoogleCalendarTab();
      if (!isGoogleCalendar) {
        this.showError('Google Calendarを開いてください');
        return;
      }

      // Load groups from storage
      await this.loadGroups();
      
      // Show main content
      this.showMainContent();
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showError('データの読み込みに失敗しました');
    }
  }

  /**
   * Load groups from storage
   */
  async loadGroups() {
    try {
      const { groups = {} } = await StorageUtils.get(['groups']);
      this.groups = groups;
      this.renderGroups();
    } catch (error) {
      console.error('Error loading groups:', error);
      this.showStatusMessage('グループの読み込みに失敗しました', 'error');
    }
  }

  /**
   * Render groups in the UI
   */
  renderGroups() {
    const groupIds = Object.keys(this.groups);
    this.elements.groupCount.textContent = groupIds.length;

    if (groupIds.length === 0) {
      this.elements.groupsList.style.display = 'none';
      this.elements.noGroups.style.display = 'flex';
      return;
    }

    this.elements.groupsList.style.display = 'flex';
    this.elements.noGroups.style.display = 'none';

    // Clear existing groups
    this.elements.groupsList.innerHTML = '';

    // Render each group
    groupIds.forEach(groupId => {
      const group = this.groups[groupId];
      const groupElement = this.createGroupElement(groupId, group);
      this.elements.groupsList.appendChild(groupElement);
    });
  }

  /**
   * Create group element
   * @param {string} groupId - Group ID
   * @param {Object} group - Group data
   * @returns {HTMLElement} Group element
   */
  createGroupElement(groupId, group) {
    const groupElement = document.createElement('div');
    groupElement.className = 'group-item';
    groupElement.dataset.groupId = groupId;

    const calendarCount = group.calendars ? group.calendars.length : 0;
    const calendarText = calendarCount === 1 ? 'カレンダー' : 'カレンダー';

    groupElement.innerHTML = `
      <div class="group-info">
        <div class="group-name">${this.escapeHtml(group.name)}</div>
        <div class="group-calendars">${calendarCount}個の${calendarText}</div>
      </div>
      <div class="group-status">
        <span class="status-dot"></span>
        <span class="status-text">非表示</span>
      </div>
    `;

    // Add click handler
    groupElement.addEventListener('click', () => {
      this.handleGroupClick(groupId);
    });

    return groupElement;
  }

  /**
   * Handle group click
   * @param {string} groupId - Group ID that was clicked
   */
  async handleGroupClick(groupId) {
    try {
      // Show loading state on the clicked group
      const groupElement = document.querySelector(`[data-group-id="${groupId}"]`);
      if (groupElement) {
        groupElement.classList.add('loading');
        // Update status to show loading
        const statusText = groupElement.querySelector('.status-text');
        const statusDot = groupElement.querySelector('.status-dot');
        if (statusText) statusText.textContent = '切り替え中...';
        if (statusDot) statusDot.classList.add('loading');
      }
      
      this.showStatusMessage('グループを切り替えています...', 'info');
      
      // Send message to content script
      const response = await TabUtils.sendMessageToContent({
        action: 'toggleGroup',
        groupId: groupId
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Update UI state
      this.currentActiveGroup = response.activeGroup;
      this.updateGroupStates();
      
      if (this.currentActiveGroup === groupId) {
        this.showStatusMessage(`「${this.groups[groupId].name}」グループを表示中`, 'success');
      } else {
        this.showStatusMessage('すべてのカレンダーを表示中', 'success');
      }

    } catch (error) {
      console.error('Error toggling group:', error);
      this.showStatusMessage('グループの切り替えに失敗しました', 'error');
    } finally {
      // Remove loading state
      const groupElement = document.querySelector(`[data-group-id="${groupId}"]`);
      if (groupElement) {
        groupElement.classList.remove('loading');
        // Restore proper status
        this.updateGroupStates();
      }
    }
  }

  /**
   * Handle show all button click
   */
  async handleShowAll() {
    try {
      // Show loading state on show all button
      const showAllBtn = this.elements.showAllBtn;
      if (showAllBtn) {
        showAllBtn.classList.add('loading');
        showAllBtn.disabled = true;
      }
      
      this.showStatusMessage('すべてのカレンダーを表示しています...', 'info');
      
      // Send message to content script
      const response = await TabUtils.sendMessageToContent({
        action: 'showAllCalendars'
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Update UI state
      this.currentActiveGroup = null;
      this.updateGroupStates();
      this.showStatusMessage('すべてのカレンダーを表示中', 'success');

    } catch (error) {
      console.error('Error showing all calendars:', error);
      this.showStatusMessage('カレンダーの表示に失敗しました', 'error');
    } finally {
      // Remove loading state
      const showAllBtn = this.elements.showAllBtn;
      if (showAllBtn) {
        showAllBtn.classList.remove('loading');
        showAllBtn.disabled = false;
      }
    }
  }

  /**
   * Update group states in UI
   */
  updateGroupStates() {
    // Update show all button
    if (this.currentActiveGroup === null) {
      this.elements.showAllBtn.classList.add('active');
    } else {
      this.elements.showAllBtn.classList.remove('active');
    }

    // Update group items
    const groupItems = this.elements.groupsList.querySelectorAll('.group-item');
    groupItems.forEach(item => {
      const groupId = item.dataset.groupId;
      const statusText = item.querySelector('.status-text');
      
      if (this.currentActiveGroup === groupId) {
        item.classList.add('active');
        statusText.textContent = '表示中';
      } else {
        item.classList.remove('active');
        statusText.textContent = '非表示';
      }
    });
  }

  /**
   * Show loading state
   */
  showLoading() {
    this.elements.loadingState.style.display = 'flex';
    this.elements.errorState.style.display = 'none';
    this.elements.mainContent.style.display = 'none';
  }

  /**
   * Show error state
   * @param {string} message - Error message
   */
  showError(message) {
    this.elements.errorState.style.display = 'flex';
    this.elements.errorState.querySelector('.error-message').textContent = message;
    this.elements.loadingState.style.display = 'none';
    this.elements.mainContent.style.display = 'none';
  }

  /**
   * Show main content
   */
  showMainContent() {
    this.elements.mainContent.style.display = 'flex';
    this.elements.loadingState.style.display = 'none';
    this.elements.errorState.style.display = 'none';
  }

  /**
   * Show status message
   * @param {string} message - Status message
   * @param {string} type - Message type (success, error, info)
   */
  showStatusMessage(message, type = 'info') {
    this.elements.statusMessage.textContent = message;
    this.elements.statusMessage.className = `status-message ${type}`;
    
    // Clear message after 3 seconds for success/info messages
    if (type !== 'error') {
      setTimeout(() => {
        this.elements.statusMessage.textContent = '';
        this.elements.statusMessage.className = 'status-message';
      }, 3000);
    }
  }

  /**
   * Escape HTML characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});