import axios from 'axios';

/**
 * Client for interacting with Homebridge API
 * Handles authentication and accessory state management
 */
export class HomebridgeClient {
  /**
   * Create a new HomebridgeClient instance
   * @param {string} host - Homebridge server host
   * @param {number} port - Homebridge server port
   * @param {string} username - Authentication username
   * @param {string} password - Authentication password
   */
  constructor(host, port, username, password) {
    this.baseURL = `http://${host}:${port}`;
    this.auth = { username, password };
    this.token = null;
  }

  /**
   * Authenticate with the Homebridge server
   * @returns {Promise<void>}
   * @throws {Error} When authentication fails
   */
  async login() {
    const response = await axios.post(
      `${this.baseURL}/api/auth/login`,
      this.auth
    );
    this.token = response.data.access_token;
  }

  /**
   * Get list of available accessories from Homebridge
   * @returns {Promise<import('axios').AxiosResponse>} List of accessories
   * @throws {Error} When request fails
   */
  async getAccessories() {
    return axios.get(`${this.baseURL}/api/accessories`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
  }

  /**
   * Set the state of a specific accessory characteristic
   * @param {string} uniqueId - Unique identifier of the accessory
   * @param {string} characteristic - Characteristic to modify (e.g., 'On', 'Hue')
   * @param {any} value - Value to set for the characteristic
   * @returns {Promise<import('axios').AxiosResponse>} Response from Homebridge API
   * @throws {Error} When request fails
   */
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

/**
 * Alert via HomeKit lamp by setting hue and turning on
 * @param {number} hue - Hue value for the lamp (0-360)
 */
export const alertViaLamp = async (hue) => {
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
