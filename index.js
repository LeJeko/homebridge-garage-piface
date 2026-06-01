'use strict';

const PLUGIN_NAME = 'homebridge-garage-piface';
const PLATFORM_NAME = 'GaragePiFace';

let PIFD;
try {
  PIFD = require('node-pifacedigital');
} catch (e) {
  // Handled at platform init with a clear error message
}

module.exports = (api) => {
  api.registerPlatform(PLATFORM_NAME, GaragePiFacePlatform);
};

class GaragePiFacePlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.cachedAccessories = new Map();

    if (!PIFD) {
      this.log.error('node-pifacedigital could not be loaded. Run: sudo apt-get install libpifacedigital-dev && npm rebuild node-pifacedigital');
      return;
    }

    try {
      this.pi = new PIFD.PIFaceDigital(0, false);
    } catch (e) {
      this.log.error('Failed to initialize PiFace Digital board: ' + e.message);
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory) {
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  discoverDevices() {
    if (!this.pi) return;

    const devices = this.config.accessories || [];
    const configuredUUIDs = new Set();

    for (const deviceConfig of devices) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${deviceConfig.name}`);
      configuredUUIDs.add(uuid);

      let accessory = this.cachedAccessories.get(uuid);
      if (!accessory) {
        this.log.info(`Adding new accessory: ${deviceConfig.name}`);
        accessory = new this.api.platformAccessory(deviceConfig.name, uuid);
        new GaragePiFaceHandler(this.log, deviceConfig, this.api, accessory, this.pi);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.cachedAccessories.set(uuid, accessory);
      } else {
        this.log.info(`Restoring cached accessory: ${deviceConfig.name}`);
        new GaragePiFaceHandler(this.log, deviceConfig, this.api, accessory, this.pi);
      }
    }

    // Remove accessories no longer in config
    for (const [uuid, accessory] of this.cachedAccessories) {
      if (!configuredUUIDs.has(uuid)) {
        this.log.info(`Removing accessory: ${accessory.displayName}`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.cachedAccessories.delete(uuid);
      }
    }
  }
}

class GaragePiFaceHandler {
  constructor(log, config, api, accessory, pi) {
    this.log = log;
    this.api = api;
    this.accessory = accessory;
    this.pi = pi;

    const { Characteristic } = this.api.hap;
    this.DoorState = Characteristic.CurrentDoorState;

    this.version = require('./package.json').version;
    this.name = config.name;
    this.doorSwitchOutput = config.switchOutput;
    this.relayOn = config.switchValue !== undefined ? config.switchValue : 1;
    this.relayOff = 1 - this.relayOn;
    this.doorSwitchPressTimeInMs = config.switchPressTimeInMs || 1000;
    this.closedDoorSensorInput = config.closedSensorInput || null;
    this.openDoorSensorInput = config.openSensorInput || null;
    this.sensorPollInMs = config.pollInMs || 4000;
    this.doorOpensInSeconds = config.opensInSeconds || 10;
    this.closedDoorSensorValue = config.closedSensorValue;
    this.openDoorSensorValue = config.openSensorValue;

    log.info(`GaragePiFaceAccessory v${this.version}`);
    log.info(`Switch Output: ${this.doorSwitchOutput} (${this.relayOn === 1 ? 'ACTIVE_HIGH' : 'ACTIVE_LOW'}), Press: ${this.doorSwitchPressTimeInMs}ms`);

    if (this.hasClosedSensor()) {
      log.info(`Closed Sensor: input=${this.closedDoorSensorInput}, val=${this.closedDoorSensorValue === 1 ? 'ACTIVE_HIGH' : 'ACTIVE_LOW'}`);
    } else {
      log.info('Closed Sensor: Not Configured');
    }

    if (this.hasOpenSensor()) {
      log.info(`Open Sensor: input=${this.openDoorSensorInput}, val=${this.openDoorSensorValue === 1 ? 'ACTIVE_HIGH' : 'ACTIVE_LOW'}`);
    } else {
      log.info('Open Sensor: Not Configured');
    }

    if (!this.hasClosedSensor() && !this.hasOpenSensor()) {
      this.wasClosed = true;
      log.warn('Neither sensor configured – relying on last known state.');
    }

    log.info(`Poll: ${this.sensorPollInMs}ms, Opens in: ${this.doorOpensInSeconds}s`);

    this.initService();
  }

  hasClosedSensor() {
    return this.closedDoorSensorInput !== null && this.closedDoorSensorInput !== '';
  }

  hasOpenSensor() {
    return this.openDoorSensorInput !== null && this.openDoorSensorInput !== '';
  }

  initService() {
    const { Characteristic, Service } = this.api.hap;
    const DoorState = this.DoorState;

    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'Opensource Community')
      .setCharacteristic(Characteristic.Model, 'RaspPi PiFace GarageDoor')
      .setCharacteristic(Characteristic.SerialNumber, this.version)
      .setCharacteristic(Characteristic.FirmwareRevision, this.version);

    this.garageDoorService = this.accessory.getService(Service.GarageDoorOpener)
      || this.accessory.addService(Service.GarageDoorOpener, this.name);

    this.currentDoorState = this.garageDoorService.getCharacteristic(DoorState);
    this.currentDoorState.onGet(this.getState.bind(this));

    this.targetDoorState = this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState);
    this.targetDoorState.onGet(this.getTargetState.bind(this));
    this.targetDoorState.onSet(this.setState.bind(this));

    const isClosed = this.isClosed();
    this.wasClosed = isClosed;
    this.operating = false;
    this.targetState = isClosed ? DoorState.CLOSED : DoorState.OPEN;

    this.currentDoorState.updateValue(isClosed ? DoorState.CLOSED : DoorState.OPEN);
    this.targetDoorState.updateValue(this.targetState);
    this.log.info(`Initial State: ${isClosed ? 'CLOSED' : 'OPEN'}`);

    if (this.hasOpenSensor() || this.hasClosedSensor()) {
      this.log.info(`${this.name}: sensor monitoring enabled.`);
      setTimeout(this.monitorDoorState.bind(this), this.sensorPollInMs);
    }
  }

  determineCurrentDoorState() {
    const DoorState = this.DoorState;
    if (this.isClosed()) return DoorState.CLOSED;
    if (this.hasOpenSensor()) return this.isOpen() ? DoorState.OPEN : DoorState.STOPPED;
    return DoorState.OPEN;
  }

  doorStateToString(state) {
    const DoorState = this.DoorState;
    switch (state) {
      case DoorState.OPEN: return 'OPEN';
      case DoorState.CLOSED: return 'CLOSED';
      case DoorState.STOPPED: return 'STOPPED';
      default: return 'UNKNOWN';
    }
  }

  monitorDoorState() {
    const isClosed = this.isClosed();
    if (isClosed !== this.wasClosed && !this.operating) {
      const state = this.determineCurrentDoorState();
      this.log.info(`State changed to ${this.doorStateToString(state)}`);
      this.wasClosed = isClosed;
      this.currentDoorState.updateValue(state);
      this.targetState = state;
    }
    setTimeout(this.monitorDoorState.bind(this), this.sensorPollInMs);
  }

  readPin(pin) {
    return this.pi.get(pin);
  }

  writePin(pin, val) {
    this.pi.set(pin, val);
  }

  isClosed() {
    if (this.hasClosedSensor()) {
      return this.readPin(this.closedDoorSensorInput) === this.closedDoorSensorValue;
    }
    if (this.hasOpenSensor()) return !this.isOpen();
    return this.wasClosed;
  }

  isOpen() {
    if (this.hasOpenSensor()) {
      return this.readPin(this.openDoorSensorInput) === this.openDoorSensorValue;
    }
    if (this.hasClosedSensor()) return !this.isClosed();
    return !this.wasClosed;
  }

  switchOn() {
    this.writePin(this.doorSwitchOutput, this.relayOn);
    this.log.info(`Relay ON: ${this.name} output=${this.doorSwitchOutput} val=${this.relayOn}`);
    setTimeout(this.switchOff.bind(this), this.doorSwitchPressTimeInMs);
  }

  switchOff() {
    this.writePin(this.doorSwitchOutput, this.relayOff);
    this.log.info(`Relay OFF: ${this.name} output=${this.doorSwitchOutput} val=${this.relayOff}`);
  }

  setFinalDoorState() {
    const DoorState = this.DoorState;
    let isClosed, isOpen;
    if (!this.hasClosedSensor() && !this.hasOpenSensor()) {
      isClosed = !this.isClosed();
      isOpen = this.isClosed();
    } else {
      isClosed = this.isClosed();
      isOpen = this.isOpen();
    }
    if ((this.targetState === DoorState.CLOSED && !isClosed) || (this.targetState === DoorState.OPEN && !isOpen)) {
      this.log.warn(`Tried to ${this.targetState === DoorState.CLOSED ? 'CLOSE' : 'OPEN'} ${this.name} but door did not reach target state.`);
      this.currentDoorState.updateValue(DoorState.STOPPED);
    } else {
      this.log.info(`Final state: ${this.targetState === DoorState.CLOSED ? 'CLOSED' : 'OPEN'}`);
      this.wasClosed = this.targetState === DoorState.CLOSED;
      this.currentDoorState.updateValue(this.targetState);
    }
    this.operating = false;
  }

  async getTargetState() {
    return this.targetState;
  }

  async setState(state) {
    const DoorState = this.DoorState;
    this.log.info(`Target state: ${this.doorStateToString(state)}`);
    this.targetState = state;
    const isClosed = this.isClosed();
    if ((state === DoorState.OPEN && isClosed) || (state === DoorState.CLOSED && !isClosed)) {
      this.operating = true;
      this.currentDoorState.updateValue(state === DoorState.OPEN ? DoorState.OPENING : DoorState.CLOSING);
      setTimeout(this.setFinalDoorState.bind(this), this.doorOpensInSeconds * 1000);
      this.switchOn();
    }
  }

  async getState() {
    const DoorState = this.DoorState;
    const isClosed = this.isClosed();
    const isOpen = this.isOpen();
    const state = isClosed ? DoorState.CLOSED : isOpen ? DoorState.OPEN : DoorState.STOPPED;
    this.log.info(`${this.name}: ${this.doorStateToString(state)}`);
    return state;
  }
}
