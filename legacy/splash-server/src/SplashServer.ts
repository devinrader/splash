import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
//import PentairCommandFactory from './PentairMessageFactory';
import PentairMessageFactory from './PentairMessageFactory';


export default class SplashServer {
  /**
   * 
   * 
   * 
   */
  private app: express.Application;
  private buffer: number[];
  private sequenceToMatch: number[];

  constructor() {
    this.app = express();
    this.buffer = [];
    this.sequenceToMatch = [255, 0, 255, 165];

    this.app.use(bodyParser.text({ type: "*/*" }));
    this.app.post('/ingest', this.handleIngest.bind(this));
    this.app.get('/generator', this.handleGenerator.bind(this));
  }

  /**
   * Starts the webserver
   */
  public start() {
    this.app.listen(3000, () => {
      console.log('Server listening on port 3000');
    });
  }

  private handleIngest(req: Request, res: Response) {
    this.transform(Buffer.from(req.body, 'base64'));
    res.sendStatus(200);
  }

  private handleGenerator(req: Request, res: Response) {
    console.log(`Client Connected`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    res.on('close', () => {
      console.log('Client dropped me');
      res.end();
    });
  }

  // Method to transform incoming data
  private transform(chunk: Buffer) {
    const data = Array.from(chunk);
    this.buffer.push(...data);

    const matches = [];

    if (this.buffer.length > this.sequenceToMatch.length) {
      const foundIndices = this.findAllIndices(this.buffer, this.sequenceToMatch);

      if (foundIndices.length == 1 && foundIndices[0] != 0) {
        this.buffer.splice(0, foundIndices[0]);
      }

      if (foundIndices.length >= 2) {
        const commandbuffer = this.extractCommands(this.buffer, foundIndices);
        commandbuffer.forEach((data) => {
          console.log(data);

          try {

            const command = PentairMessageFactory.parse(data);

          } catch (err) {
            console.log(err)
          }
          



        });
        this.buffer.splice(0, foundIndices[foundIndices.length - 1]);
      }
    }
  }

  // Method to find all indices of a sequence in a buffer
  private findAllIndices(buffer: number[], sequenceToMatch: number[]): number[] {
    const matchLength = sequenceToMatch.length;
    const result: number[] = [];

    for (let i = 0; i <= buffer.length - matchLength; i++) {
      if (buffer[i] === sequenceToMatch[0]) {
        let found = true;
        for (let j = 1; j < matchLength; j++) {
          if (buffer[i + j] !== sequenceToMatch[j]) {
            found = false;
            break;
          }
        }
        if (found) {
          result.push(i);
        }
      }
    }

    return result;
  }

  // Method to extract commands between indices
  private extractCommands(buffer: number[], indices: number[]): number[][] {
    const commands: number[][] = [];

    if (indices.length >= 2) {
      for (let i = 0; i < indices.length - 1; i++) {
        let command = buffer.slice(indices[i], indices[i + 1]);
        commands.push(command);
      }
    }

    return commands;
  }
}


