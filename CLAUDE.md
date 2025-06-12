# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension (Manifest V3) that enables grouping functionality for Google Calendar. Users can organize their calendars into groups and toggle visibility with one-click. The extension works exclusively with Google Calendar (calendar.google.com) and stores group settings in chrome.storage.sync.

## Project Structure

```
google_calendar_extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for tab monitoring
├── content.js            # DOM manipulation for calendar visibility
├── popup.html/js/css     # Extension popup UI
├── options.html/js/css   # Settings page for group management
├── README.md             # Installation and usage instructions
└── LICENSE               # MIT license
```

## Development Commands

This is a browser extension with no build process required:

- **Install**: Load unpacked extension from `chrome://extensions/` in developer mode
- **Debug**: Use Chrome DevTools for popup/options, and console logs for content script
- **Test**: Manual testing with Google Calendar page

## Architecture Notes

### Core Components:

1. **Background Service Worker** (`background.js`):
   - Monitors tab updates for Google Calendar
   - Injects content script when needed
   - Handles cross-component communication

2. **Content Script** (`content.js`):
   - Manipulates Google Calendar DOM
   - Uses multiple CSS selectors to handle DOM structure changes
   - Manages calendar visibility by simulating checkbox clicks
   - Stores original states for restoration

3. **Popup Interface** (`popup.*`):
   - Group selection UI
   - Shows/hides calendar groups
   - Communicates with content script via chrome.tabs.sendMessage

4. **Options Page** (`options.*`):
   - Full CRUD for groups
   - Calendar selection from live Google Calendar page
   - Import/export functionality

### Key Technical Details:

- **DOM Targeting**: Uses robust selectors for Google Calendar's 2025-06 structure with fallbacks
- **State Management**: chrome.storage.sync for group persistence
- **Calendar Detection**: Multiple selector strategies for calendar elements
- **Cross-Script Communication**: chrome.runtime.onMessage and chrome.tabs.sendMessage patterns