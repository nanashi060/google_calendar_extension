/**
 * Background service worker for Google Calendar Group Manager
 * Handles tab updates and content script injection
 */

/**
 * Initialize extension on install/startup
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Google Calendar Group Manager installed');
});

/**
 * Listen for tab updates to inject content script when Google Calendar is loaded
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only proceed when the page is completely loaded
  if (changeInfo.status !== 'complete') return;
  
  // Check if the tab is Google Calendar
  if (!tab.url || !tab.url.includes('calendar.google.com')) return;
  
  try {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: initializeContentScript,
    });
    console.log('Content script injected for tab:', tabId);
  } catch (error) {
    console.error('Failed to inject content script:', error);
  }
});

/**
 * Function to be injected as content script
 * This checks if the script is already loaded to prevent multiple injections
 */
function initializeContentScript() {
  // Prevent multiple injections
  if (window.calendarGroupManagerLoaded) return;
  window.calendarGroupManagerLoaded = true;
  
  console.log('Google Calendar Group Manager content script initialized');
}

/**
 * Handle messages from popup or content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getActiveTab':
      handleGetActiveTab(sendResponse);
      return true; // Keep message channel open for async response
    
    case 'injectContentScript':
      handleInjectContentScript(message.tabId, sendResponse);
      return true;
    
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

/**
 * Get the currently active tab
 * @param {Function} sendResponse - Response callback
 */
async function handleGetActiveTab(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    sendResponse({ tab });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * Inject content script into specific tab
 * @param {number} tabId - Tab ID to inject script
 * @param {Function} sendResponse - Response callback
 */
async function handleInjectContentScript(tabId, sendResponse) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}