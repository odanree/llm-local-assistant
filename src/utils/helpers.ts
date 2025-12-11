import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function readFile(filePath: string): Promise<string> {
  const contents = await fs.readFile(filePath, 'utf8');
  return contents;
}

export function writeFile(filePath: string, content: string): void {
  fs.writeFile(filePath, content, 'utf8')
    .then(() => console.log('Successfully written to file'))
    .catch((error) => console.error(`Error writing to file: ${error}`));
}

export function getUniqueId(): string {
  return uuidv4();
}

export function joinPaths(...paths: Array<string>): string {
  return path.join(...paths);
}