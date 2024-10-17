import minimist, { ParsedArgs } from 'minimist';
import EventSource from 'eventsource';
import { SerialPort } from 'serialport';
import axios, { AxiosError } from 'axios';

export default class SplashRelay {
  private _buffer: Buffer = Buffer.alloc(0);
  private _eventSource: EventSource | undefined = undefined;

  public start(port: SerialPort | undefined = undefined): void {

    const parsedargs: ParsedArgs = minimist(process.argv.slice(2), {
      alias: {
        device: 'serialDevicePath',
        baud: 'baudRate',
        server: 'serverAddress',
        listner: 'listenerPath',
        generator: 'generatedPath',
        buffer: 'bufferThreshold',
        debug: 'debugFormat',
        help: 'help'
      },
      default: {
        serialDevicePath: undefined, // '/dev/ttyUSB0', '/dev/ttyACM0', '/dev/ttyMOCK';
        baudRate: 9600,
        serverAddress: undefined,
        listenerPath: '/listener',
        generatorPath: '/generator',
        bufferThreshold: 256,
        debugFormat: 'b'
      },
      string: ['configPath', 'serialDevicePath', 'baudRate', 'serverAddress', 'listenerPath', 'generatorPath', 'bufferThreshold', 'debugFormat']
    });

    if (parsedargs.help) {
      console.log(`
Usage: node index.js [options]

Options:
-device, --devicepath <value>    Specify the path of the serial device
-baud, --baud <value>    Specify the serial baud rate.  Defaults to 9600.
-server, --serveraddress <value>    The host name or IP address of where to send commands
-buffer, --buffersize <value> Specify the amount of data to buffer before sending to the server
-debug, --debug <value>   Specify debug output type (byte or decimal)
-help, --help            Show help
`);
      return;
    }

    // Test to see if the remote server exists so we know if we should try to send buffer data to it or not.

    console.log(`Starting Splash Relay`)

    // console.log(`Connecting to event server ${this._config.GeneratorFullPath}`);
    // this._eventSource = new EventSource(this._config.GeneratorFullPath);
    // this._eventSource.onopen = () => {
    //   console.log(`Connected to server.  Waiting for events.`);
    // };
    // this._eventSource.addEventListener('message', (event: MessageEvent) => {
    //   console.log('Message received:', event.data);
    // });
    // this._eventSource.addEventListener('error', (err) => {
    //   console.error('EventSource error event:', err);
    // });

    if (port) {
      console.log(`Using existing stream ${port.path}`);
    } else {
      console.log(`Opening port ${parsedargs.serialDevicePath}, ${parsedargs.baudRate}`);
      port = new SerialPort({ path: parsedargs.serialDevicePath, baudRate: parsedargs.baudRate });
    }

    // Open errors will be emitted as an error event
    port.on('error', function (err) {
      console.log('Serial port error: ', err.message)
    })

    port.on('open', () => {
      console.log(`Serial port ${parsedargs.serialDevicePath} is open`);
    });

    port.on('data', async (data: Buffer) => {

      if (parsedargs.debugFormat === 'b') {
        console.log(data)
      } else if (parsedargs.debugFormat === 'd') {
        console.log(Array.from(data));
      } else {
        console.log('Unknown DebugFormat')
      }

      this._buffer = Buffer.concat([this._buffer, data]);

      if (this._buffer.length >= parsedargs.bufferThreshold) {
        try {
          const response = await axios.post(parsedargs.listenerFullPath, this._buffer.toString('base64'), { headers: { 'Content-Type': 'text/plain' } });
          if (response.status == 200) {
            this._buffer = Buffer.alloc(0); //if the response is OK, then clear the buffer
          }
        } catch (err) {
          const error = err as Error | AxiosError;
          if (axios.isAxiosError(error)) {
            if (error.response) {
              console.log(error.response.status);
            } else if (error.request) {
              //console.log(error.request);
            } else {
              // Something happened in setting up the request and triggered an Error
              console.log('Error', error.message);
            }
          }
        }
      }
    });
  }
}