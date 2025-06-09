***Requirements***
- Build a tool that given a URL and a reference tuple string will open the web page (assume no auth step), analyse the form fields on the right hand panel.
- The right hand panel is scrollable, ensure that the tool scrolls to the bottom to see all the form fields. Store the height of viewport that would be needed to see the whole form without scrolling. Only include the panel within the div with id survey-body-container in the analysis of the form fields.
- For each form identify the long title and short name from the top of the form.
- For each form field (question), identify and record in a JSON structure:
    - question number string e.g. 1. or 1.2 or 2.3.1
    - The question text
    - The input type
    - If the question text has a * at the end of it, it is a required field. Record this as a boolean.
    - If the input type is a radio or a dropdown, then record the choices
    - Take a screen shot of the whole <div> that contains the question text and input fields - reference this file name in the JSON for the field
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

*** Build instructions ***
use npm run build && docker build -f Dockerfile.runtime -t form-shot-runtime .

example run command: docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1

