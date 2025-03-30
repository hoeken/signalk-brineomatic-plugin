# signalk-yarrboard-plugin

SignalK plugin for interfacing with [Brineomatic](https://github.com/hoeken/brineomatic) watermaker controllers.

## Setup

Add your board hosts and configure login info in the plugin preferences

## Data Format

```{boardname}``` is your board hostname, defaults to ```brineomatic```

SignalK path info as below:

| Path                                                     | Description              |
| --------------------------------------------------------- | ------------------------ |
| `watermaker.{boardname}.board.firmware_version`          | firmware version         |
| `watermaker.{boardname}.board.hardware_version`          | hardware version         |
| `watermaker.{boardname}.board.hostname`                  | local board hostname     |
| `watermaker.{boardname}.board.name`                      | User friendly name       |
| `watermaker.{boardname}.board.uptime`                    | controller uptime        |
| `watermaker.{boardname}.board.use_ssl`                   | do we use ssl?           |
| `watermaker.{boardname}.board.uuid`                      | unique id of the board   |


The rest of the data is located at watermaker.{boardname}.*  Please see the metadata for detailed description and units.
