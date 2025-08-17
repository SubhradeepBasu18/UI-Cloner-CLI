import { configDotenv } from "dotenv";
configDotenv({quiet: true});
import OpenAI from "openai";
import {SYSTEM_PROMPT} from "./prompt.js";
import { scrapeAndFormat } from "./scrapper.js";
import { exec } from "child_process";
import prettier from "prettier";
import { platform } from "os";

const TOOL_MAP = {
    scrapeAndFormat: scrapeAndFormat,
    execCommand: execCommand
}

async function execCommand(cmd = '') {
    return new Promise((res, rej) => {
      exec(cmd, (error, data) => {
        if (error) {
          return res(`Error running command ${error}`);
        } else {
          res(data);
        }
      });
    });
  }

  async function generateCode(htmlCode, cssCode, jsCode) {
    try {
      // Prettify the HTML
      const formattedHTML = prettier.format(htmlCode, {
        parser: "html",
        printWidth: 80,  // Control line length (optional)
        tabWidth: 2,     // Control indentation (optional)
      });
  
      // Prettify the CSS
      const formattedCSS = prettier.format(cssCode, {
        parser: "css",
        printWidth: 80,  // Control line length
        tabWidth: 2,     // Control indentation
      });
  
      // Prettify the JavaScript
      const formattedJS = prettier.format(jsCode, {
        parser: "babel",  // Use babel for modern JavaScript
        printWidth: 80,   // Control line length
        tabWidth: 2,      // Control indentation
      });
  
      // Return the formatted code for HTML, CSS, JS
      return {
        html: formattedHTML,
        css: formattedCSS,
        js: formattedJS
      };
    } catch (error) {
      console.error('Error formatting code:', error);
      throw error;
    }
  }


const openai = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

function parseResponseJSON(rawResponse) {
    try {
        // First, try to parse as direct JSON
        return JSON.parse(rawResponse.trim());
    } catch (e) {
        // If that fails, try to extract JSON from markdown code blocks
        let jsonContent = rawResponse;
        
        // Remove markdown code block markers (both ```json and plain ```)
        const jsonBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
            jsonContent = jsonBlockMatch[1];
        }
        
        try {
            return JSON.parse(jsonContent.trim());
        } catch (e2) {
            console.error('Failed to parse JSON:', rawResponse);
            throw new Error('Invalid JSON response from model');
        }
    }
}

async function generateResponse() {
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
            role: "user",
            content: "Can you clone https://hitesh.ai/",
        },
    ];

    let iterationCount = 0; // Track iterations to avoid infinite loop
    while (iterationCount < 100) { // Max iterations to prevent infinite loop
        const response = await openai.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: messages,
            response_format: {type: "json_object"}
        });

        const rawResponse = response.choices[0].message.content;
        // console.log('Raw response:', rawResponse);

        // Parse the JSON response properly
        const responseJSON = parseResponseJSON(rawResponse);
        // console.log('Parsed response:', responseJSON);

        messages.push({
            role: "assistant",
            content: rawResponse, // Store the full raw response
        });

        if (!responseJSON.step) {
            console.error("No step in response. Exiting...");
            break; // Exit loop if no valid step found
        }

        console.log(`Handling step: ${responseJSON.step}`);

        if (responseJSON.step === "START") {
            console.log('🚀 START:', responseJSON.content);
            iterationCount++;
            continue;
        }

        if (responseJSON.step === "THINK") {
            console.log('🧠 THINK:', responseJSON.content);
            iterationCount++;
            continue;
        }

        if (responseJSON.step === "OBSERVE") {
            console.log('👁️  OBSERVE:', responseJSON.content);
            iterationCount++;
            continue;
        }

        if (responseJSON.step === "TOOL") {
            const toolToCall = responseJSON.tool_name;
            if (!TOOL_MAP[toolToCall]) {
                messages.push({
                    role: 'developer',
                    content: `There is no such tool as ${toolToCall}`,
                });
                iterationCount++;
                continue;
            }

            let toolInput = responseJSON.input;
            if (toolToCall === 'scrapeAndFormat') {
                try {
                    const parsedInput = JSON.parse(toolInput);
                    if (parsedInput.url && parsedInput.folderName) {
                        toolInput = [parsedInput.url, parsedInput.folderName];
                    } else if (parsedInput.url) {
                        toolInput = [parsedInput.url];
                    } else {
                        toolInput = [toolInput];
                    }
                } catch {
                    toolInput = [toolInput];
                }
                const responseFromTool = await TOOL_MAP[toolToCall](...toolInput);
                console.log(`🛠️: ${toolToCall}(${toolInput}) =`, responseFromTool);
                messages.push({
                    role: 'developer',
                    content: JSON.stringify({ step: 'OBSERVE', content: responseFromTool }),
                });
            } else {
                const responseFromTool = await TOOL_MAP[toolToCall](toolInput);
                console.log(`🛠️: ${toolToCall}(${toolInput}) = `, responseFromTool);
                messages.push({
                    role: 'developer',
                    content: JSON.stringify({ step: 'OBSERVE', content: responseFromTool }),
                });
            }

            iterationCount++;
            continue;
        }

        if (responseJSON.step === "OUTPUT") {
            console.log('📤 OUTPUT:', responseJSON.content);
            console.log('✅ DONE....');
            break;
        }

        if (responseJSON.step === "FINISH") {
            console.log('✅ DONE....');
            break;
        }

        iterationCount++;
    }
}

generateResponse();