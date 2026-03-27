class IntelliFloPump {
    static START_DELIMITER = [0xFF, 0x00, 0xFF, 0xA5];
  
    protocol: number;
    destination: number;
    source: number;
    command: number;
    dataLength: number;
    data: number[];
  
    constructor(protocol: number, destination: number, source: number) {
      this.protocol = protocol;
      this.destination = destination;
      this.source = source;
      this.command = command;
    }
  
    /**
     * Builds a message frame based on the Pentair protocol
     */
    buildFrame(command: number, data: number[] = []): number[] {
      const dataLength = data.length;
      const header = [
        ...IntelliFloPump.START_DELIMITER,
        this.protocol,
        this.destination,
        this.source,
        command,
        dataLength,
      ];
  
      const fullMessage = [...header, ...data];
      const checksum = this.calculateChecksum(fullMessage.slice(3)); // Start at 0xA5
      fullMessage.push((checksum >> 8) & 0xFF); // High byte
      fullMessage.push(checksum & 0xFF);        // Low byte
  
      return fullMessage;
    }
  
    /**
     * Parses a received frame and returns a structured object if valid
     */
    parseFrame(frame: number[]): {
      protocol: number;
      destination: number;
      source: number;
      command: number;
      data: number[];
    } | null {
      if (
        frame.length < 10 ||
        !IntelliFloPump.START_DELIMITER.every((b, i) => frame[i] === b)
      ) {
        return null;
      }
  
      const protocol = frame[4];
      const destination = frame[5];
      const source = frame[6];
      const command = frame[7];
      const dataLength = frame[8];
  
      const dataStart = 9;
      const dataEnd = dataStart + dataLength;
      const data = frame.slice(dataStart, dataEnd);
  
      const expectedChecksum = this.calculateChecksum(frame.slice(3, dataEnd));
      const receivedChecksum =
        (frame[dataEnd] << 8) | frame[dataEnd + 1];
  
      if (expectedChecksum !== receivedChecksum) {
        return null;
      }
  
      return { protocol, destination, source, command, data };
    }
  
    /**
     * Calculates a checksum on the frame data
     */
    private calculateChecksum(bytes: number[]): number {
      return bytes.reduce((sum, byte) => (sum + byte) & 0xFFFF, 0);
    }
  }
  