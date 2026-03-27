import { Readable } from 'stream';

interface EventHandler<T> {
  (data: T): void;
}

class ChunkAvailableEvent<T> {
  private handlers: EventHandler<T>[] = [];

  // Method to subscribe to the event
  public addEventListener(handler: EventHandler<T>): void {
    this.handlers.push(handler);
  }

  // Method to unsubscribe from the event
  public removeEventListener(handler: EventHandler<T>): void {
    this.handlers = this.handlers.filter(h => h !== handler);
  }

  // Method to trigger the event
  public triggerEvent(data: T): void {
    this.handlers.slice(0).forEach(h => h(data));
  }
}

export default class RandomDataGenerator<T> {
  //public readableStream: Readable;
  private isRunning: boolean;
  private randomData: number[];
  public onChunkAvailable = new ChunkAvailableEvent<Buffer>();
  
  constructor() {
    this.isRunning = false;
    this.randomData = [];
  }

  public Start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.generateRandomDataLoop();
  }

  public Stop() {
    this.isRunning = false;
  }

  private generateRandomDataLoop() {
    const generateRandomChunk = () => {
      // Generate 1024 random numbers between 0 and 255
      this.randomData = Array.from({ length: 1024 }, () => Math.floor(Math.random() * 256));

      // Insert sequence 255, 0, 255, 165 up to 6 times
      const maxInsertions = 6;
      for (let i = 0; i < maxInsertions; i++) {
        const insertIndex = Math.floor(Math.random() * this.randomData.length);
        this.randomData.splice(insertIndex, 0, 255, 0, 255, 165);
      }

      // Process random sized chunks from randomData and push to readableStream
      let currentIndex = 0;
      while (currentIndex < this.randomData.length) {
        const chunkSize = Math.floor(Math.random() * 128) + 1;
        const chunk = this.randomData.slice(currentIndex, currentIndex + chunkSize);
        currentIndex += chunkSize;

        if (chunk.length > 0) {
          const chunkBuffer = Buffer.from(chunk);
          this.onChunkAvailable.triggerEvent(chunkBuffer);
          //if (!this.readableStream.push(chunkBuffer)) {
          // Pausing if the stream buffer is full
          //  this.readableStream.pause();
          //}
          // Pipe chunk to console
          //console.log(`Received chunk: ${chunk}`);
        }
      }

      // Check if we need to end the stream
      if (!this.isRunning) {
        //this.readableStream.push(null); // End the stream
        return;
      }

      // Wait for a random time between 50ms and 500ms before looping
      const randomDelay = Math.floor(Math.random() * 451) + 50;
      setTimeout(generateRandomChunk, randomDelay);
    };

    generateRandomChunk();
  }
}
