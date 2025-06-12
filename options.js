/**
 * Options page script for Google Calendar Group Manager
 * Handles group management (CRUD operations) and settings
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
   * Find Google Calendar tab
   * @returns {Promise<Object|null>} Google Calendar tab or null
   */
  async findGoogleCalendarTab() {
    const tabs = await chrome.tabs.query({});
    return tabs.find(tab => tab.url && tab.url.includes('calendar.google.com')) || null;
  },

  /**
   * Send message to content script with retry logic
   * @param {number} tabId - Tab ID
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response from content script
   */
  async sendMessageToContent(tabId, message) {
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      } catch (error) {
        console.log(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        // Try to inject content script if connection failed
        if (error.message.includes('Could not establish connection')) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            });
            console.log('Re-injected content script');
          } catch (injectError) {
            console.log('Failed to re-inject content script:', injectError);
          }
        }
      }
    }
  }
};

/**
 * Main Options Manager class
 */
class OptionsManager {
  constructor() {
    this.groups = {};
    this.availableCalendars = [];
    this.currentEditingGroupId = null;
    this.elements = {};
    this.init();
  }

  /**
   * Initialize options page
   */
  async init() {
    this.setupElements();
    this.setupEventListeners();
    
    // Ensure add group button is enabled
    if (this.elements.addGroupBtn) {
      this.elements.addGroupBtn.disabled = false;
    }
    
    await this.loadGroups();
    await this.loadAvailableCalendars();
  }

  /**
   * Set up DOM element references
   */
  setupElements() {
    this.elements = {
      // Main elements
      addGroupBtn: document.getElementById('addGroupBtn'),
      groupsList: document.getElementById('groupsList'),
      noGroups: document.getElementById('noGroups'),
      
      // Modal elements
      groupModal: document.getElementById('groupModal'),
      deleteModal: document.getElementById('deleteModal'),
      modalTitle: document.getElementById('modalTitle'),
      closeModalBtn: document.getElementById('closeModalBtn'),
      closeDeleteModalBtn: document.getElementById('closeDeleteModalBtn'),
      
      // Form elements
      groupForm: document.getElementById('groupForm'),
      groupName: document.getElementById('groupName'),
      groupNameError: document.getElementById('groupNameError'),
      calendarsList: document.getElementById('calendarsList'),
      noCalendars: document.getElementById('noCalendars'),
      loadingCalendars: document.getElementById('loadingCalendars'),
      loadingMessage: document.getElementById('loadingMessage'),
      calendarsError: document.getElementById('calendarsError'),
      refreshCalendarsBtn: document.getElementById('refreshCalendarsBtn'),
      refreshCalendarsInModal: document.getElementById('refreshCalendarsInModal'),
      openCalendarBtn: document.getElementById('openCalendarBtn'),
      retryLoadCalendars: document.getElementById('retryLoadCalendars'),
      
      // Button elements
      saveBtn: document.getElementById('saveBtn'),
      cancelBtn: document.getElementById('cancelBtn'),
      cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
      confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
      deleteGroupName: document.getElementById('deleteGroupName'),
      
      // Footer elements
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      importFileInput: document.getElementById('importFileInput')
    };
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Add group button
    this.elements.addGroupBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      // Check if button is disabled
      if (this.elements.addGroupBtn.disabled) {
        return;
      }
      
      try {
        await this.showAddGroupModal();
      } catch (error) {
        console.error('Error showing add group modal:', error);
      }
    });

    // Modal close buttons
    this.elements.closeModalBtn.addEventListener('click', () => {
      this.closeGroupModal();
    });

    this.elements.closeDeleteModalBtn.addEventListener('click', () => {
      this.closeDeleteModal();
    });

    // Modal background click
    this.elements.groupModal.addEventListener('click', (e) => {
      if (e.target === this.elements.groupModal) {
        this.closeGroupModal();
      }
    });

    this.elements.deleteModal.addEventListener('click', (e) => {
      if (e.target === this.elements.deleteModal) {
        this.closeDeleteModal();
      }
    });

    // Form submission
    this.elements.groupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSaveGroup();
    });

    // Cancel buttons
    this.elements.cancelBtn.addEventListener('click', () => {
      this.closeGroupModal();
    });

    this.elements.cancelDeleteBtn.addEventListener('click', () => {
      this.closeDeleteModal();
    });

    // Delete confirmation
    this.elements.confirmDeleteBtn.addEventListener('click', () => {
      this.handleDeleteGroup();
    });

    // Refresh calendars
    this.elements.refreshCalendarsBtn.addEventListener('click', () => {
      if (!this.elements.refreshCalendarsBtn.disabled) {
        this.loadAvailableCalendars(true); // Force refresh with scrolling
      }
    });

    // Refresh calendars in modal
    if (this.elements.refreshCalendarsInModal) {
      this.elements.refreshCalendarsInModal.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!this.elements.refreshCalendarsInModal.disabled) {
          await this.handleRefreshCalendarsInModal();
        }
      });
    }

    // Open Google Calendar button (in modal)
    document.addEventListener('click', (e) => {
      if (e.target.id === 'openCalendarBtn' || e.target.closest('#openCalendarBtn')) {
        e.preventDefault();
        window.open('https://calendar.google.com', '_blank');
      }
      
      if (e.target.id === 'retryLoadCalendars' || e.target.closest('#retryLoadCalendars')) {
        e.preventDefault();
        if (!e.target.disabled) {
          this.loadAvailableCalendars(true);
        }
      }
    });

    // Import/Export
    this.elements.exportBtn.addEventListener('click', () => {
      this.handleExportSettings();
    });

    this.elements.importBtn.addEventListener('click', () => {
      this.elements.importFileInput.click();
    });

    this.elements.importFileInput.addEventListener('change', (e) => {
      this.handleImportSettings(e);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeGroupModal();
        this.closeDeleteModal();
      }
    });
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
    }
  }

  /**
   * Load available calendars from Google Calendar
   */
  async loadAvailableCalendars(forceRefresh = false) {
    try {
      console.log('Loading available calendars...', forceRefresh ? '(with force refresh)' : '');
      
      // Show loading state
      this.showLoadingState(forceRefresh);
      
      // Find Google Calendar tab
      const calendarTab = await TabUtils.findGoogleCalendarTab();
      
      if (!calendarTab) {
        console.log('No Google Calendar tab found');
        this.hideLoadingState();
        this.showNoCalendarsState('Google Calendarのタブが見つかりません');
        this.updateLoadingMessage('Google Calendarを開いてください');
        return;
      }

      console.log('Found Google Calendar tab:', calendarTab.id);
      
      // Update loading message with more specific info
      const baseMessage = forceRefresh ? 'カレンダー情報を強制取得中...' : 'カレンダー情報を取得中...';
      this.updateLoadingMessage(`${baseMessage}\n（Google Calendarタブを確認してください）`);

      // Disable retry button during loading
      if (this.elements.retryLoadCalendars) {
        this.elements.retryLoadCalendars.disabled = true;
      }

      // Get calendars from content script
      const action = forceRefresh ? 'forceRefreshCalendars' : 'getCalendars';
      const response = await TabUtils.sendMessageToContent(calendarTab.id, {
        action: action
      });

      console.log('Response from content script:', response);

      if (response.error) {
        throw new Error(response.error);
      }

      this.availableCalendars = response.calendars || [];
      console.log('Available calendars:', this.availableCalendars);
      
      // Hide loading and show results
      this.hideLoadingState();
      this.renderCalendarsList();
      
      // Show success message
      this.showStatusMessage('success', `${this.availableCalendars.length}個のカレンダーを読み込みました`);

    } catch (error) {
      console.error('Error loading calendars:', error);
      this.hideLoadingState();
      this.showNoCalendarsState();
      
      // Show error message with helpful guidance
      const errorMessage = error.message.includes('Could not establish connection') 
        ? 'Google Calendarページを開いて、ページを更新してから再試行してください'
        : `エラー: ${error.message}`;
      this.showStatusMessage('error', errorMessage);
    } finally {
      // Re-enable retry button
      if (this.elements.retryLoadCalendars) {
        this.elements.retryLoadCalendars.disabled = false;
      }
    }
  }

  /**
   * Render groups list
   */
  renderGroups() {
    const groupIds = Object.keys(this.groups);
    
    if (groupIds.length === 0) {
      this.elements.groupsList.style.display = 'none';
      this.elements.noGroups.style.display = 'block';
      return;
    }

    this.elements.groupsList.style.display = 'grid';
    this.elements.noGroups.style.display = 'none';

    // Clear existing groups
    this.elements.groupsList.innerHTML = '';

    // Render each group
    groupIds.forEach(groupId => {
      const group = this.groups[groupId];
      const groupElement = this.createGroupCard(groupId, group);
      this.elements.groupsList.appendChild(groupElement);
    });
  }

  /**
   * Create group card element
   * @param {string} groupId - Group ID
   * @param {Object} group - Group data
   * @returns {HTMLElement} Group card element
   */
  createGroupCard(groupId, group) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.dataset.groupId = groupId;

    const calendarCount = group.calendars ? group.calendars.length : 0;
    const calendarsHtml = group.calendars ? group.calendars.map(calendarId => {
      const calendar = this.availableCalendars.find(cal => cal.id === calendarId);
      const name = calendar ? calendar.name : calendarId;
      return `
        <div class="calendar-item">
          <div class="calendar-dot"></div>
          <span class="calendar-name">${this.escapeHtml(name)}</span>
        </div>
      `;
    }).join('') : '';

    card.innerHTML = `
      <div class="group-card-header">
        <div>
          <div class="group-card-title">${this.escapeHtml(group.name)}</div>
          <div class="group-card-subtitle">${calendarCount}個のカレンダー</div>
        </div>
        <div class="group-card-actions">
          <button class="action-btn edit-btn" title="編集" data-action="edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-btn" title="削除" data-action="delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="group-calendars">
        ${calendarsHtml}
      </div>
    `;

    // Add event listeners for actions
    const editBtn = card.querySelector('[data-action="edit"]');
    const deleteBtn = card.querySelector('[data-action="delete"]');

    editBtn.addEventListener('click', async () => {
      await this.showEditGroupModal(groupId);
    });

    deleteBtn.addEventListener('click', () => {
      this.showDeleteConfirmation(groupId);
    });

    return card;
  }

  /**
   * Render calendars list in modal
   */
  renderCalendarsList() {
    if (this.availableCalendars.length === 0) {
      this.showNoCalendarsState();
      return;
    }

    this.elements.calendarsList.style.display = 'flex';
    this.elements.noCalendars.style.display = 'none';
    this.elements.loadingCalendars.style.display = 'none';

    // Clear existing calendars
    this.elements.calendarsList.innerHTML = '';

    // Render each calendar
    this.availableCalendars.forEach(calendar => {
      const calendarElement = this.createCalendarCheckboxItem(calendar);
      this.elements.calendarsList.appendChild(calendarElement);
    });
  }

  /**
   * Create calendar checkbox item
   * @param {Object} calendar - Calendar data
   * @returns {HTMLElement} Calendar checkbox element
   */
  createCalendarCheckboxItem(calendar) {
    const item = document.createElement('div');
    item.className = 'calendar-checkbox-item';

    const checkboxId = `calendar_${calendar.id}`;
    
    item.innerHTML = `
      <input type="checkbox" id="${checkboxId}" value="${calendar.id}">
      <label for="${checkboxId}">${this.escapeHtml(calendar.name)}</label>
    `;

    return item;
  }

  /**
   * Show no calendars state
   */
  showNoCalendarsState(message = '') {
    this.elements.calendarsList.style.display = 'none';
    this.elements.loadingCalendars.style.display = 'none';
    this.elements.noCalendars.style.display = 'block';
    
    if (message) {
      // Update the message if provided
      const messageElement = this.elements.noCalendars.querySelector('p');
      if (messageElement) {
        messageElement.textContent = message;
      }
    }
  }

  /**
   * Show loading state
   */
  showLoadingState(isForceRefresh = false) {
    this.elements.calendarsList.style.display = 'none';
    this.elements.noCalendars.style.display = 'none';
    this.elements.loadingCalendars.style.display = 'flex';
    
    // Update refresh button state
    this.elements.refreshCalendarsBtn.classList.add('loading');
    this.elements.refreshCalendarsBtn.disabled = true;
    
    // Clear any existing status messages
    this.clearStatusMessages();
    
    const message = isForceRefresh ? 
      'カレンダー情報を強制取得中...' : 
      'カレンダー情報を取得中...';
    this.updateLoadingMessage(message);
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    this.elements.loadingCalendars.style.display = 'none';
    
    // Reset refresh button state
    this.elements.refreshCalendarsBtn.classList.remove('loading');
    this.elements.refreshCalendarsBtn.disabled = false;
  }

  /**
   * Update loading message
   */
  updateLoadingMessage(message) {
    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.textContent = message;
    }
  }

  /**
   * Show status message
   */
  showStatusMessage(type, message) {
    // Remove existing status messages
    this.clearStatusMessages();
    
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.innerHTML = `
      <span class="status-icon">${type === 'success' ? '✓' : '⚠'}</span>
      <span>${message}</span>
    `;
    
    // Insert after the calendar selection area
    const calendarSelection = document.querySelector('.calendar-selection');
    if (calendarSelection) {
      calendarSelection.appendChild(statusDiv);
      
      // Auto-hide success messages after 3 seconds
      if (type === 'success') {
        setTimeout(() => {
          if (statusDiv.parentNode) {
            statusDiv.remove();
          }
        }, 3000);
      }
    }
  }

  /**
   * Clear status messages
   */
  clearStatusMessages() {
    const existingMessages = document.querySelectorAll('.status-message');
    existingMessages.forEach(msg => msg.remove());
  }

  /**
   * Show loading state in modal
   */
  showModalLoadingState() {
    this.elements.calendarsList.style.display = 'none';
    this.elements.noCalendars.style.display = 'none';
    this.elements.loadingCalendars.style.display = 'flex';
    this.updateLoadingMessage('カレンダー情報を読み込み中...');
    
    // Disable refresh button in modal during loading
    if (this.elements.refreshCalendarsInModal) {
      this.elements.refreshCalendarsInModal.disabled = true;
    }
  }

  /**
   * Hide loading state in modal
   */
  hideModalLoadingState() {
    this.elements.loadingCalendars.style.display = 'none';
    
    // Re-enable refresh button in modal
    if (this.elements.refreshCalendarsInModal) {
      this.elements.refreshCalendarsInModal.disabled = false;
    }
  }

  /**
   * Show error state in modal
   */
  showModalErrorState() {
    this.elements.calendarsList.style.display = 'none';
    this.elements.loadingCalendars.style.display = 'none';
    this.elements.noCalendars.style.display = 'block';
    
    // Update the no calendars message to show error
    const messageElement = this.elements.noCalendars.querySelector('p');
    if (messageElement) {
      messageElement.textContent = 'カレンダーの読み込みに失敗しました';
    }
  }

  /**
   * Handle refresh calendars in modal
   */
  async handleRefreshCalendarsInModal() {
    try {
      // Show loading state on button
      this.elements.refreshCalendarsInModal.classList.add('loading');
      this.elements.refreshCalendarsInModal.disabled = true;
      
      // Remember current selections
      const currentSelections = this.getSelectedCalendarIds();
      
      // Show loading state in modal
      this.showModalLoadingState();
      this.updateLoadingMessage('カレンダー一覧を更新中...');
      
      // Force refresh calendars
      await this.loadAvailableCalendars(true);
      
      // Restore selections if possible
      if (currentSelections.length > 0) {
        setTimeout(() => {
          this.setCalendarSelections(currentSelections);
        }, 100);
      }
      
    } catch (error) {
      console.error('Error refreshing calendars in modal:', error);
      this.showModalErrorState();
    } finally {
      // Reset button state
      this.elements.refreshCalendarsInModal.classList.remove('loading');
      this.elements.refreshCalendarsInModal.disabled = false;
    }
  }

  /**
   * Show add group modal
   */
  async showAddGroupModal() {
    this.currentEditingGroupId = null;
    this.elements.modalTitle.textContent = '新しいグループを追加';
    this.elements.groupName.value = '';
    this.clearFormErrors();
    
    // Show modal immediately for better UX
    this.elements.groupModal.style.display = 'flex';
    this.elements.groupName.focus();
    
    // Load calendars in background if not already loaded
    if (this.availableCalendars.length === 0) {
      // Show loading state in modal
      this.showModalLoadingState();
      try {
        await this.loadAvailableCalendars();
        this.hideModalLoadingState();
        this.renderCalendarsList();
      } catch (error) {
        this.hideModalLoadingState();
        this.showModalErrorState();
      }
    } else {
      // Calendars already loaded, just render them
      this.renderCalendarsList();
    }
    
    this.clearCalendarSelections();
  }

  /**
   * Show edit group modal
   * @param {string} groupId - Group ID to edit
   */
  async showEditGroupModal(groupId) {
    const group = this.groups[groupId];
    if (!group) return;

    this.currentEditingGroupId = groupId;
    this.elements.modalTitle.textContent = 'グループを編集';
    this.elements.groupName.value = group.name;
    this.clearFormErrors();
    
    // Show modal immediately
    this.elements.groupModal.style.display = 'flex';
    this.elements.groupName.focus();
    
    // Load calendars in background if not already loaded
    if (this.availableCalendars.length === 0) {
      this.showModalLoadingState();
      try {
        await this.loadAvailableCalendars();
        this.hideModalLoadingState();
        this.renderCalendarsList();
        this.setCalendarSelections(group.calendars || []);
      } catch (error) {
        this.hideModalLoadingState();
        this.showModalErrorState();
      }
    } else {
      // Calendars already loaded
      this.renderCalendarsList();
      this.setCalendarSelections(group.calendars || []);
    }
  }

  /**
   * Close group modal
   */
  closeGroupModal() {
    this.elements.groupModal.style.display = 'none';
    this.currentEditingGroupId = null;
  }

  /**
   * Show delete confirmation modal
   * @param {string} groupId - Group ID to delete
   */
  showDeleteConfirmation(groupId) {
    const group = this.groups[groupId];
    if (!group) return;

    this.currentEditingGroupId = groupId;
    this.elements.deleteGroupName.textContent = group.name;
    this.elements.deleteModal.style.display = 'flex';
  }

  /**
   * Close delete modal
   */
  closeDeleteModal() {
    this.elements.deleteModal.style.display = 'none';
    this.currentEditingGroupId = null;
  }

  /**
   * Clear calendar selections
   */
  clearCalendarSelections() {
    try {
      const checkboxes = this.elements.calendarsList.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
    } catch (error) {
      console.warn('Failed to clear calendar selections:', error);
    }
  }

  /**
   * Set calendar selections
   * @param {Array<string>} calendarIds - Calendar IDs to select
   */
  setCalendarSelections(calendarIds) {
    try {
      this.clearCalendarSelections();
      
      calendarIds.forEach(calendarId => {
        const checkbox = this.elements.calendarsList.querySelector(`input[value="${calendarId}"]`);
        if (checkbox) {
          checkbox.checked = true;
        }
      });
    } catch (error) {
      console.warn('Failed to set calendar selections:', error);
    }
  }

  /**
   * Get selected calendar IDs
   * @returns {Array<string>} Selected calendar IDs
   */
  getSelectedCalendarIds() {
    try {
      const checkboxes = this.elements.calendarsList.querySelectorAll('input[type="checkbox"]:checked');
      return Array.from(checkboxes).map(checkbox => checkbox.value);
    } catch (error) {
      console.warn('Failed to get selected calendar IDs:', error);
      return [];
    }
  }

  /**
   * Clear form errors
   */
  clearFormErrors() {
    this.elements.groupNameError.classList.remove('show');
    this.elements.calendarsError.classList.remove('show');
  }

  /**
   * Show form error
   * @param {string} field - Field name (groupName, calendars)
   * @param {string} message - Error message
   */
  showFormError(field, message) {
    const errorElement = field === 'groupName' ? this.elements.groupNameError : this.elements.calendarsError;
    errorElement.textContent = message;
    errorElement.classList.add('show');
  }

  /**
   * Validate form
   * @returns {boolean} True if form is valid
   */
  validateForm() {
    this.clearFormErrors();
    let isValid = true;

    // Validate group name
    const groupName = this.elements.groupName.value.trim();
    if (!groupName) {
      this.showFormError('groupName', 'グループ名を入力してください');
      isValid = false;
    } else if (groupName.length > 50) {
      this.showFormError('groupName', 'グループ名は50文字以内で入力してください');
      isValid = false;
    } else {
      // Check for duplicate names (excluding current editing group)
      const existingNames = Object.keys(this.groups)
        .filter(id => id !== this.currentEditingGroupId)
        .map(id => this.groups[id].name.toLowerCase());
      
      if (existingNames.includes(groupName.toLowerCase())) {
        this.showFormError('groupName', 'このグループ名は既に使用されています');
        isValid = false;
      }
    }

    // Validate calendar selection
    const selectedCalendars = this.getSelectedCalendarIds();
    if (selectedCalendars.length === 0) {
      this.showFormError('calendars', '少なくとも1つのカレンダーを選択してください');
      isValid = false;
    }

    return isValid;
  }

  /**
   * Handle save group
   */
  async handleSaveGroup() {
    if (!this.validateForm()) return;

    // Show loading state on save button
    const saveBtn = this.elements.saveBtn;
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
      const groupName = this.elements.groupName.value.trim();
      const selectedCalendars = this.getSelectedCalendarIds();

      const groupData = {
        name: groupName,
        calendars: selectedCalendars,
        createdAt: this.currentEditingGroupId ? this.groups[this.currentEditingGroupId].createdAt : Date.now(),
        updatedAt: Date.now()
      };

      // Generate ID if creating new group
      const groupId = this.currentEditingGroupId || this.generateGroupId();

      // Update groups
      this.groups[groupId] = groupData;

      // Save to storage
      await StorageUtils.set({ groups: this.groups });

      // Update UI
      this.renderGroups();
      this.closeGroupModal();

      // Show success message
      const action = this.currentEditingGroupId ? '更新' : '作成';
      this.showStatusMessage('success', `グループ「${groupName}」を${action}しました`);

      console.log(`Group ${this.currentEditingGroupId ? 'updated' : 'created'}:`, groupId);

    } catch (error) {
      console.error('Error saving group:', error);
      this.showFormError('groupName', 'グループの保存に失敗しました');
    } finally {
      // Reset save button
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }

  /**
   * Handle delete group
   */
  async handleDeleteGroup() {
    if (!this.currentEditingGroupId) return;

    try {
      // Remove group
      delete this.groups[this.currentEditingGroupId];

      // Save to storage
      await StorageUtils.set({ groups: this.groups });

      // Update UI
      this.renderGroups();
      this.closeDeleteModal();

      console.log('Group deleted:', this.currentEditingGroupId);

    } catch (error) {
      console.error('Error deleting group:', error);
    }
  }

  /**
   * Generate unique group ID
   * @returns {string} Generated group ID
   */
  generateGroupId() {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle export settings
   */
  handleExportSettings() {
    const settings = {
      groups: this.groups,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar-groups-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Handle import settings
   * @param {Event} event - File input change event
   */
  async handleImportSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const settings = JSON.parse(text);

      if (!settings.groups || typeof settings.groups !== 'object') {
        throw new Error('Invalid settings file format');
      }

      // Confirm import
      const confirmed = confirm(
        `${Object.keys(settings.groups).length}個のグループをインポートしますか？\n` +
        '既存のグループは上書きされる可能性があります。'
      );

      if (!confirmed) return;

      // Import groups
      this.groups = { ...this.groups, ...settings.groups };

      // Save to storage
      await StorageUtils.set({ groups: this.groups });

      // Update UI
      this.renderGroups();

      alert('設定をインポートしました。');

    } catch (error) {
      console.error('Error importing settings:', error);
      alert('設定ファイルの読み込みに失敗しました。正しいファイルを選択してください。');
    }

    // Clear file input
    event.target.value = '';
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

// Initialize options page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});