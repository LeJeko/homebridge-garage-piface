var Service, Characteristic, DoorState // set in the module.exports, from homebridge

var PIFD = require('node-pifacedigital');
var pi = new PIFD.PIFaceDigital(0,false);

module.exports = function(homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  DoorState = homebridge.hap.Characteristic.CurrentDoorState

  homebridge.registerAccessory("homebridge-garage-piface", "GaragePiFace", GaragePiFaceAccessory)
}

function GaragePiFaceAccessory(log, config) {
  this.log = log
  this.version = require('./package.json').version
  log("GaragePiFaceAccessory version " + this.version)

  this.name = config.name
  this.doorSwitchOutput = config.switchOutput
  this.relayOn = config.switchValue || 1
  this.relayOff = 1-this.relayOn //opposite of relayOn (O/1)
  this.doorSwitchPressTimeInMs = config.switchPressTimeInMs || 1000
  this.closedDoorSensorInput = config.closedSensorInput
  this.openDoorSensorInput = config.openSensorInput
  this.sensorPollInMs = config.pollInMs || 4000
  this.doorOpensInSeconds = config.opensInSeconds || 10
  this.closedDoorSensorValue = config.closedSensorValue
  this.openDoorSensorValue = config.openSensorValue
  log("Switch Output: " + this.doorSwitchOutput)
  log("Switch Val: " + (this.relayOn == 1 ? "ACTIVE_HIGH" : "ACTIVE_LOW"))
  log("Switch Active Time in ms: " + this.doorSwitchPressTimeInMs)

  if (this.hasClosedSensor()) {
      log("Closed Sensor: Configured")
      log("    Closed Sensor Input: " + this.closedDoorSensorInput)
      log("    Closed Sensor Val: " + (this.closedDoorSensorValue == 1 ? "ACTIVE_HIGH" : "ACTIVE_LOW"))
  } else {
      log("Closed Sensor: Not Configured")
  }

  if(this.hasOpenSensor()) {
      log("Open Sensor: Configured")
      log("    Open Sensor Input: " + this.openDoorSensorInput)
      log("    Open Sensor Val: " + (this.openDoorSensorValue == 1 ? "ACTIVE_HIGH" : "ACTIVE_LOW"))
  } else {
      log("Open Sensor: Not Configured")
  }

  if (!this.hasClosedSensor() && !this.hasOpenSensor()) {
      this.wasClosed = true //Set a valid initial state
      log("NOTE: Neither Open nor Closed sensor is configured. Will be unable to determine what state the garage is in, and will rely on last known state.")
  }
  log("Sensor Poll in ms: " + this.sensorPollInMs)
  log("Opens in seconds: " + this.doorOpensInSeconds)
  this.initService()
}

GaragePiFaceAccessory.prototype = {

  determineCurrentDoorState: function() {
       if (this.isClosed()) {
         return DoorState.CLOSED
       } else if (this.hasOpenSensor()) {
         return this.isOpen() ? DoorState.OPEN : DoorState.STOPPED 
       } else {
         return DoorState.OPEN
       }
  },
  
  doorStateToString: function(state) {
    switch (state) {
      case DoorState.OPEN:
        return "OPEN"
      case DoorState.CLOSED:
        return "CLOSED"
      case DoorState.STOPPED:
        return "STOPPED"
      default:
        return "UNKNOWN"
    }
  },

  monitorDoorState: function() {
     var isClosed = this.isClosed()
     var isOpen = this.isOpen()
     if (isClosed != this.wasClosed) {
       var state = this.determineCurrentDoorState()
       if (!this.operating) {
         this.log("State changed to " + this.doorStateToString(state))
         this.wasClosed = isClosed
         this.currentDoorState.setValue(state)
         this.targetState = state
       }
     }
     setTimeout(this.monitorDoorState.bind(this), this.sensorPollInMs)
  },

  hasOpenSensor: function() {
    return this.openDoorSensorInput != null
  },

  hasClosedSensor: function() {
    return this.closedDoorSensorInput != null
  },

  initService: function() {
    this.garageDoorOpener = new Service.GarageDoorOpener(this.name,this.name)
    this.currentDoorState = this.garageDoorOpener.getCharacteristic(DoorState)
    this.currentDoorState.on('get', this.getState.bind(this))
    this.targetDoorState = this.garageDoorOpener.getCharacteristic(Characteristic.TargetDoorState)
    this.targetDoorState.on('set', this.setState.bind(this))
    this.targetDoorState.on('get', this.getTargetState.bind(this))
    var isClosed = this.isClosed()

    this.wasClosed = isClosed
    this.operating = false
    this.infoService = new Service.AccessoryInformation()
    this.infoService
      .setCharacteristic(Characteristic.Manufacturer, "Opensource Community")
      .setCharacteristic(Characteristic.Model, "RaspPi PiFace GarageDoor")
      .setCharacteristic(Characteristic.SerialNumber, this.version)
  
    if (this.hasOpenSensor() || this.hasClosedSensor()) {
        this.log(this.name + " have a sensor, monitoring state enabled.")
        setTimeout(this.monitorDoorState.bind(this), this.sensorPollInMs)
    }

    this.log("Initial State: " + (isClosed ? "CLOSED" : "OPEN"))
    this.currentDoorState.setValue(isClosed ? DoorState.CLOSED : DoorState.OPEN)
    this.targetDoorState.setValue(isClosed ? DoorState.CLOSED : DoorState.OPEN)
  },

  getTargetState: function(callback) {
    callback(null, this.targetState)
  },

  readPin: function(pin) {
    return pi.get(pin)
   },

  writePin: function(pin,val) {
    pi.set(pin,val)
  },

  isClosed: function() {
    if (this.hasClosedSensor()) {
        return this.readPin(this.closedDoorSensorInput) == this.closedDoorSensorValue
    } else if (this.hasOpenSensor()) {
        return !this.isOpen()
    } else {
        return this.wasClosed
    }
  },

  isOpen: function() {
    if (this.hasOpenSensor()) {
        return this.readPin(this.openDoorSensorInput) == this.openDoorSensorValue
    } else if (this.hasClosedSensor()) {
        return !this.isClosed()
    } else {
        return !this.wasClosed
    }
  },

  switchOn: function() {
    this.writePin(this.doorSwitchOutput, this.relayOn)
    this.log("Turning on " + this.name + " (Relay " + this.doorSwitchOutput + ") = " + this.relayOn)
    setTimeout(this.switchOff.bind(this), this.doorSwitchPressTimeInMs)
  },

  switchOff: function() {
    this.writePin(this.doorSwitchOutput, this.relayOff)
    this.log("Turning off " + this.name + " (Relay " + this.doorSwitchOutput + ") = " + this.relayOff)
  },

  setFinalDoorState: function() {
    if (!this.hasClosedSensor() && !this.hasOpenSensor()) {
      var isClosed = !this.isClosed()
      var isOpen = this.isClosed()
    } else {
      var isClosed = this.isClosed()
      var isOpen = this.isOpen()
    }
    if ( (this.targetState == DoorState.CLOSED && !isClosed) || (this.targetState == DoorState.OPEN && !isOpen) ) {
      this.log("Was trying to " + (this.targetState == DoorState.CLOSED ? "CLOSE" : "OPEN") + " " + this.name + " , but it is still " + (isClosed ? "CLOSED":"OPEN"))
      this.currentDoorState.setValue(DoorState.STOPPED)
    } else {
      this.log("Set current state to " + (this.targetState == DoorState.CLOSED ? "CLOSED" : "OPEN"))
      this.wasClosed = this.targetState == DoorState.CLOSED
      this.currentDoorState.setValue(this.targetState)
    }
    this.operating = false
  },

  setState: function(state, callback) {
    this.log("Setting state to " + state)
    this.targetState = state
    var isClosed = this.isClosed()
    if ((state == DoorState.OPEN && isClosed) || (state == DoorState.CLOSED && !isClosed)) {
        this.log("Triggering Relay")
        this.operating = true
        if (state == DoorState.OPEN) {
            this.currentDoorState.setValue(DoorState.OPENING)
        } else {
            this.currentDoorState.setValue(DoorState.CLOSING)
        }
	setTimeout(this.setFinalDoorState.bind(this), this.doorOpensInSeconds * 1000)
	this.switchOn()
    }

    callback()
    return true
  },

  getState: function(callback) {
    var isClosed = this.isClosed()
    var isOpen = this.isOpen()
    var state = isClosed ? DoorState.CLOSED : isOpen ? DoorState.OPEN : DoorState.STOPPED
    this.log(this.name + (isClosed ? " is CLOSED ("+DoorState.CLOSED+")" : isOpen ? " is OPEN ("+DoorState.OPEN+")" : " is STOPPED (" + DoorState.STOPPED + ")")) 
    callback(null, state)
  },

  getServices: function() {
    return [this.infoService, this.garageDoorOpener]
  }
}
