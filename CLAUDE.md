***Requirements***
- Build a tool that given a URL and a reference tuple string will open the web page (assume no auth step), analyse the form fields on the right hand panel.
- The right hand panel is scrollable, ensure that the tool scrolls to the bottom to see all the form fields. Store the height of viewport that would be needed to see the whole form without scrolling. 
- Only include the panel within the div with id=survey-body-container in the analysis of the form fields.
- For each form identify the long title and short name from the top of the form.
- For each form field (question), identify and record in a JSON structure:
    - question number string e.g. 1. or 1.2 or 2.3.1
    - The question text
    - The input type
    - If the question text has a * at the end of it, it is a required field. Record this as a boolean.
    - If the input type is a radio or a dropdown, then record the choices
    - Take a screen shot of the whole <div> that contains the question text and input fields - reference this file name in the JSON for the field
    - Generate comprehensive test data for automated testing:
        - For radio buttons/dropdowns: position-based test cases (0, 1, 2, etc.) for language independence
        - For text fields: intelligent type detection (email, phone, name, age, etc.) with appropriate test values
        - For text areas: varying length responses from short to multi-paragraph
        - Track provenance: distinguish between generated, human-entered, and hybrid test cases
        - Support extensible field type detection for new survey types
- Each question is framed by a box identified by a div with a class that starts with CardBox (question number, question text, input fields (radios within frame are choices) ).   
- Example forms can be found at the following URLS:
    - https://main.qa.castoredc.org/survey/X9PAYLDQ
- Input tuple string in this format: [customer_id, study_id, package_name, language, version]
    - Short customer name/id for grouping screenshots e.g. PXL_KISQ
    - study_id → this is a common “unique” name for the study, does not need to be the actual UUID
    - package_name → this is a common “unique” name for the study, does not need to be the actual UUID
    - language - this should be the language code? First one we see will be treated as the primary language.
    - version id - used to cause from start eval of processing for same forms.
    - i.e. [PXL_KISQ, qa-test, sf36-gad7, en, v1]
- Build a command line tool that must be delivered as a tool running inside a docker container.
- All libraries, tools, build outputs and settings must be made to a docker container. Do not make any changes to the local system.
- The tool will have multiple stages and the output data and state from each stage will be recorded in JSON files and screenshot PNG files. Some or all of these files will be used as the input to the subsequent stages.
- The ownership of the output files will be for the same user as executed the tool.
- The tool will be written in typescript and executed in the latest LTS node version.
- Use puppeteer to drive the browser, identify form fields and take screenshots

- Using the data in firestore, not the JSON file, starting at the top of the form and working downwards, for each field, for each test case - take the value and apply it to the question 
- move focus away from the field, take a screenshot of the same div for that question as the analysis
- Whenever a question value changes and the focus moves away from the input field this can cause:
    - validation rules to fire which will display messages underneath the input
- do not use data-question-id= in selectors 

*** Firestore ***
- use a firestore service account JSON from ~/firestore.json for firestore-admin credentials
- add an option to the tool to take the analysis.json and screenshots from the analysis step and upload into firestore, using the structures defined in FIRESTORE.md


*** Build instructions ***
use npm run build && docker build -f Dockerfile.runtime -t form-shot-runtime .

*** Commands ***

1. Analyze survey (with automatic test data generation):
docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1

2. Upload analysis to Firestore (includes test data):
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

3. Query analyses from Firestore:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query --limit 5

4. Query analyses with filters:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query --customer PXL_KISQ --limit 5

5. Export test data for UI review:
docker run --rm -v ./output:/app/output form-shot-runtime export-for-review /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

6. Import reviewed test data:
docker run --rm -v ./output:/app/output form-shot-runtime import-reviewed /app/output/reviewed_test_data.json /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

7. Generate pattern statistics:
docker run --rm -v ./output:/app/output form-shot-runtime pattern-stats

8. Export unknown fields for classification:
docker run --rm -v ./output:/app/output form-shot-runtime export-unknown

9. Query test cases from Firestore (sub-collection queries):
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query-test-cases --customer PXL_KISQ --status draft --limit 10

10. Get complete analysis with test cases:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime get-analysis PXL_KISQ_qa-test_sf36-gad7_en_v1

11. Update individual test case status:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime update-test-case PXL_KISQ_qa-test_sf36-gad7_en_v1 q1_ choice_1__0 approved --reviewer user123

12. Execute test cases on survey form (test run):
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 https://main.qa.castoredc.org/survey/X9PAYLDQ

13. Complete workflow (analyze + upload + test):
# Step 1: Analyze (now includes automatic test data generation)
docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1

# Step 2: Upload results (test cases stored in sub-collections)
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Step 3: Execute test cases on the live form
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 https://main.qa.castoredc.org/survey/X9PAYLDQ

# Step 4: Query specific test cases
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query-test-cases --analysis PXL_KISQ_qa-test_sf36-gad7_en_v1 --status draft

# Step 5: Export for UI review (optional)
docker run --rm -v ./output:/app/output form-shot-runtime export-for-review /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

