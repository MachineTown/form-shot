import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  username: string;
  password: string;
  logLevel: string;
}

export function loadConfig(): Config {
  const username = process.env.USERNAME;
  const password = process.env.PASSWORD;
  
  if (!username || !password) {
    throw new Error('USERNAME and PASSWORD must be set in .env file');
  }
  
  return {
    username,
    password,
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}