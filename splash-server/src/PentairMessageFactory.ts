import PentairMessage from "./PentairMessage";

export default class PentairMessageFactory {

    static parse(command: number[]) {
        if (command.length < 9) {
            throw new Error('Command array does not have enough elements');
        }

        const instance = new PentairMessage();

        instance.header = command.slice(0, 4);
        instance.protocol = instance.getProtocolType(command[4]); // Using a helper function to determine the ProtocolType
        instance.destination = instance.getIdentifierType(command[5]);
        instance.source = instance.getIdentifierType(command[6]);
        instance.command = command[7];
        instance.length = command[8];

        const expectedLength = this.length + 9; // length + header, protocol, destination, source, command, length, data, checksum
        if (command.length < expectedLength) {
            throw new Error('Command array does not have enough elements for the specified length');
        }

        instance.data = command.slice(9, 9 + this.length);

        // Set checksum directly from command array
        instance.checksum = command.slice(9 + this.length, 9 + this.length + 2);

        // Validate command and set isValid property
        instance.validateCommand(command);

        // Assign remaining elements (if any) to the padding property
        instance.padding = command.slice(9 + this.length + 2);

        // Alternatively, if you want to ignore any extra elements silently:
        // this.padding = command.slice(9 + this.length + 2);

        if (instance.isValid) {
            //if the command is valid then try to parse its data into a known format and return that object   
            return instance;
        } else {
            throw new Error('Data Checksum was invalid')
        }
    }
}
