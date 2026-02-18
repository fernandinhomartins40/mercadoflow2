import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'desktop-app.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create log directory:', err);
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private rotating = false;

  private formatMessage(level: LogLevel, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}\n`;
  }

  private writeToFile(formatted: string) {
    try {
      // Rotate log if too large
      if (!this.rotating && fs.existsSync(LOG_FILE)) {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > MAX_LOG_SIZE) {
          this.rotateLog();
        }
      }

      fs.appendFileSync(LOG_FILE, formatted, 'utf-8');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  private rotateLog() {
    try {
      this.rotating = true;
      const backupFile = path.join(LOG_DIR, `desktop-app.log.${Date.now()}.old`);
      fs.renameSync(LOG_FILE, backupFile);

      // Keep only last 5 backup files
      const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('desktop-app.log.') && f.endsWith('.old'))
        .sort()
        .reverse();

      files.slice(5).forEach(f => {
        try {
          fs.unlinkSync(path.join(LOG_DIR, f));
        } catch {
          // ignore
        }
      });
    } catch (err) {
      console.error('Failed to rotate log:', err);
    } finally {
      this.rotating = false;
    }
  }

  debug(message: string, context?: any) {
    const formatted = this.formatMessage(LogLevel.DEBUG, message, context);
    console.debug(message, context);
    this.writeToFile(formatted);
  }

  info(message: string, context?: any) {
    const formatted = this.formatMessage(LogLevel.INFO, message, context);
    console.info(message, context);
    this.writeToFile(formatted);
  }

  warn(message: string, context?: any) {
    const formatted = this.formatMessage(LogLevel.WARN, message, context);
    console.warn(message, context);
    this.writeToFile(formatted);
  }

  error(message: string, error?: any) {
    const context = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;
    const formatted = this.formatMessage(LogLevel.ERROR, message, context);
    console.error(message, error);
    this.writeToFile(formatted);
  }

  getLogPath(): string {
    return LOG_FILE;
  }

  getLogContent(lines: number = 100): string[] {
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return [];
      }
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const allLines = content.split('\n').filter(Boolean);
      return allLines.slice(-lines);
    } catch (err) {
      this.error('Failed to read log file', err);
      return [];
    }
  }
}

export const logger = new Logger();
export default logger;
