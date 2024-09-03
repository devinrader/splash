enum ProtocolType {
  IntelliFlo = 0,
  Pentair = 1,
  Unknown = -1,
}

enum IdentifierType {
  Broadcast = 15,
  Controller = 16,
  Unknown = -1,
}

export default class PentairMessageFactory {
  header: number[];
  protocol: ProtocolType;
  destination: IdentifierType;
  source: IdentifierType;
  command: number;
  length: number;
  data: number[];
  checksum: number[];
  padding: number[];
  isValid: boolean;

  constructor() {
    this.header = [];
    this.protocol = ProtocolType.Unknown; // Default to Unknown if protocol value is not explicitly set
    this.destination = IdentifierType.Unknown; // Default to Unknown for destination
    this.source = IdentifierType.Unknown; // Default to Unknown for source
    this.command = 0;
    this.length = 0;
    this.data = [];
    this.checksum = [0, 0]; // Initialize checksum as two bytes [high-order, low-order]
    this.padding = [];
    this.isValid = false; // Default to false until checksum validation is performed
  }

  public getProtocolType(value: number): ProtocolType {
    switch (value) {
      case 0:
        return ProtocolType.IntelliFlo;
      case 1:
        return ProtocolType.Pentair;
      default:
        return ProtocolType.Unknown;
    }
  }

  public getIdentifierType(value: number): IdentifierType {
    switch (value) {
      case 15:
        return IdentifierType.Broadcast;
      case 16:
        return IdentifierType.Controller;
      default:
        return IdentifierType.Unknown;
    }
  }

  public validateCommand(command: number[]) {
    // Initialize checksum to zero
    let sum = 0;

    // Calculate sum from the fourth byte of command to the position after the last byte of data
    const endPosition = 9 + this.length;
    for (let i = 3; i < endPosition; i++) {
      sum += command[i];
    }

    // Ignore overflow (checksum calculated mod 2^16)
    sum = sum & 0xFFFF;

    // Separate into high-order and low-order bytes
    const calculatedChecksumHigh = (sum >> 8) & 0xFF; // high-order byte
    const calculatedChecksumLow = sum & 0xFF; // low-order byte

    // Set isValid property based on checksum validation
    this.isValid = (
      this.checksum[0] === calculatedChecksumHigh &&
      this.checksum[1] === calculatedChecksumLow
    );

    // Debug log
    console.log(`Checksum: [${this.checksum[0]}, ${this.checksum[1]}], Validated Checksum: [${calculatedChecksumHigh}, ${calculatedChecksumLow}], isValid: ${this.isValid}`);
  }
}