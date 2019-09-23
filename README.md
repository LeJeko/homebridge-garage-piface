# homebridge-garage-piface
Garage and/or Gate Opener plugin for [HomeBridge](https://github.com/nfarina/homebridge) for Raspberry Pi with PiFace board.

This plugin is suitable for any device as a garage door or a gate motor that needs a brief contact (switch) to trigger an action as a opening or a closing.

This fork is adapted from [homebridge-garage-gate-opener](https://github.com/MForge/homebridge-garage-gate-opener) by [MForge.org](https://www.mforge.org/fr/2017/11/08/homebridge-controle-de-porte-de-garage-etou-de-portail-home-de-apple/)

## Requirement

Before installing this plug-in, you need:

* Download, build and install the C libraries:

```bash
sudo apt-get install automake libtool git
git clone https://github.com/thomasmacpherson/piface.git
cd piface/c
./autogen.sh && ./configure && make && sudo make install
sudo ldconfig
cd ../scripts
sudo ./spidev-setup
```

* Activate SPI

```bash
sudo raspi-config
-> Interfacing Options -> Enable SPI
```

## Installation

```bash
npm -g install homebridge-garage-piface
```
## Configuration

_config.json_

```json
"accessories": [
        {
			"accessory": "GaragePiFace",
			"name": "Garage",
			"switchOutput": 0,
			"switchPressTimeInMs": 1000,	// optional
			"switchValue": 1,				// optional
			"closedSensorInput": 0, 		// optional
			"closedSensorValue": 1, 		// optional
			"openSensorInput": 1,   		// optional
			"openSensorValue": 1,   		// optional
			"pollInMs": 4000,       		// optional
			"opensInSeconds": 10			// optional
		}
]
```
