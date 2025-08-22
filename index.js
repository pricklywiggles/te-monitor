/**
 * Entry point for the webpage monitoring application
 * This file replaces the monolithic te-alert.js
 */
export { WebPageMonitor } from './src/web-page-monitor.js';
export { HomebridgeClient, alertViaLamp } from './src/homebridge-client.js';
import crypto from 'crypto';
export { main } from './src/main.js';
import { alertViaLamp } from './src/homebridge-client.js';
import { sendEmail } from './src/mailer.js';

const getElementHash = async (page, selector, log) => {
  try {
    const elementCount = await page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, selector);

    console.log(`Element count: ${elementCount}`);

    // Create simple hash based on element count
    const hash = crypto
      .createHash('sha256')
      .update(elementCount.toString())
      .digest('hex');

    return elementCount.toString();
  } catch (error) {
    log?.error('Error counting elements:', error);
    return 0;
  }
};

const handleAlert = async (alert) => {
  await alertViaLamp(alert.currentHash ? 240 : 120);
  await sendEmail(
    process.env.EMAIL_TO,
    'Web Page Monitor Alert',
    `Alert: ${alert.reason}`
  );
};

// Auto-run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const { main } = await import('./src/main.js');
  main(getElementHash, handleAlert).catch(console.error);
}
