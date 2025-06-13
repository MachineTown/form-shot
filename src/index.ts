#!/usr/bin/env node

import { Command } from 'commander';
import { analyzeSurvey } from './commands/analyze';
import { uploadToFirestore, queryFirestore, clearFirestore } from './commands/upload';
import { 
  generatePatternStats,
  exportUnknownFields,
  queryTestCases,
  getCompleteAnalysis,
  updateTestCaseStatus
} from './commands/test-data';
import { runTests } from './commands/test-run';
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
  .option('--nav-delay <seconds>', 'Pause in seconds before clicking navigation buttons (default: 3)', '3')
  .action(async (url: string, tupleString: string, options) => {
    try {
      // Parse the tuple string
      const tuple = parseTupleString(tupleString);
      const navDelay = parseInt(options.navDelay) * 1000; // Convert to milliseconds
      
      logger.info(`Starting analysis of ${url}`);
      logger.info(`Tuple: ${JSON.stringify(tuple)}`);
      logger.info(`Navigation delay: ${options.navDelay} seconds`);
      
      await analyzeSurvey(url, tuple, navDelay);
    } catch (error) {
      logger.error('Analysis failed:', error);
      process.exit(1);
    }
  });

program
  .command('upload')
  .description('Upload analysis results to Firestore')
  .argument('<analysis-json>', 'Path to analysis.json file')
  .option('--leave', 'Keep local output files after upload (default: remove)')
  .action(async (analysisJsonPath: string, options) => {
    try {
      await uploadToFirestore(analysisJsonPath, options.leave || false);
    } catch (error) {
      logger.error('Upload failed:', error);
      process.exit(1);
    }
  });

program
  .command('query')
  .description('Query analyses from Firestore')
  .option('-c, --customer <customerId>', 'Filter by customer ID')
  .option('-s, --study <studyId>', 'Filter by study ID')
  .option('-l, --limit <number>', 'Limit number of results', '10')
  .action(async (options) => {
    try {
      const limit = parseInt(options.limit) || 10;
      await queryFirestore(options.customer, options.study, limit);
    } catch (error) {
      logger.error('Query failed:', error);
      process.exit(1);
    }
  });

program
  .command('clear')
  .description('Clear all data from Firestore (WARNING: This is irreversible!)')
  .action(async () => {
    try {
      await clearFirestore();
    } catch (error) {
      logger.error('Clear failed:', error);
      process.exit(1);
    }
  });



program
  .command('pattern-stats')
  .description('Generate field type pattern statistics')
  .action(async () => {
    try {
      await generatePatternStats();
    } catch (error) {
      logger.error('Pattern stats generation failed:', error);
      process.exit(1);
    }
  });

program
  .command('export-unknown')
  .description('Export unknown fields for manual classification')
  .action(async () => {
    try {
      await exportUnknownFields();
    } catch (error) {
      logger.error('Export unknown fields failed:', error);
      process.exit(1);
    }
  });

program
  .command('query-test-cases')
  .description('Query test cases from Firestore')
  .option('-a, --analysis <analysisId>', 'Filter by analysis ID')
  .option('-c, --customer <customerId>', 'Filter by customer ID')
  .option('-s, --study <studyId>', 'Filter by study ID')
  .option('--status <status>', 'Filter by status (draft, approved, rejected, needs_review)')
  .option('--source <source>', 'Filter by source (generated, human, hybrid)')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .action(async (options) => {
    try {
      await queryTestCases(options);
    } catch (error) {
      logger.error('Query test cases failed:', error);
      process.exit(1);
    }
  });

program
  .command('get-analysis')
  .description('Get complete analysis with test cases from Firestore')
  .argument('<analysis-id>', 'Analysis document ID')
  .action(async (analysisId: string) => {
    try {
      await getCompleteAnalysis(analysisId);
    } catch (error) {
      logger.error('Get analysis failed:', error);
      process.exit(1);
    }
  });

program
  .command('update-test-case')
  .description('Update test case status in Firestore')
  .argument('<analysis-id>', 'Analysis document ID')
  .argument('<field-id>', 'Field document ID')
  .argument('<test-case-id>', 'Test case document ID')
  .argument('<status>', 'New status (approved, rejected, needs_review)')
  .option('-r, --reviewer <reviewerId>', 'Reviewer ID')
  .action(async (analysisId: string, fieldId: string, testCaseId: string, status: string, options) => {
    try {
      await updateTestCaseStatus(analysisId, fieldId, testCaseId, status, options.reviewer);
    } catch (error) {
      logger.error('Update test case failed:', error);
      process.exit(1);
    }
  });

program
  .command('test-run')
  .description('Execute test cases from Firestore analysis on the survey form')
  .argument('<analysis-id>', 'Analysis document ID from Firestore')
  .argument('<url>', 'Survey form URL to test')
  .option('-o, --output <dir>', 'Output directory for test results', './output/test-runs')
  .option('-d, --delay <ms>', 'Delay after field input (ms)', '500')
  .option('--skip-validation', 'Skip validation message detection')
  .option('--leave', 'Keep local output files after upload (default: remove)')
  .action(async (analysisId: string, url: string, options) => {
    try {
      const testRunOptions = {
        analysisId,
        url,
        outputDir: options.output,
        delay: parseInt(options.delay) || 500,
        skipValidation: options.skipValidation || false,
        leaveFiles: options.leave || false
      };
      
      await runTests(testRunOptions);
    } catch (error) {
      logger.error('Test run failed:', error);
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