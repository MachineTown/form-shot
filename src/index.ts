#!/usr/bin/env node

import { Command } from 'commander';
import { AnalyzeCommand } from './commands/analyze';
import { AnalyzeOptions } from './utils/types';
import logger from './utils/logger';

const program = new Command();

program
  .name('form-shot')
  .description('Automated form analysis and test case generation tool')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze a form and generate test matrix')
  .argument('<url>', 'URL of the form to analyze')
  .option('-o, --output <path>', 'Output file path for test matrix', 'output/test-matrix.json')
  .option('-v, --viewport <size>', 'Browser viewport size (WxH)', '1024x768')
  .option('-w, --wait-for <ms>', 'Wait time after page load (milliseconds)', '3000')
  .action(async (url: string, options: any) => {
    try {
      const analyzeOptions: AnalyzeOptions = {
        url,
        output: options.output,
        viewport: options.viewport,
        waitFor: parseInt(options.waitFor)
      };
      
      const analyzeCommand = new AnalyzeCommand();
      await analyzeCommand.execute(analyzeOptions);
      
    } catch (error) {
      logger.error('Command failed:', error);
      process.exit(1);
    }
  });

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});

program.parse();