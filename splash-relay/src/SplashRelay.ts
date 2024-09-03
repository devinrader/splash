import minimist, { ParsedArgs } from 'minimist';
import EventSource from 'eventsource';
import Configuration from './configuration.js'
import { SerialPort } from 'serialport';
import { SerialPortStream } from '@serialport/stream'
import axios from 'axios';

export default class SplashRelay {

  private _config: Configuration = new Configuration();
  private _buffer: Buffer = Buffer.alloc(0);
  private _port: any;
  private _eventSource: EventSource | undefined = undefined;

  public start(stream: SerialPortStream | undefined = undefined): void {

    const parsedargs: ParsedArgs = minimist(process.argv.slice(2), {
      alias: {
        c: 'configPath',
        p: 'serialDevicePath',
        b: 'baudRate',
        s: 'serverAddress',
        l: 'listenerPath',
        g: 'generatedPath',
        z: 'bufferThreshold',
        d: 'debugFormat',
        h: 'help'
      },
      default: {
        configPath: undefined,
        serialDevicePath: undefined, // '/dev/ttyUSB0', '/dev/ttyACM0', '/dev/ttyMOCK';
        baudRate: undefined,
        serverAddress: undefined,
        listenerPath: undefined,
        generatorPath: undefined,
        bufferThreshold: undefined,
        debugFormat: undefined
      },
      string: ['configPath', 'serialDevicePath', 'baudRate', 'serverAddress', 'listenerPath', 'generatorPath', 'bufferThreshold', 'debugFormat']
    });

    if (parsedargs.help) {
      console.log(`
Usage: node index.js [options]

Options:
-c, --configpath <value>    Specify the path to the .splash configuration file.
-p, --devicepath <value>    Specify the path of the serial device
-b, --baud <value>    Specify the serial baud rate.  Defaults to 9600.
-s, --serveraddress <value>    The host name or IP address of where to send commands
-z, --buffersize <value> Specify the amount of data to buffer before sending to the server
-d, --debug <value>   Specify debug output type (byte or decimal)
-h, --help            Show help
`);
      return;
    }


    try {
      this._config.init(parsedargs);
    } catch (error: any) {
      console.error(error.message);
      return;
    }

    if (!this._config.IsInitialzed) {
      console.error('Failed to initialize');
      return;
    }

    console.log(`Starting Splash Relay`)

    console.log(`Connecting to event server ${this._config.GeneratorFullPath}`);
    this._eventSource = new EventSource(this._config.GeneratorFullPath);
    this._eventSource.onopen = () => {
      console.log(`Connected to server.  Waiting for events.`);
    };
    this._eventSource.addEventListener('message', (event: MessageEvent) => {
      console.log('Message received:', event.data);
    });
    this._eventSource.addEventListener('error', (err) => {
      console.error('EventSource error event:', err);
    });

    if (stream) {
      console.log(`Using existing stream ${stream.path}`);
    } else {
      console.log(`Opening port ${this._config.SerialDevicePath}`);
      stream = new SerialPort({ path: this._config.SerialDevicePath, baudRate: this._config.BaudRate });
    }

    stream.on('open', () => {
      console.log(`Serial port ${this._config.SerialDevicePath} is open`);
    });

    stream.on('data', async (data: Buffer) => {
      if (this._config.DebugFormat === 'b') {
        console.log(data)
      } else if (this._config.DebugFormat === 'd') {
        console.log(Array.from(data));
      } else { }

      this._buffer = Buffer.concat([this._buffer, data]);

      if (this._buffer.length >= this._config.BufferThreshold) {
        const response = await axios.post(this._config.ListenerFullPath, this._buffer.toString('base64'), { headers: { 'Content-Type':'text/plain'}});
        if (response.status == 200) {
          this._buffer = Buffer.alloc(0); //if the response is OK, then clear the buffer
        }
      }
    });
  }

}