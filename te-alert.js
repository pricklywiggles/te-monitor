import puppeteer from 'puppeteer';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// For ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Element Count Monitor - Simple SVG path counter
 * Monitors changes in the count of SVG path elements on a webpage
 */
class WebPageMonitor {
  constructor(config = {}) {
    const url = config.url || process.env.MONITOR_URL;

    // Generate unique state file name based on URL
    const urlHash = crypto
      .createHash('md5')
      .update(url || 'default')
      .digest('hex')
      .substring(0, 8);
    const defaultStateFile = path.join(
      __dirname,
      `element-count-state-${urlHash}.json`
    );

    this.config = {
      url,
      checkInterval: config.checkInterval || 30 * 60 * 1000, // 30 minutes
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 3000,
      headless: config.headless !== undefined ? config.headless : true,
      timeout: config.timeout || 30000,
      stateFile:
        config.stateFile || process.env.MONITOR_STATE_FILE || defaultStateFile,
      alertWebhook: config.alertWebhook || null,
      debug: config.debug || false,
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

      // Modern args for stability and stealth
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--start-maximized',
        // Network optimization
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // Certificate and security
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list'
      ],

      // Set viewport
      defaultViewport: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1
      },

      // Ignore HTTPS errors
      ignoreHTTPSErrors: true,

      // Use specific browser if configured
      ...(this.config.browser === 'firefox' && { product: 'firefox' })
    };

    // Add user agent for better compatibility
    if (this.config.userAgent) {
      launchOptions.args.push(`--user-agent=${this.config.userAgent}`);
    } else {
      launchOptions.args.push(
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
      );
    }

    try {
      this.browser = await puppeteer.launch(launchOptions);
      this.log('Browser initialized successfully');
    } catch (error) {
      this.logError('Failed to initialize browser:', error);
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
    await this.applyStealthTechniques(page);

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);
    page.setDefaultNavigationTimeout(this.config.timeout);

    return page;
  }

  /**
   * Apply modern stealth techniques to avoid detection
   */
  async applyStealthTechniques(page) {
    // Override navigator.webdriver and other detection vectors
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () =>
          [1, 2, 3, 4, 5].map((_, i) => ({
            name: `Plugin ${i}`,
            description: `Description ${i}`,
            filename: `plugin${i}.dll`,
            length: 1
          }))
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);

      // Mock chrome runtime
      window.chrome = {
        runtime: {}
      };

      // Mock screen dimensions to avoid headless detection
      Object.defineProperty(screen, 'height', { get: () => 1080 });
      Object.defineProperty(screen, 'width', { get: () => 1920 });
    });

    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="127", "Not=A?Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });
  }

  /**
   * Get element hash with retry logic
   */
  async getElementHash(retryCount = 0) {
    let page = null;

    try {
      page = await this.createStealthPage();

      // Navigate with multiple wait conditions
      await page.goto(this.config.url, {
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: this.config.timeout
      });

      // Random delay to appear more human-like
      await this.delay(1000 + Math.random() * 2000);

      // Wait for any lazy-loaded content
      await this.waitForLazyContent(page);

      // Get element count for monitoring
      const elementCount = await this.getElementCount(page);
      console.log(`Element count: ${elementCount}`);

      // Create simple hash based on element count
      const hash = crypto
        .createHash('sha256')
        .update(elementCount.toString())
        .digest('hex');

      const result = {
        hash,
        elementCount,
        timestamp: new Date().toISOString(),
        url: this.config.url,
        selector: '.desktop > div > div.svg:last-of-type > svg > path'
      };

      this.log(`Successfully counted elements: ${elementCount} found`);
      return result;
    } catch (error) {
      this.logError(`Attempt ${retryCount + 1} failed:`, error);

      if (retryCount < this.config.maxRetries) {
        await this.delay(this.config.retryDelay * (retryCount + 1));
        return this.getElementHash(retryCount + 1);
      }

      throw error;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Wait for lazy-loaded content
   */
  async waitForLazyContent(page) {
    try {
      // Scroll to trigger lazy loading
      await page.evaluate(() => {
        return new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0); // Scroll back to top
              resolve();
            }
          }, 100);

          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(timer);
            resolve();
          }, 5000);
        });
      });

      // Wait for network to stabilize after scrolling
      await page
        .waitForFunction(() => document.readyState === 'complete', {
          timeout: 5000
        })
        .catch(() => {});
    } catch (error) {
      // Non-critical error, continue
      this.log('Lazy content loading skipped');
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
        this.logError('Error loading state:', error);
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
      this.log('State saved successfully');
    } catch (error) {
      this.logError('Error saving state:', error);
    }
  }

  /**
   * Get element count for monitoring
   */
  async getElementCount(page) {
    try {
      const selector = '.desktop > div > div.svg:last-of-type > svg > path';
      const count = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, selector);

      this.log(`Found ${count} elements matching selector: ${selector}`);
      return count;
    } catch (error) {
      this.logError('Error counting elements:', error);
      return 0;
    }
  }

  /**
   * Check for changes between states
   */
  async checkForChanges() {
    try {
      this.log('Checking for changes...');

      const currentState = await this.getElementHash();
      const previousState = await this.loadPreviousState();

      if (!currentState) {
        await this.triggerAlert(
          'Unable to count elements on page',
          previousState,
          null
        );
        return { changed: true, reason: 'count_failed' };
      }

      if (!previousState) {
        await this.saveState(currentState);
        this.log('Initial state saved');
        return { changed: false, reason: 'initial_state' };
      }

      if (currentState.hash !== previousState.hash) {
        await this.triggerAlert(
          `Element count changed from ${previousState.elementCount} to ${currentState.elementCount}`,
          previousState,
          currentState
        );
        await this.saveState(currentState);
        return { changed: true, reason: 'count_changed' };
      }

      this.log('No changes detected');
      return { changed: false, reason: 'no_changes' };
    } catch (error) {
      this.logError('Error checking for changes:', error);
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
      selector: '.desktop > div > div.svg:last-of-type > svg > path',
      previousHash: previousState?.hash,
      currentHash: currentState?.hash,
      changes: this.detectSpecificChanges(previousState, currentState)
    };

    console.log('\n🚨 ALERT:', alert.reason);
    console.log('Timestamp:', alert.timestamp);
    console.log('URL:', alert.url);

    if (alert.changes.length > 0) {
      console.log('Detected changes:');
      alert.changes.forEach((change) => console.log(`  - ${change}`));
    }

    console.log('alert.hash', alert.hash);
    await alertViaLamp(alert.currentHash ? 240 : 120);

    // Send webhook notification if configured
    if (this.config.alertWebhook) {
      await this.sendWebhookNotification(alert);
    }

    // Call custom alert handler if provided
    if (this.config.onAlert) {
      await this.config.onAlert(alert);
    }
  }

  /**
   * Detect specific changes between states
   */
  detectSpecificChanges(previousState, currentState) {
    const changes = [];

    if (!previousState || !currentState) {
      return changes;
    }

    if (previousState.elementCount !== currentState.elementCount) {
      const change = `Element count: ${previousState.elementCount} → ${currentState.elementCount}`;
      const diff = currentState.elementCount - previousState.elementCount;
      if (diff > 0) {
        changes.push(`${change} (+${diff} elements added)`);
      } else {
        changes.push(`${change} (${Math.abs(diff)} elements removed)`);
      }
    }

    return changes;
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

      this.log('Webhook notification sent successfully');
    } catch (error) {
      this.logError('Failed to send webhook:', error);
    }
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isMonitoring) {
      this.log('Monitor is already running');
      return;
    }

    this.isMonitoring = true;

    console.log('🚀 Starting Element Count Monitor');
    console.log(`📍 URL: ${this.config.url}`);
    console.log(
      `🎯 Selector: .desktop > div > div.svg:last-of-type > svg > path`
    );
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
  log(message) {
    if (this.config.debug) {
      console.log(`[${new Date().toISOString()}] ${message}`);
    }
  }

  logError(message, error) {
    console.error(
      `[${new Date().toISOString()}] ${message}`,
      error?.message || error
    );
  }
}

async function main() {
  const url = process.env.MONITOR_URL;
  const checkInterval =
    parseInt(process.env.MONITOR_INTERVAL) || 10 * 60 * 1000; // Default 10 minutes
  const debug = process.env.MONITOR_DEBUG === 'true';
  const webhookUrl = process.env.MONITOR_WEBHOOK || null;
  const clearState = process.env.MONITOR_CLEAR_STATE === 'true';

  if (!process.env.MONITOR_URL) {
    console.log('⚠️  Required environment variable missing:');
    console.log('   MONITOR_URL - URL to monitor (required)');
    console.log('   MONITOR_INTERVAL - Check interval in ms (optional)');
    console.log('   MONITOR_DEBUG - Enable debug logging (optional)');
    console.log('   MONITOR_WEBHOOK - Webhook URL for alerts (optional)');
    console.log(
      '   MONITOR_CLEAR_STATE - Clear previous state before starting (optional)\n'
    );
    process.exit(1);
  }

  const monitor = new WebPageMonitor({
    url,
    checkInterval,
    headless: true,
    debug,
    maxRetries: 3,
    alertWebhook: webhookUrl,

    // Optional: Custom alert handler
    onAlert: async (alert) => {
      console.log('Custom alert handler:', alert);
      // Send email, SMS, etc.
    }
  });

  // Clear state if requested
  if (clearState) {
    try {
      await fs.unlink(monitor.config.stateFile);
      console.log('✅ Previous state cleared\n');
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n⏸️  Gracefully shutting down...');
    await monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await monitor.stop();
    process.exit(0);
  });

  // Start monitoring
  await monitor.start();
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

class HomebridgeClient {
  constructor(host, port, username, password) {
    this.baseURL = `http://${host}:${port}`;
    this.auth = { username, password };
    this.token = null;
  }

  async login() {
    const response = await axios.post(
      `${this.baseURL}/api/auth/login`,
      this.auth
    );
    this.token = response.data.access_token;
  }

  async getAccessories() {
    return axios.get(`${this.baseURL}/api/accessories`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
  }

  async setAccessoryState(uniqueId, characteristic, value) {
    return axios.put(
      `${this.baseURL}/api/accessories/${uniqueId}`,
      {
        characteristicType: characteristic,
        value
      },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

const alertViaLamp = async (hue) => {
  console.log(
    `connecting to homebridge at ${process.env.HB_HOST}:${process.env.HB_PORT}`
  );
  const client = new HomebridgeClient(
    process.env.HB_HOST,
    process.env.HB_PORT,
    'pricklywiggles',
    process.env.HB_PWD
  );
  await client.login();
  await client.getAccessories();
  await client.setAccessoryState(process.env.ACCESSORY, 'On', true);
  client.setAccessoryState(process.env.ACCESSORY, 'Hue', hue);
};

// Export for use as a module
export default WebPageMonitor;
