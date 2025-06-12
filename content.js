/**
 * Content script for Google Calendar Group Manager
 * Handles DOM manipulation to show/hide calendars based on groups
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
 * Calendar DOM manipulation utilities
 */
const CalendarDOM = {
  /**
   * Get all calendar elements from the sidebar
   * Uses multiple selectors to handle Google Calendar's DOM structure as of 2025-06
   * @returns {Array<Element>} Array of calendar elements
   */
  async getCalendarElements(forceExpand = false) {
    console.log('Starting calendar element search...', forceExpand ? '(with aggressive expansion)' : '');
    
    // First, let's inspect the page structure
    this.debugPageStructure();
    
    const elements = new Set();
    
    // Only expand/scroll when explicitly requested (forceExpand = true)
    if (forceExpand) {
      console.log('Step 0: Aggressively expanding and revealing calendars...');
      await this.expandAndRevealAllCalendars();
      
      // Additional step: Monitor for dynamically loaded elements
      await this.monitorForDynamicElements(elements);
    }
    
    // Approach 1: Look for specific calendar sections
    console.log('Approach 1: Looking for calendar sections...');
    this.findCalendarsInSections(elements);
    
    // Approach 2: Look for checkboxes anywhere on the page
    console.log('Approach 2: Finding all checkboxes...');
    this.findCalendarsFromCheckboxes(elements);
    
    // Approach 3: Look for sidebar structure
    console.log('Approach 3: Looking for sidebar structure...');
    this.findCalendarsInSidebar(elements);
    
    // Approach 4: Look for specific Google Calendar patterns
    console.log('Approach 4: Looking for Google Calendar specific patterns...');
    this.findCalendarsWithGooglePatterns(elements);
    
    // Approach 5: Force render hidden virtual elements
    if (forceExpand) {
      console.log('Approach 5: Forcing virtual element rendering...');
      await this.forceRenderVirtualElements(elements);
    }
    
    console.log(`Found ${elements.size} calendar elements total`);
    return Array.from(elements);
  },

  /**
   * Monitor for dynamically loaded elements using MutationObserver
   */
  async monitorForDynamicElements(elements) {
    return new Promise((resolve) => {
      console.log('Monitoring for dynamic elements...');
      
      let elementCount = elements.size;
      let stableCount = 0;
      
      const observer = new MutationObserver((mutations) => {
        let hasChanges = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if new node contains calendar elements
                const checkboxes = node.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                  const container = this.findCalendarContainer(checkbox);
                  if (container && this.isCalendarItem(container)) {
                    console.log('Dynamic calendar element found:', this.getCalendarName(container));
                    elements.add(container);
                    hasChanges = true;
                  }
                });
              }
            });
          }
        });
        
        if (hasChanges) {
          elementCount = elements.size;
          stableCount = 0;
        } else {
          stableCount++;
        }
        
        // Stop monitoring if no changes for 5 iterations
        if (stableCount >= 5) {
          observer.disconnect();
          resolve();
        }
      });
      
      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // Timeout after 3 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 3000);
    });
  },

  /**
   * Force render virtual elements by manipulating their containers
   */
  async forceRenderVirtualElements(elements) {
    const containers = this.findScrollableCalendarContainers();
    
    for (const container of containers) {
      // Force container to render all children
      await this.forceContainerRender(container, elements);
    }
  },

  /**
   * Force a container to render all virtual children
   */
  async forceContainerRender(container, elements) {
    console.log('Force rendering container children...');
    
    // Method 1: Change container size to force rerender
    const originalHeight = container.style.height;
    const originalMaxHeight = container.style.maxHeight;
    
    container.style.height = 'auto';
    container.style.maxHeight = 'none';
    
    await this.wait(100);
    
    // Check for new elements
    this.findCalendarsFromCheckboxes(elements);
    
    // Method 2: Force CSS changes that trigger rerender
    container.style.transform = 'translateZ(0)';
    await this.wait(50);
    container.style.transform = '';
    
    // Check again
    this.findCalendarsFromCheckboxes(elements);
    
    // Method 3: Force viewport calculations
    if (container.scrollIntoView) {
      container.scrollIntoView({ behavior: 'instant' });
      await this.wait(50);
    }
    
    // Restore original styles
    container.style.height = originalHeight;
    container.style.maxHeight = originalMaxHeight;
    
    await this.wait(100);
    
    // Final check
    this.findCalendarsFromCheckboxes(elements);
  },

  /**
   * Expand calendar sections and scroll to reveal all hidden calendars
   * Aggressive approach to handle virtual scrolling
   */
  async expandAndRevealAllCalendars() {
    try {
      console.log('Starting aggressive calendar reveal process for virtual scrolling...');

      // Step 1: Expand collapsed sections
      await this.expandCalendarSections();

      // Step 2: Force virtual scroll rendering
      await this.forceVirtualScrollRendering();

      // Step 3: Trigger scroll events to load hidden items
      await this.triggerScrollEvents();

      // Step 4: Force DOM updates
      await this.forceDOMUpdates();

      // Wait for final rendering
      await this.wait(1000);

    } catch (error) {
      console.warn('Error during aggressive expansion/scrolling:', error);
    }
  },

  /**
   * Expand calendar sections more aggressively
   * Also ensures "Other calendars" section is collapsed for better virtual scroll handling
   */
  async expandCalendarSections() {
    console.log('Managing calendar sections...');
    
    // First, collapse "Other calendars" section if it's expanded
    await this.collapseOtherCalendarsSection();
    
    // Then expand any other collapsed sections in calendar area
    const expandableElements = [
      // Direct aria-expanded buttons (but not "Other calendars")
      '[aria-expanded="false"]',
      // Buttons with expand-related text
      'button[aria-label*="expand"]',
      'button[aria-label*="show"]',
      'button[aria-label*="展開"]',
      'button[aria-label*="表示"]',
      // Common collapse/expand patterns
      '.collapsed',
      '[data-collapsed="true"]',
      // Google specific patterns
      '[jsname][aria-expanded="false"]'
    ];

    for (const selector of expandableElements) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        // Only click if it's in calendar areas and NOT the "Other calendars" section
        if (this.isNearCalendarArea(element) && !this.isOtherCalendarsToggle(element)) {
          try {
            console.log('Expanding element:', element.getAttribute('aria-label') || element.textContent?.trim());
            element.click();
            await this.wait(200);
          } catch (e) {
            console.warn('Failed to expand:', e);
          }
        }
      }
    }
  },

  /**
   * Collapse the "Other calendars" section to improve virtual scroll detection
   */
  async collapseOtherCalendarsSection() {
    console.log('Collapsing "Other calendars" section for better detection...');
    
    // Look for "Other calendars" section toggle buttons
    const otherCalendarsSelectors = [
      // Specific selectors for "Other calendars" section
      '[aria-label*="Other calendars"][aria-expanded="true"]',
      '[aria-label*="他のカレンダー"][aria-expanded="true"]',
      '[data-drawer="other-calendars"] [aria-expanded="true"]',
      // Text-based search
      'button[aria-expanded="true"]'
    ];

    for (const selector of otherCalendarsSelectors) {
      const buttons = document.querySelectorAll(selector);
      for (const button of buttons) {
        if (this.isOtherCalendarsToggle(button)) {
          try {
            console.log('Collapsing "Other calendars" section:', button.getAttribute('aria-label') || button.textContent?.trim());
            button.click();
            await this.wait(300); // Wait for collapse animation
            
            // Wait a bit more for virtual scroll to settle
            await this.wait(500);
            break; // Only collapse once
          } catch (e) {
            console.warn('Failed to collapse "Other calendars":', e);
          }
        }
      }
    }

    // Alternative approach: look for text content
    const textSearchXPath = [
      '//button[contains(text(), "Other calendars") and @aria-expanded="true"]',
      '//button[contains(text(), "他のカレンダー") and @aria-expanded="true"]'
    ];

    for (const xpath of textSearchXPath) {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const button = result.singleNodeValue;
      
      if (button) {
        try {
          console.log('Collapsing "Other calendars" via XPath:', button.textContent?.trim());
          button.click();
          await this.wait(300);
          await this.wait(500);
          break;
        } catch (e) {
          console.warn('Failed to collapse via XPath:', e);
        }
      }
    }
  },

  /**
   * Check if a button is the "Other calendars" section toggle
   */
  isOtherCalendarsToggle(button) {
    const ariaLabel = button.getAttribute('aria-label') || '';
    const textContent = button.textContent || '';
    
    // Check for "Other calendars" related text
    const otherCalendarsPatterns = [
      'other calendars', '他のカレンダー', 'otros calendarios', 
      'autres calendriers', 'andere kalender', 'altri calendari'
    ];
    
    return otherCalendarsPatterns.some(pattern => 
      ariaLabel.toLowerCase().includes(pattern.toLowerCase()) ||
      textContent.toLowerCase().includes(pattern.toLowerCase())
    ) || button.closest('[data-drawer="other-calendars"]');
  },

  /**
   * Check if element is near calendar area
   */
  isNearCalendarArea(element) {
    // Check if element is within calendar-related containers
    const calendarContainers = [
      'aside', '[role="navigation"]', '[role="complementary"]',
      '[data-drawer*="calendar"]', '[aria-label*="calendar"]', '[aria-label*="カレンダー"]'
    ];
    
    return calendarContainers.some(selector => element.closest(selector));
  },

  /**
   * Force virtual scroll rendering by manipulating scroll positions
   */
  async forceVirtualScrollRendering() {
    console.log('Forcing virtual scroll rendering...');
    
    const scrollableContainers = this.findScrollableCalendarContainers();
    
    for (const container of scrollableContainers) {
      console.log('Processing scrollable container:', container);
      
      // Get initial state
      const initialScrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      
      if (scrollHeight <= clientHeight) continue;
      
      // Method 1: Rapid scroll through entire height
      await this.rapidScrollThrough(container);
      
      // Method 2: Scroll to specific positions to trigger rendering
      await this.scrollToSpecificPositions(container);
      
      // Method 3: Simulate user scroll behavior
      await this.simulateUserScrolling(container);
      
      // Restore original position
      container.scrollTop = initialScrollTop;
      await this.wait(100);
    }
  },

  /**
   * Find all scrollable calendar containers
   */
  findScrollableCalendarContainers() {
    const containers = [];
    
    // Check common calendar container selectors
    const selectors = [
      'aside', '[role="navigation"]', '[role="complementary"]',
      '[data-drawer*="calendar"]', '[aria-label*="calendar"]', '[aria-label*="カレンダー"]',
      '[role="list"]', '[role="listbox"]', '.calendar-list'
    ];
    
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (this.isScrollable(element)) {
          containers.push(element);
        }
      });
    });
    
    // Also check any scrollable parent of calendar elements
    const checkboxes = document.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      let parent = checkbox.parentElement;
      while (parent && parent !== document.body) {
        if (this.isScrollable(parent) && !containers.includes(parent)) {
          containers.push(parent);
          break;
        }
        parent = parent.parentElement;
      }
    });
    
    console.log(`Found ${containers.length} scrollable containers`);
    return containers;
  },

  /**
   * Rapid scroll through container to trigger virtual rendering
   */
  async rapidScrollThrough(container) {
    const scrollHeight = container.scrollHeight;
    const step = 50; // Small steps to trigger more renders
    
    // Scroll down rapidly
    for (let pos = 0; pos <= scrollHeight; pos += step) {
      container.scrollTop = pos;
      await this.wait(10); // Very short wait to trigger rendering
    }
    
    // Scroll up rapidly
    for (let pos = scrollHeight; pos >= 0; pos -= step) {
      container.scrollTop = pos;
      await this.wait(10);
    }
  },

  /**
   * Scroll to specific positions that might trigger rendering
   */
  async scrollToSpecificPositions(container) {
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Try strategic positions
    const positions = [
      0, // Top
      clientHeight / 2, // Half viewport
      clientHeight, // One viewport
      clientHeight * 1.5, // 1.5 viewports
      clientHeight * 2, // 2 viewports
      scrollHeight / 4, // Quarter way
      scrollHeight / 2, // Halfway
      scrollHeight * 0.75, // 3/4 way
      scrollHeight - clientHeight, // Near bottom
      scrollHeight // Bottom
    ];
    
    for (const pos of positions) {
      if (pos <= scrollHeight) {
        container.scrollTop = pos;
        await this.wait(100);
        
        // Force reflow
        container.offsetHeight;
      }
    }
  },

  /**
   * Simulate natural user scrolling behavior
   */
  async simulateUserScrolling(container) {
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Simulate wheel events
    for (let i = 0; i < 10; i++) {
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: clientHeight / 4,
        bubbles: true,
        cancelable: true
      });
      container.dispatchEvent(wheelEvent);
      await this.wait(50);
    }
    
    // Simulate smooth scrolling
    if (container.scrollTo) {
      container.scrollTo({ top: scrollHeight, behavior: 'smooth' });
      await this.wait(300);
      container.scrollTo({ top: 0, behavior: 'smooth' });
      await this.wait(300);
    }
  },

  /**
   * Trigger scroll events to force virtual list updates
   */
  async triggerScrollEvents() {
    console.log('Triggering scroll events...');
    
    const scrollableContainers = this.findScrollableCalendarContainers();
    
    for (const container of scrollableContainers) {
      // Dispatch various scroll-related events
      const events = ['scroll', 'scrollstart', 'scrollend'];
      
      events.forEach(eventType => {
        try {
          const event = new Event(eventType, {
            bubbles: true,
            cancelable: true
          });
          container.dispatchEvent(event);
        } catch (e) {
          console.warn(`Failed to dispatch ${eventType}:`, e);
        }
      });
      
      await this.wait(100);
    }
  },

  /**
   * Force DOM updates and reflows
   */
  async forceDOMUpdates() {
    console.log('Forcing DOM updates...');
    
    // Force reflow on body
    document.body.offsetHeight;
    
    // Force reflow on potential calendar containers
    const containers = document.querySelectorAll('aside, [role="navigation"], [role="complementary"]');
    containers.forEach(container => {
      container.offsetHeight;
    });
    
    // Trigger resize events
    window.dispatchEvent(new Event('resize'));
    await this.wait(100);
    
    // Force style recalculation
    const style = document.createElement('style');
    style.textContent = '/* force recalc */';
    document.head.appendChild(style);
    await this.wait(50);
    document.head.removeChild(style);
  },


  /**
   * Check if an element is scrollable
   */
  isScrollable(element) {
    const style = window.getComputedStyle(element);
    const hasScrollableOverflow = style.overflow === 'auto' || 
                                 style.overflow === 'scroll' ||
                                 style.overflowY === 'auto' || 
                                 style.overflowY === 'scroll';
    const hasScrollableContent = element.scrollHeight > element.clientHeight;
    
    return hasScrollableOverflow && hasScrollableContent;
  },


  /**
   * Wait for specified milliseconds
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Find calendars in specific sections (My calendars, Other calendars)
   */
  findCalendarsInSections(elements) {
    const sectionSelectors = [
      // My calendars section
      '[data-drawer="my-calendars"]',
      '[aria-label*="マイカレンダー"]',
      '[aria-label*="My calendars"]',
      // Other calendars section
      '[data-drawer="other-calendars"]',
      '[aria-label*="他のカレンダー"]',
      '[aria-label*="Other calendars"]',
      // Generic calendar sections
      '[role="group"][aria-label*="calendar"]',
      '[role="group"][aria-label*="カレンダー"]'
    ];

    sectionSelectors.forEach(selector => {
      const section = document.querySelector(selector);
      if (section) {
        console.log(`Found calendar section: ${selector}`);
        const checkboxes = section.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
        console.log(`Section contains ${checkboxes.length} checkboxes`);
        
        checkboxes.forEach(checkbox => {
          const container = this.findCalendarContainer(checkbox);
          if (container && this.isCalendarItem(container)) {
            console.log('Found calendar in section:', this.getCalendarName(container));
            elements.add(container);
          }
        });
      }
    });
  },

  /**
   * Find calendars from all checkboxes on the page
   */
  findCalendarsFromCheckboxes(elements) {
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
    console.log(`Found ${allCheckboxes.length} total checkboxes`);
    
    allCheckboxes.forEach((checkbox, index) => {
      const container = this.findCalendarContainer(checkbox);
      if (container && this.isCalendarItem(container)) {
        const calendarName = this.getCalendarName(container);
        console.log(`Checkbox ${index}: Found calendar "${calendarName}"`);
        elements.add(container);
      }
    });
  },

  /**
   * Find calendars in sidebar areas
   */
  findCalendarsInSidebar(elements) {
    const sidebarSelectors = [
      'aside',
      '[role="navigation"]',
      '[role="complementary"]',
      '.gb_pc', // Google sidebar class
      '[data-testid*="sidebar"]',
      '[data-testid*="calendar"]',
      '[class*="sidebar"]',
      '[class*="nav"]'
    ];
    
    sidebarSelectors.forEach(selector => {
      const sidebar = document.querySelector(selector);
      if (sidebar) {
        console.log(`Found sidebar with selector: ${selector}`);
        const sidebarCheckboxes = sidebar.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
        console.log(`Sidebar contains ${sidebarCheckboxes.length} checkboxes`);
        
        sidebarCheckboxes.forEach(checkbox => {
          const container = this.findCalendarContainer(checkbox);
          if (container && this.isCalendarItem(container)) {
            elements.add(container);
          }
        });
      }
    });
  },

  /**
   * Find calendars using Google Calendar specific patterns
   */
  findCalendarsWithGooglePatterns(elements) {
    // Look for Google Calendar specific class patterns
    const googlePatterns = [
      '[class*="calendar"]',
      '[class*="Calendar"]',
      '[jsname]', // Google often uses jsname attribute
      '[data-eventid]',
      '[data-calendarid]',
      '[id*="calendar"]',
      '[id*="Calendar"]'
    ];

    googlePatterns.forEach(pattern => {
      const patternElements = document.querySelectorAll(pattern);
      patternElements.forEach(element => {
        const checkbox = element.querySelector('input[type="checkbox"], [role="checkbox"]');
        if (checkbox) {
          const container = this.findCalendarContainer(checkbox);
          if (container && this.isCalendarItem(container)) {
            console.log(`Found calendar with pattern ${pattern}:`, this.getCalendarName(container));
            elements.add(container);
          }
        }
      });
    });

    // Look for text patterns that indicate calendar sections
    const textPatterns = [
      'マイカレンダー', 'My calendars', 'my calendars',
      '他のカレンダー', 'Other calendars', 'other calendars',
      'カレンダー', 'Calendar', 'calendar'
    ];

    textPatterns.forEach(pattern => {
      const xpath = `//div[contains(text(), "${pattern}") or contains(@aria-label, "${pattern}")]`;
      const result = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
      
      for (let i = 0; i < result.snapshotLength; i++) {
        const element = result.snapshotItem(i);
        console.log(`Found text pattern "${pattern}" in element:`, element);
        
        // Look for checkboxes in the parent or siblings
        const parent = element.parentElement;
        if (parent) {
          const nearbyCheckboxes = parent.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
          nearbyCheckboxes.forEach(checkbox => {
            const container = this.findCalendarContainer(checkbox);
            if (container && this.isCalendarItem(container)) {
              elements.add(container);
            }
          });
        }
      }
    });
  },

  /**
   * Find the appropriate container for a checkbox
   */
  findCalendarContainer(checkbox) {
    const containers = [
      checkbox.closest('li'),
      checkbox.closest('div[role="listitem"]'),
      checkbox.closest('label'),
      checkbox.closest('[data-calendarid]'),
      checkbox.closest('[data-eventid]'),
      checkbox.closest('[jsname]'),
      checkbox.closest('div[class*="calendar"]'),
      checkbox.closest('div[class*="Calendar"]'),
      checkbox.parentElement,
      checkbox.parentElement?.parentElement,
      checkbox.parentElement?.parentElement?.parentElement
    ].filter(Boolean);

    // Return the most specific container that seems to be a calendar item
    for (const container of containers) {
      if (container && container !== document.body && container !== document.documentElement) {
        const hasText = container.textContent?.trim().length > 0;
        const hasReasonableSize = container.textContent?.trim().length < 200;
        if (hasText && hasReasonableSize) {
          return container;
        }
      }
    }

    return checkbox.parentElement;
  },

  /**
   * Debug page structure for troubleshooting
   */
  debugPageStructure() {
    console.log('=== PAGE STRUCTURE DEBUG ===');
    console.log('URL:', window.location.href);
    console.log('Title:', document.title);
    
    // Check for common Google Calendar elements
    const commonElements = {
      'aside': document.querySelectorAll('aside').length,
      'nav': document.querySelectorAll('nav').length,
      '[role="navigation"]': document.querySelectorAll('[role="navigation"]').length,
      '[role="complementary"]': document.querySelectorAll('[role="complementary"]').length,
      '[role="checkbox"]': document.querySelectorAll('[role="checkbox"]').length,
      'input[type="checkbox"]': document.querySelectorAll('input[type="checkbox"]').length,
      '[role="list"]': document.querySelectorAll('[role="list"]').length,
      'ul': document.querySelectorAll('ul').length,
      'li': document.querySelectorAll('li').length
    };
    
    console.log('Element counts:', commonElements);

    // Check for calendar-specific sections
    console.log('=== CALENDAR SECTIONS ===');
    const calendarSections = [
      '[data-drawer="my-calendars"]',
      '[data-drawer="other-calendars"]',
      '[aria-label*="マイカレンダー"]',
      '[aria-label*="My calendars"]',
      '[aria-label*="他のカレンダー"]',
      '[aria-label*="Other calendars"]'
    ];

    calendarSections.forEach(selector => {
      const section = document.querySelector(selector);
      if (section) {
        const toggleButton = section.querySelector('[aria-expanded]') || section.closest('[aria-expanded]');
        const isExpanded = toggleButton ? toggleButton.getAttribute('aria-expanded') === 'true' : 'unknown';
        
        console.log(`Found section: ${selector}`);
        console.log('  - Text content:', section.textContent?.trim()?.substring(0, 100));
        console.log('  - Checkboxes:', section.querySelectorAll('[role="checkbox"], input[type="checkbox"]').length);
        console.log('  - Expanded state:', isExpanded);
        console.log('  - Toggle button:', toggleButton ? (toggleButton.getAttribute('aria-label') || toggleButton.textContent?.trim()) : 'none');
      } else {
        console.log(`Section not found: ${selector}`);
      }
    });

    // Check for "Other calendars" toggle buttons specifically
    console.log('=== OTHER CALENDARS TOGGLES ===');
    const otherCalendarsButtons = document.querySelectorAll('button[aria-expanded]');
    otherCalendarsButtons.forEach((button, index) => {
      if (this.isOtherCalendarsToggle && this.isOtherCalendarsToggle(button)) {
        console.log(`Other calendars toggle ${index}:`, {
          ariaLabel: button.getAttribute('aria-label'),
          textContent: button.textContent?.trim(),
          expanded: button.getAttribute('aria-expanded'),
          visible: button.offsetParent !== null
        });
      }
    });

    // Look for text patterns
    console.log('=== TEXT PATTERNS ===');
    const textPatterns = ['マイカレンダー', 'My calendars', '他のカレンダー', 'Other calendars'];
    textPatterns.forEach(pattern => {
      const xpath = `//*[contains(text(), "${pattern}")]`;
      const result = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
      console.log(`Pattern "${pattern}": ${result.snapshotLength} matches`);
      
      for (let i = 0; i < Math.min(3, result.snapshotLength); i++) {
        const element = result.snapshotItem(i);
        console.log(`  Match ${i}:`, element.tagName, element.textContent?.trim()?.substring(0, 50));
      }
    });
    
    // Sample some elements to see their structure
    const sampleCheckboxes = document.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
    console.log('=== SAMPLE CHECKBOXES ===');
    for (let i = 0; i < Math.min(10, sampleCheckboxes.length); i++) {
      const cb = sampleCheckboxes[i];
      const container = this.findCalendarContainer(cb);
      console.log(`Checkbox ${i}:`, {
        tagName: cb.tagName,
        type: cb.type,
        role: cb.getAttribute('role'),
        ariaLabel: cb.getAttribute('aria-label'),
        containerText: container?.textContent?.trim()?.substring(0, 50),
        isCalendarItem: container ? this.isCalendarItem(container) : false
      });
    }
    console.log('=== END DEBUG ===');
  },

  /**
   * Check if an element represents a calendar item
   * @param {Element} element - Element to check
   * @returns {boolean} True if element is a calendar item
   */
  isCalendarItem(element) {
    if (!element) return false;
    
    // Must have a checkbox (either itself or contains one)
    const hasCheckbox = element.matches('[role="checkbox"], input[type="checkbox"]') || 
                       element.querySelector('[role="checkbox"], input[type="checkbox"]');
    if (!hasCheckbox) return false;
    
    // Get text content for analysis
    const textContent = element.textContent || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';
    const allText = `${textContent} ${ariaLabel} ${title}`.toLowerCase();
    
    // Must have some text content
    if (!textContent.trim() && !ariaLabel && !title) return false;
    
    // Skip obvious system items (but be very specific)
    const systemItems = [
      'tasks', 'reminders', 'タスク', 'リマインダー', 
      'birthdays', '誕生日', 'holidays', '祝日',
      'フォローアップ', 'follow-up'
    ];
    
    const isSystemItem = systemItems.some(item => {
      const text = textContent.toLowerCase().trim();
      const label = ariaLabel.toLowerCase().trim();
      const titleText = title.toLowerCase().trim();
      
      // Exact match or surrounded by spaces/punctuation
      return text === item || 
             label === item ||
             titleText === item ||
             new RegExp(`\\b${item}\\b`).test(text) ||
             new RegExp(`\\b${item}\\b`).test(label) ||
             new RegExp(`\\b${item}\\b`).test(titleText);
    });
    
    if (isSystemItem) {
      console.log('Skipping system item:', textContent.trim().substring(0, 30));
      return false;
    }
    
    // Indicators that suggest this is a calendar
    const calendarIndicators = [
      // Email patterns (common for shared calendars)
      '@gmail.com', '@googlemail.com', '@group.calendar.google.com',
      '@outlook.com', '@hotmail.com', '@yahoo.com',
      // Calendar-related keywords
      'calendar', 'カレンダー', 'schedule', 'スケジュール',
      'event', 'イベント', 'meeting', 'ミーティング',
      // Common calendar names
      'work', '仕事', 'personal', '個人', 'family', '家族',
      'holiday', '祝日', 'vacation', '休暇',
      'project', 'プロジェクト', 'team', 'チーム'
    ];
    
    const hasCalendarIndicator = calendarIndicators.some(indicator => 
      allText.includes(indicator.toLowerCase())
    );
    
    // Check if it's in a calendar section
    const isInCalendarSection = element.closest('[aria-label*="calendar"], [aria-label*="カレンダー"], [data-drawer*="calendar"]');
    
    // Check for calendar-specific attributes
    const hasCalendarAttributes = element.hasAttribute('data-calendarid') ||
                                 element.hasAttribute('data-eventid') ||
                                 element.closest('[data-calendarid], [data-eventid]') ||
                                 element.querySelector('[data-calendarid], [data-eventid]');
    
    // Accept if it has calendar indicators, attributes, or is in a calendar section
    // Also accept items with reasonable text length (likely user calendars)
    const isValid = hasCalendarIndicator || 
                   isInCalendarSection ||
                   hasCalendarAttributes ||
                   (textContent.trim().length > 0 && 
                    textContent.trim().length < 150 && 
                    !textContent.includes('\n\n')); // Avoid large text blocks
    
    if (isValid) {
      const calendarType = isInCalendarSection ? 
        (isInCalendarSection.getAttribute('aria-label') || isInCalendarSection.getAttribute('data-drawer') || 'section') : 
        'general';
      
      console.log('Valid calendar item found:', {
        element: element.tagName,
        text: textContent.trim().substring(0, 50),
        type: calendarType,
        hasCheckbox: !!hasCheckbox,
        hasCalendarIndicator: hasCalendarIndicator,
        hasCalendarAttributes: !!hasCalendarAttributes,
        isInCalendarSection: !!isInCalendarSection,
        ariaLabel: ariaLabel.substring(0, 50),
        title: title.substring(0, 50)
      });
    }
    
    return isValid;
  },

  /**
   * Get calendar name from element
   * @param {Element} element - Calendar element
   * @returns {string} Calendar name
   */
  getCalendarName(element) {
    // Try multiple methods to extract calendar name
    
    // Method 1: Check for title attribute on element or children
    const titleElement = element.querySelector('[title]');
    if (titleElement && titleElement.title && titleElement.title.trim()) {
      return titleElement.title.trim();
    }

    // Method 2: Check for aria-label on element or children
    const ariaLabelElement = element.querySelector('[aria-label]');
    if (ariaLabelElement) {
      const ariaLabel = ariaLabelElement.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim()) {
        return ariaLabel.trim();
      }
    }

    // Method 3: Check element's own aria-label
    const elementAriaLabel = element.getAttribute('aria-label');
    if (elementAriaLabel && elementAriaLabel.trim()) {
      return elementAriaLabel.trim();
    }

    // Method 4: Look for text in span or div elements (common calendar name containers)
    const textElements = element.querySelectorAll('span, div');
    for (const textEl of textElements) {
      const text = textEl.textContent?.trim();
      if (text && text.length > 0 && text.length < 100) { // Reasonable calendar name length
        return text;
      }
    }

    // Method 5: Use direct text content, but clean it up
    const textContent = element.textContent?.trim();
    if (textContent) {
      // Get first non-empty line
      const lines = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length > 0 && lines[0].length < 100) {
        return lines[0];
      }
    }

    // Method 6: Generate name based on position if all else fails
    const siblings = Array.from(element.parentNode?.children || []);
    const index = siblings.indexOf(element);
    return `Calendar ${index + 1}`;
  },

  /**
   * Get calendar ID from element (if available)
   * @param {Element} element - Calendar element
   * @returns {string} Calendar ID or generated ID
   */
  getCalendarId(element) {
    // Try to get actual calendar ID from data attributes
    const possibleAttributes = [
      'data-calendarid', 'data-eventid', 'data-calendar-id', 
      'data-id', 'id', 'data-testid'
    ];
    
    for (const attr of possibleAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        console.log(`Found calendar ID from ${attr}: ${value}`);
        return value;
      }
      
      // Also check child elements
      const childWithAttr = element.querySelector(`[${attr}]`);
      if (childWithAttr) {
        const childValue = childWithAttr.getAttribute(attr);
        if (childValue) {
          console.log(`Found calendar ID from child ${attr}: ${childValue}`);
          return childValue;
        }
      }
    }
    
    // Generate consistent ID based on calendar name, text content and DOM position
    const name = this.getCalendarName(element);
    const textContent = element.textContent?.trim() || '';
    const parent = element.parentNode;
    const index = parent ? Array.from(parent.children).indexOf(element) : 0;
    
    // Create a more unique identifier
    const baseId = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const textHash = textContent.length > 0 ? 
      textContent.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 10) : '';
    
    const generatedId = `cal_${baseId}_${textHash}_${index}`;
    console.log(`Generated calendar ID: ${generatedId} for calendar: ${name}`);
    
    return generatedId;
  },

  /**
   * Show/hide calendar element
   * @param {Element} element - Calendar element to toggle
   * @param {boolean} visible - Whether to show or hide
   */
  toggleCalendarVisibility(element, visible) {
    if (visible) {
      element.style.display = '';
      element.classList.remove('gcgm-hidden');
    } else {
      element.style.display = 'none';
      element.classList.add('gcgm-hidden');
    }
  },

  /**
   * Get checkbox element from calendar item
   * @param {Element} calendarElement - Calendar item element
   * @returns {Element|null} Checkbox element
   */
  getCheckboxElement(calendarElement) {
    // Try different ways to find the checkbox
    let checkbox = calendarElement.querySelector('[role="checkbox"]');
    if (checkbox) return checkbox;
    
    checkbox = calendarElement.querySelector('input[type="checkbox"]');
    if (checkbox) return checkbox;
    
    // Check if the element itself is a checkbox
    if (calendarElement.matches('[role="checkbox"], input[type="checkbox"]')) {
      return calendarElement;
    }
    
    // Look in parent elements
    const parent = calendarElement.parentElement;
    if (parent) {
      checkbox = parent.querySelector('[role="checkbox"], input[type="checkbox"]');
      if (checkbox) return checkbox;
    }
    
    return null;
  },

  /**
   * Check if calendar is currently checked/visible
   * @param {Element} calendarElement - Calendar item element
   * @returns {boolean} True if calendar is checked
   */
  isCalendarChecked(calendarElement) {
    const checkbox = this.getCheckboxElement(calendarElement);
    if (!checkbox) {
      console.warn('No checkbox found for calendar element:', calendarElement);
      return false;
    }
    
    // Check various ways the checkbox state might be indicated
    const ariaChecked = checkbox.getAttribute('aria-checked');
    const checked = checkbox.checked;
    const ariaPressed = checkbox.getAttribute('aria-pressed');
    
    console.log('Checkbox state check:', {
      element: calendarElement,
      ariaChecked: ariaChecked,
      checked: checked,
      ariaPressed: ariaPressed,
      tagName: checkbox.tagName,
      type: checkbox.type
    });
    
    return ariaChecked === 'true' || 
           checked === true || 
           ariaPressed === 'true';
  }
};

/**
 * Main Calendar Group Manager class
 */
class CalendarGroupManager {
  constructor() {
    this.currentActiveGroup = null;
    this.originalCalendarStates = new Map();
    this.isInitialized = false;
    this.init();
  }

  /**
   * Initialize the manager
   */
  async init() {
    console.log('Initializing Calendar Group Manager');
    
    // Set up message listener immediately for popup communication
    this.setupMessageListener();
    
    // Wait for calendar DOM to be ready in background
    this.waitForCalendarDOM().then(() => {
      this.isInitialized = true;
      console.log('Calendar Group Manager fully initialized');
    });
    
    console.log('Calendar Group Manager message listener ready');
  }

  /**
   * Wait for Google Calendar DOM to be fully loaded
   * @returns {Promise<void>}
   */
  async waitForCalendarDOM() {
    const maxWaitTime = 15000; // 15 seconds
    const checkInterval = 500; // 500ms for more stability
    let waitTime = 0;

    return new Promise((resolve) => {
      const checkDOM = () => {
        console.log(`Checking for calendar DOM... (${waitTime}ms elapsed)`);
        
        // First check if we're on the right page
        const isCalendarPage = window.location.hostname.includes('calendar.google.com');
        if (!isCalendarPage) {
          console.log('Not on Google Calendar page');
          resolve();
          return;
        }
        
        // Look for calendar sidebar or any calendar elements
        const hasSidebar = document.querySelector('aside, [role="navigation"], .KKjvXb, .Y2Qmjb');
        const hasCheckboxes = document.querySelectorAll('[role="checkbox"]').length > 0;
        const calendars = CalendarDOM.getCalendarElements();
        
        console.log(`Found: sidebar=${!!hasSidebar}, checkboxes=${hasCheckboxes}, calendars=${calendars.length}`);
        
        if ((calendars.length > 0 || hasCheckboxes) || waitTime >= maxWaitTime) {
          console.log(`Calendar DOM ready with ${calendars.length} calendars found after ${waitTime}ms`);
          resolve();
          return;
        }

        waitTime += checkInterval;
        setTimeout(checkDOM, checkInterval);
      };

      checkDOM();
    });
  }

  /**
   * Set up message listener for communication with popup
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'getCalendars':
          this.handleGetCalendars(sendResponse);
          return true;
        
        case 'toggleGroup':
          this.handleToggleGroup(message.groupId, sendResponse);
          return true;
        
        case 'showAllCalendars':
          this.handleShowAllCalendars(sendResponse);
          return true;
        
        case 'forceRefreshCalendars':
          this.handleForceRefreshCalendars(sendResponse);
          return true;
        
        default:
          sendResponse({ error: 'Unknown action' });
      }
    });
  }

  /**
   * Handle force refresh calendars request (with safe expansion)
   * @param {Function} sendResponse - Response callback
   */
  async handleForceRefreshCalendars(sendResponse) {
    try {
      console.log('Force refreshing calendars with safe expansion...');
      
      // Get calendars with safe expansion enabled
      const calendars = await this.getAvailableCalendars(true);
      console.log('Force refresh complete, found calendars:', calendars.length);
      
      sendResponse({ calendars });
    } catch (error) {
      console.error('Error force refreshing calendars:', error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Handle get calendars request
   * @param {Function} sendResponse - Response callback
   */
  async handleGetCalendars(sendResponse) {
    try {
      console.log('Handling getCalendars request...');
      
      // If not fully initialized, wait a bit and try to initialize
      if (!this.isInitialized) {
        console.log('Not fully initialized, forcing calendar search...');
        await this.waitForCalendarDOM();
        this.isInitialized = true;
      }
      
      const calendars = await this.getAvailableCalendars();
      console.log('Returning calendars:', calendars);
      sendResponse({ calendars });
    } catch (error) {
      console.error('Error getting calendars:', error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Handle toggle group request
   * @param {string} groupId - Group ID to toggle
   * @param {Function} sendResponse - Response callback
   */
  async handleToggleGroup(groupId, sendResponse) {
    try {
      await this.toggleGroup(groupId);
      sendResponse({ success: true, activeGroup: this.currentActiveGroup });
    } catch (error) {
      console.error('Error toggling group:', error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Handle show all calendars request
   * @param {Function} sendResponse - Response callback
   */
  async handleShowAllCalendars(sendResponse) {
    try {
      await this.showAllCalendars();
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error showing all calendars:', error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Get all available calendars
   * @param {boolean} forceExpand - Whether to expand calendar sections
   * @returns {Array<Object>} Array of calendar objects
   */
  async getAvailableCalendars(forceExpand = false) {
    const calendarElements = await CalendarDOM.getCalendarElements(forceExpand);
    
    return calendarElements.map(element => ({
      id: CalendarDOM.getCalendarId(element),
      name: CalendarDOM.getCalendarName(element),
      visible: CalendarDOM.isCalendarChecked(element)
    }));
  }

  /**
   * Toggle group visibility
   * @param {string} groupId - ID of group to toggle
   */
  async toggleGroup(groupId) {
    const { groups = {} } = await StorageUtils.get(['groups']);
    const group = groups[groupId];
    
    if (!group) {
      throw new Error('Group not found');
    }

    // If this group is already active, show all calendars
    if (this.currentActiveGroup === groupId) {
      await this.showAllCalendars();
      return;
    }

    // Save current calendar states if not already saved
    if (this.originalCalendarStates.size === 0) {
      await this.saveCurrentCalendarStates();
    }

    // Hide all calendars first
    await this.hideAllCalendars();

    // Show only calendars in this group
    await this.showCalendarsInGroup(group.calendars);

    this.currentActiveGroup = groupId;
  }

  /**
   * Save current calendar visibility states
   */
  async saveCurrentCalendarStates() {
    const calendarElements = await CalendarDOM.getCalendarElements(false);
    
    calendarElements.forEach(element => {
      const id = CalendarDOM.getCalendarId(element);
      const isVisible = CalendarDOM.isCalendarChecked(element);
      this.originalCalendarStates.set(id, isVisible);
    });
  }

  /**
   * Hide all calendars
   */
  async hideAllCalendars() {
    console.log('Hiding all calendars...');
    const calendarElements = await CalendarDOM.getCalendarElements(false);
    console.log(`Found ${calendarElements.length} calendar elements to process`);
    
    calendarElements.forEach((element, index) => {
      const checkbox = CalendarDOM.getCheckboxElement(element);
      const isChecked = CalendarDOM.isCalendarChecked(element);
      const calendarName = CalendarDOM.getCalendarName(element);
      
      console.log(`Calendar ${index}: ${calendarName}, checked: ${isChecked}`);
      
      if (checkbox && isChecked) {
        console.log(`Clicking to hide: ${calendarName}`);
        this.toggleCalendarVisibility(checkbox, false);
      }
    });
  }

  /**
   * Show calendars in specific group
   * @param {Array<string>} calendarIds - Array of calendar IDs to show
   */
  async showCalendarsInGroup(calendarIds) {
    console.log('Showing calendars in group:', calendarIds);
    const calendarElements = await CalendarDOM.getCalendarElements(false);
    
    calendarElements.forEach(element => {
      const id = CalendarDOM.getCalendarId(element);
      const calendarName = CalendarDOM.getCalendarName(element);
      
      console.log(`Checking calendar: ${calendarName} (id: ${id})`);
      
      if (calendarIds.includes(id)) {
        const checkbox = CalendarDOM.getCheckboxElement(element);
        const isChecked = CalendarDOM.isCalendarChecked(element);
        
        console.log(`Calendar ${calendarName} should be shown, currently checked: ${isChecked}`);
        
        if (checkbox && !isChecked) {
          console.log(`Clicking to show: ${calendarName}`);
          this.toggleCalendarVisibility(checkbox, true);
        }
      }
    });
  }

  /**
   * Show all calendars (restore original state)
   */
  async showAllCalendars() {
    console.log('Showing all calendars...');
    const calendarElements = await CalendarDOM.getCalendarElements(false);
    
    calendarElements.forEach(element => {
      const id = CalendarDOM.getCalendarId(element);
      const shouldBeVisible = this.originalCalendarStates.get(id);
      const isCurrentlyVisible = CalendarDOM.isCalendarChecked(element);
      const checkbox = CalendarDOM.getCheckboxElement(element);
      const calendarName = CalendarDOM.getCalendarName(element);
      
      console.log(`Restoring ${calendarName}: should be ${shouldBeVisible}, currently ${isCurrentlyVisible}`);
      
      if (checkbox && shouldBeVisible !== undefined && shouldBeVisible !== isCurrentlyVisible) {
        console.log(`Toggling ${calendarName} to original state: ${shouldBeVisible}`);
        this.toggleCalendarVisibility(checkbox, shouldBeVisible);
      }
    });

    // Clear saved states and active group
    this.originalCalendarStates.clear();
    this.currentActiveGroup = null;
  }

  /**
   * Toggle calendar visibility with multiple methods
   * @param {Element} checkbox - Checkbox element
   * @param {boolean} visible - Whether to make visible
   */
  toggleCalendarVisibility(checkbox, visible) {
    console.log(`Toggling calendar visibility to: ${visible}`);
    
    try {
      // Method 1: Direct click
      checkbox.click();
      
      // Verify the change after a short delay
      setTimeout(() => {
        const currentState = checkbox.getAttribute('aria-checked') === 'true' || 
                           checkbox.checked === true ||
                           checkbox.getAttribute('aria-pressed') === 'true';
        console.log(`After click, calendar state is: ${currentState}, expected: ${visible}`);
        
        // If the state didn't change as expected, try alternative methods
        if (currentState !== visible) {
          this.forceCalendarState(checkbox, visible);
        }
      }, 200);
      
    } catch (error) {
      console.warn('Click failed, trying alternative methods:', error);
      this.forceCalendarState(checkbox, visible);
    }
  }

  /**
   * Force calendar state using alternative methods
   * @param {Element} checkbox - Checkbox element
   * @param {boolean} visible - Whether to make visible
   */
  forceCalendarState(checkbox, visible) {
    console.log(`Forcing calendar state to: ${visible}`);
    
    try {
      // Method 2: Dispatch mouse events
      const events = ['mousedown', 'mouseup', 'click'];
      events.forEach(eventType => {
        const event = new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window
        });
        checkbox.dispatchEvent(event);
      });
      
      // Method 3: Keyboard events (space bar)
      const keyEvent = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true
      });
      checkbox.dispatchEvent(keyEvent);
      
      // Method 4: Direct attribute/property setting
      if (checkbox.hasAttribute('aria-checked')) {
        checkbox.setAttribute('aria-checked', visible.toString());
      }
      if (checkbox.hasAttribute('aria-pressed')) {
        checkbox.setAttribute('aria-pressed', visible.toString());
      }
      if (checkbox.type === 'checkbox') {
        checkbox.checked = visible;
      }
      
    } catch (error) {
      console.error('All methods failed:', error);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new CalendarGroupManager();
  });
} else {
  new CalendarGroupManager();
}