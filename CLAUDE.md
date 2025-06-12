***Requirements***
- Build a tool that given a URL and a reference tuple string will open the web page (assume no auth step), analyse the form fields on the right hand panel.
- The right hand panel is scrollable, ensure that the tool scrolls to the bottom to see all the form fields. Store the height of viewport that would be needed to see the whole form without scrolling. 
- Only include the panel within the div with id=survey-body-container in the analysis of the form fields.
- For each form identify the long title and short name from the top of the form. create selectors for each of longtitle and shortname starting with the <div id=survey-body-container> - look for first <p> inside that div and then first <h3>. Don't use any pattern matching on the content of those.
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
    - it may cause new questions to become visible further down the page - check if new questions appear and add them to the result, including the question and value that were used to trigger them
- do not use data-question-id= in selectors 
- the main page structure is contained in 
`<div id="root">
   <div>
     <div>left hand panel, progress and language selector - hidden for width less than 768px </div>
     <div id=survey-body-container>form with all form fields</div>
     <div>navigation button(s) - could be next, next and previous, previous and finish survey. Ordering for a form is consistent for languages, but button text may change for other languages</div> 
   <div>
 </div>`
- A form contains fields, a from can navigate to the next form, which can have the same question numbers as the previous form. You can only navigate to the next form if there are valid values in each required field. Some forms contain no fields. Each form contains a <p>long title</p> and an <h3>short name</h3> before the first question. A survey is the collection of all forms. A survey should contain the analysis of all forms. The final form is identified by the presence of the "Finish Survey" navigation button. For each form, record which of the next, previous, finish survey buttons were displayed as an ordered array.


*** Firestore ***
- use a firestore service account JSON from ~/firestore.json for firestore-admin credentials
- add an option to the tool to take the analysis.json and screenshots from the analysis step and upload into firestore, using the structures defined in FIRESTORE.md
- test run results are automatically uploaded to Firestore and Cloud Storage
  - Test run documents stored in 'test-runs' collection with results as subcollection
  - Screenshots stored in Cloud Storage under 'test-runs/{analysisId}/{timestamp}'
  - Both upload and test-run commands clean up local files by default (use --leave flag to keep them)


*** Screenshots ***
- The analyse tool should allow a specification of the viewport - default should be 767px x 1024px
- Establish the vertical viewport for each form that will allow a screenshot to include all questions on the form
- On display of a new form, before entering any data, extend the viewport to the maximum needed to include the full form and take a screenshot - this is the 'on-entry' screenshot. Return viewport to the original size.
- After completing the questions, in preparation for navigation to next form, before pressing next button. Extend the viewport to the maximum needed to include the full form and take a screenshot - this is the 'on-exit' screenshot. Return viewport to the original size.
- When identifying each question in the form, take a screenshot of that question which includes the frame and contents of that question.
- When running through test-cases move focus away from the field after setting value, take a screenshot of the same div for that question as used in the analysis

*** Build instructions ***
use npm run build && docker build -f Dockerfile.runtime -t form-shot-runtime .
After you make chaneges to the code, always rebuild the code and container

*** Before commit ***
- Ensure that the FIRESTORE.md is still accurate in light of any changes
- Ensure that README.md is still accurate in light of any changes

*** Commands ***

1. Analyze survey (with automatic test data generation):
docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1

2. Upload analysis to Firestore (includes test data):
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Upload and keep local files
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json --leave

3. Query analyses from Firestore:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query --limit 5

4. Query analyses with filters:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query --customer PXL_KISQ --limit 5

5. Generate pattern statistics:
docker run --rm -v ./output:/app/output form-shot-runtime pattern-stats

6. Export unknown fields for classification:
docker run --rm -v ./output:/app/output form-shot-runtime export-unknown

7. Query test cases from Firestore (sub-collection queries):
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query-test-cases --customer PXL_KISQ --status draft --limit 10

8. Get complete analysis with test cases:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime get-analysis PXL_KISQ_qa-test_sf36-gad7_en_v1

9. Update individual test case status:
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime update-test-case PXL_KISQ_qa-test_sf36-gad7_en_v1 q1_ choice_1__0 approved --reviewer user123

10. Execute test cases on survey form (test run):
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 https://main.qa.castoredc.org/survey/X9PAYLDQ

# Execute test run and keep local files
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 https://main.qa.castoredc.org/survey/X9PAYLDQ --leave

11. Complete workflow (analyze + upload + test):
# Step 1: Analyze (now includes automatic test data generation)
docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1

# Step 2: Upload results (test cases stored in sub-collections)
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Step 3: Execute test cases on the live form (results uploaded to Firestore & Cloud Storage automatically)
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 https://main.qa.castoredc.org/survey/X9PAYLDQ

# Step 4: Query specific test cases
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query-test-cases --analysis PXL_KISQ_qa-test_sf36-gad7_en_v1 --status draft

