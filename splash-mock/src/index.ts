import { MockBinding } from '@serialport/binding-mock'
import { SerialPortStream } from '@serialport/stream'
import RandomDataStream from './RandomDataStream.js'
import SplashRelay from '../../splash-relay/src/SplashRelay.js'

const randomDataGenerator = new RandomDataStream();
const path = '/dev/ttyMOCK'

MockBinding.createPort(path, {echo: true, record: false})
const stream = new SerialPortStream({binding: MockBinding, path: path, baudRate: 9600 })

stream.on('open', () => {
  console.log(`Test port is open`)
  randomDataGenerator.onChunkAvailable.addEventListener(data => {
    let b: Buffer = data;
    stream.write(b)
  });

  const splashRelay = new SplashRelay();
  splashRelay.start(stream)

  randomDataGenerator.Start();
});