import { ParsedArgs } from "minimist";
import config from 'config';

interface SplashConfig {
  serverAddress: string;
  listenerPath: string;
  generatorPath: string;
  serialDevicePath: string;
  baudRate: number;
  bufferThreshold: number;
  debugFormat: string;
}

export default class Configuration {
  private _serverAddress: string = '';
  private _listenerPath: string = '';
  private _generatorPath: string = '';
  private _serialDevicePath: string = '';
  private _baudRate: number = 9600;
  private _bufferThreshold: number = 256;
  private _debugFormat: string = 'b';
  private _isInitialized: boolean = false;

  constructor() {}

  public init(args: ParsedArgs) {

    const splashConfig: SplashConfig = config.get('relay');

    // For any command line args present, make them override the config values
    if (args.serverAddress) { splashConfig.serverAddress = args.serverAddress }
    if (args.listenerPath) { splashConfig.listenerPath = args.listernerPath }
    if (args.generatorPath) { splashConfig.generatorPath = args.generatorPath }
    if (args.serialDevicePath) { splashConfig.serialDevicePath = args.serialDevicePath }
    if (args.baudRate) { splashConfig.baudRate = args.baudRate }
    if (args.bufferThreshold) { splashConfig.bufferThreshold = args.bufferThreshold }
    if (args.debugFormat) { splashConfig.debugFormat = args.debugFormat }

    if (splashConfig.serverAddress && !this.isValidURL(splashConfig.serverAddress)) {
      throw new Error(`Invalid server address: ${splashConfig.serverAddress}`);
    }
    this._serverAddress = args.serveraddress;

    if (splashConfig.serverAddress) this._serverAddress = splashConfig.serverAddress;
    if (splashConfig.listenerPath) this._listenerPath = splashConfig.listenerPath;
    if (splashConfig.generatorPath) this._generatorPath = splashConfig.generatorPath;
    if (splashConfig.serialDevicePath) this._serialDevicePath = splashConfig.serialDevicePath;
    if (splashConfig.baudRate) this._baudRate = splashConfig.baudRate;
    if (splashConfig.bufferThreshold) this._bufferThreshold = splashConfig.bufferThreshold;
    if (splashConfig.debugFormat && !['b', 'd'].includes(splashConfig.debugFormat)) {
      throw new Error(`Invalid debugFormat value: ${splashConfig.debugFormat}`);
    }
    this._debugFormat = splashConfig.debugFormat;
    this._isInitialized = true;
  }

  public get IsInitialzed(): boolean {
    return this._isInitialized;
  }

  public get ServerAddress(): string {
    return this._serverAddress;
  }

  public get ListenerPath(): string {
    return this._listenerPath;
  }

  public get GeneratorPath(): string {
    return this._generatorPath;
  }

  public get SerialDevicePath(): string {
    return this._serialDevicePath;
  }

  public get BaudRate(): number {
    return this._baudRate;
  }

  public get BufferThreshold(): number {
    return this._bufferThreshold;
  }

  public get DebugFormat(): string {
    return this._debugFormat;
  }

  public get ListenerFullPath(): string {
    return `${this.ServerAddress}${this.ListenerPath}`
  }

  public get GeneratorFullPath(): string {
    return `${this.ServerAddress}${this.GeneratorPath}`
  }

  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }
}