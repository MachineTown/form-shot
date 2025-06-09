#!/usr/bin/env node

import { Command } from 'commander';
import { analyzeSurvey } from './commands/analyze';
import { SurveyTuple } from './utils/types';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('form-shot')
  .description('Automated survey form analysis tool')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze survey form at given URL')
  .argument('<url>', 'URL of the survey form to analyze')
  .argument('<tuple>', 'Tuple string in format: [customer_id,study_id,package_name,language,version]')
  .action(async (url: string, tupleString: string) => {
    try {
      // Parse the tuple string
      const tuple = parseTupleString(tupleString);
      logger.info(`Starting analysis of ${url}`);
      logger.info(`Tuple: ${JSON.stringify(tuple)}`);
      
      await analyzeSurvey(url, tuple);
    } catch (error) {
      logger.error('Analysis failed:', error);
      process.exit(1);
    }
  });

function parseTupleString(tupleString: string): SurveyTuple {
  // Remove brackets and split by comma
  const cleaned = tupleString.replace(/[\[\]]/g, '').trim();
  const parts = cleaned.split(',').map(part => part.trim());
  
  if (parts.length !== 5) {
    throw new Error('Tuple must contain exactly 5 elements: [customer_id,study_id,package_name,language,version]');
  }
  
  return {
    customerId: parts[0],
    studyId: parts[1],
    packageName: parts[2],
    language: parts[3],
    version: parts[4]
  };
}

program.parse();