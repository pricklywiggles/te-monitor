import puppeteer from 'puppeteer';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG, BROWSER_CONFIG } from './config.js';
import {
  applyStealthTechniques,
  waitForLazyContent,
  humanDelay
} from './stealth-utils.js';

// For ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Element Count Monitor - Simple SVG path counter
 * Monitors changes in the count of SVG path elements on a webpage
 */
export class WebPageMonitor {
  constructor(config = {}) {
    const url = config.url || process.env.MONITOR_URL;

    // Generate unique state file name based on URL
    const urlHash = crypto
      .createHash('md5')
      .update(url || 'default')
      .digest('hex')
      .substring(0, 8);
    const defaultStateFile = path.join(__dirname, `../state-${urlHash}.json`);

    this.config = {
      ...DEFAULT_CONFIG,
      url,
      stateFile:
        config.stateFile || process.env.MONITOR_STATE_FILE || defaultStateFile,
      alertWebhook: config.alertWebhook || null,
      ...config
    };

    this.browser = null;
    this.isMonitoring = false;
    this.monitorInterval = null;
  }

  /**
   * Initialize browser with modern Puppeteer settings
   */
  async initBrowser() {
    const launchOptions = {
      // Use new headless mode in Puppeteer v24+
      headless: this.config.headless,
      ...BROWSER_CONFIG
    };

    // Add user agent for better compatibility
    if (this.config.userAgent) {
      launchOptions.args.push(`--user-agent=${this.config.userAgent}`);
    } else {
      launchOptions.args.push(`--user-agent=${BROWSER_CONFIG.userAgent}`);
    }

    // Use specific browser if configured
    if (this.config.browser === 'firefox') {
      launchOptions.product = 'firefox';
    }

    try {
      this.browser = await puppeteer.launch(launchOptions);
      this.log.info('Browser initialized successfully');
    } catch (error) {
      this.log.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Create a new page with stealth settings
   */
  async createStealthPage() {
    if (!this.browser) {
      await this.initBrowser();
    }

    const page = await this.browser.newPage();

    // Apply stealth techniques
    await applyStealthTechniques(page);

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);
    page.setDefaultNavigationTimeout(this.config.timeout);

    return page;
  }

  /**
   * Compare content via element counts
   */
  async compareContent(retryCount = 0) {
    let page = null;

    try {
      page = await this.createStealthPage();

      // Navigate with multiple wait conditions
      await page.goto(this.config.url, {
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: this.config.timeout
      });

      // Random delay to appear more human-like
      await humanDelay(1000, 1.0);

      // Wait for any lazy-loaded content
      await waitForLazyContent(page);

      const hash = await this.config.getElementHash(
        page,
        this.config.selector,
        this.log
      );

      const result = {
        hash,
        timestamp: new Date().toISOString(),
        url: this.config.url,
        selector: this.config.selector
      };

      return result;
    } catch (error) {
      this.log.error(`Attempt ${retryCount + 1} failed:`, error);

      if (retryCount < this.config.maxRetries) {
        await this.delay(this.config.retryDelay * (retryCount + 1));
        return this.compareContent(retryCount + 1);
      }

      throw error;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Load previous state from file
   */
  async loadPreviousState() {
    try {
      const data = await fs.readFile(this.config.stateFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.log.error('Error loading state:', error);
      }
      return null;
    }
  }

  /**
   * Save current state to file
   */
  async saveState(state) {
    try {
      const dir = path.dirname(this.config.stateFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.stateFile, JSON.stringify(state, null, 2));
      this.log.info('State saved successfully');
    } catch (error) {
      this.log.error('Error saving state:', error);
    }
  }

  /**
   * Check for changes between states
   */
  async checkForChanges() {
    try {
      this.log.info('Checking for changes...');

      const currentState = await this.compareContent();
      const previousState = await this.loadPreviousState();

      if (!currentState) {
        await this.triggerAlert(
          'Unable to retrieve state (element not found?)',
          previousState,
          null
        );
        return { changed: true, reason: 'state_retrieval_failed' };
      }

      if (!previousState) {
        await this.saveState(currentState);
        this.log.info('Initial state saved');
        return { changed: false, reason: 'initial_state' };
      }

      if (currentState.hash !== previousState.hash) {
        await this.triggerAlert(`Change Detected`, previousState, currentState);
        await this.saveState(currentState);
        return { changed: true, reason: 'hash_changed' };
      }

      this.log.info('No changes detected');
      return { changed: false, reason: 'no_changes' };
    } catch (error) {
      this.log.error('Error checking for changes:', error);
      await this.triggerAlert(`Monitoring error: ${error.message}`, null, null);
      return { changed: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Trigger alert when changes are detected
   */
  async triggerAlert(reason, previousState, currentState) {
    const alert = {
      reason,
      timestamp: new Date().toISOString(),
      url: this.config.url,
      selector: this.config.selector,
      previousHash: previousState?.hash,
      currentHash: currentState?.hash
    };

    console.log('\n🚨 ALERT:', alert.reason);
    console.log('Timestamp:', alert.timestamp);
    console.log('URL:', alert.url);
    console.log('previousHash', alert.previousHash);
    console.log('currentHash', alert.currentHash);

    // Send webhook notification if configured
    if (this.config.alertWebhook) {
      await this.sendWebhookNotification(alert);
    }

    await this.config.onAlert(alert);
  }

  /**
   * Send webhook notification
   */
  async sendWebhookNotification(alert) {
    try {
      const response = await fetch(this.config.alertWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }

      this.log.info('Webhook notification sent successfully');
    } catch (error) {
      this.log.error('Failed to send webhook:', error);
    }
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isMonitoring) {
      this.log.info('Monitor is already running');
      return;
    }

    this.isMonitoring = true;

    console.log('🚀 Starting Element Count Monitor');
    console.log(`📍 URL: ${this.config.url}`);
    console.log(`🎯 Selector: ${this.config.selector}`);
    console.log(`⏱️  Check interval: ${this.config.checkInterval / 1000}s`);
    console.log(`🌐 Browser: ${this.config.browser}`);
    console.log(`👻 Headless: ${this.config.headless}`);
    console.log('');

    // Initial check
    await this.checkForChanges();

    // Set up periodic monitoring
    this.monitorInterval = setInterval(async () => {
      await this.checkForChanges();
    }, this.config.checkInterval);
  }

  /**
   * Stop monitoring
   */
  async stop() {
    this.isMonitoring = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    console.log('🛑 Monitor stopped');
  }

  /**
   * Utility: delay function
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Logging utilities
   */
  log = {
    error: (message, error) => {
      console.error(
        `[${new Date().toISOString()}] ${message}`,
        error?.message || error
      );
    },
    info: (message) => {
      if (this.config.debug) {
        console.log(`[${new Date().toISOString()}] ${message}`);
      }
    }
  };
}
