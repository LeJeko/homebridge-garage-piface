<p align="center">
  <a href="https://github.com/homebridge/homebridge"><img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>

<span align="center">

# homebridge-garage-piface

[![npm](https://img.shields.io/npm/v/homebridge-garage-piface.svg)](https://www.npmjs.com/package/homebridge-garage-piface) [![npm](https://img.shields.io/npm/dt/homebridge-garage-piface.svg)](https://www.npmjs.com/package/homebridge-garage-piface)

</span>

## Breaking Note
From version 2.x the plugin uses the node-pifacedigital dependency instead of piface-node-12.

Please install new necessary libraries as explained below.

## Description
Garage and/or Gate Opener plugin for [HomeBridge](https://github.com/nfarina/homebridge) for Raspberry Pi with PiFace board.

This plugin is suitable for any device as a garage door or a gate motor that needs a brief contact (switch) to trigger an action as a opening or a closing.

This fork is adapted from [homebridge-garage-gate-opener](https://github.com/MForge/homebridge-garage-gate-opener) by [MForge.org](https://www.mforge.org/fr/2017/11/08/homebridge-controle-de-porte-de-garage-etou-de-portail-home-de-apple/)

## Installation

On a fresh installation you should enable SPI.

Therefore start `raspi-config` -> `Interface Options` -> `SPI` -> `Yes`.

Reboot the RPi.

#### Install necessary libraries

```
git clone https://github.com/piface/libmcp23s17.git
cd libmcp23s17/
make
sudo make install
cd ..
```

```
git clone https://github.com/piface/libpifacedigital.git
cd libpifacedigital/
make
sudo make install
cd ..
```

#### Install the plugin
Use Homebridge web UI
or
```
hb-service add homebrige-garage-piface
```

## Configuration

_config.json_

```
"accessories": [
	{
	"accessory": "GaragePiFace",
	"name": "Garage",
	"switchOutput": 0,
	"switchPressTimeInMs": 1000,		// optional
	"switchValue": 1,			// optional
	"closedSensorInput": 0, 		// optional
	"closedSensorValue": 1, 		// optional
	"openSensorInput": 1,   		// optional
	"openSensorValue": 1,   		// optional
	"pollInMs": 4000,       		// optional
	"opensInSeconds": 10			// optional
	}
]
```
