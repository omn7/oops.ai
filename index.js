#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { select, input, confirm, password } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(os.homedir(), '.oops_config.json');

function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        } catch (e) {
            return getDefaultConfig();
        }
    }
    return getDefaultConfig();
}

function getDefaultConfig() {
    return { 
        isSetup: false,
        llmType: 'api',
        apiProvider: 'gemini',
        modelName: 'gemini-2.5-flash', 
        apiKey: '', 
        localUrl: 'http://127.0.0.1:11434/api/generate', 
        localModel: 'llama3' 
    };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// Custom teal-green gradient using chalk.hex()
function tealGradient(text) {
    const colors = [
        '#008080', '#038685', '#068D8A', '#09938F', '#0C9A94',
        '#0FA099', '#12A79F', '#15ADA4', '#18B4A9', '#1BBBAE',
        '#1EC1B3', '#20B2AA'
    ];
    return text.split('').map((char, i) => {
        if (char === ' ') return ' ';
        const color = colors[Math.floor((i / text.length) * colors.length)];
        return chalk.hex(color)(char);
    }).join('');
}

function printHeader() {
    console.log();
    const logo = `   ____                  
  / __ \\____  ____  _____
 / / / / __ \\/ __ \\/ ___/
/ /_/ / /_/ / /_/ (__  ) 
\\____/\\____/ .___/____/  
          /_/            `;
          
    const title = chalk.bold.white('AI Code Review Assistant');
    const omn7Link = '\u001b]8;;https://github.com/omn7\u0007@omn7\u001b]8;;\u0007';
    const jayeshLink = '\u001b]8;;https://github.com/Jayeshmahajan0\u0007@Jayeshmahajan0\u001b]8;;\u0007';
    const subtitle = chalk.dim(`Created by ${omn7Link} and ${jayeshLink}`);
    const content = tealGradient(logo) + '\n\n' + title + '\n' + subtitle;
    
    const headerBox = boxen(content, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: '#20B2AA',
        textAlignment: 'center',
        float: 'center'
    });
    
    console.log(headerBox);
}

function getStagedDiff() {
    try {
        const diff = execSync('git diff --staged', { encoding: 'utf-8' });
        return diff;
    } catch (error) {
        console.error(chalk.red('🚨 Failed to get git diff. Are you in a git repository?'));
        process.exit(1);
    }
}

function runLocalScan(diff) {
    // Regex catches AWS keys, JWTs, OpenAI keys, .env patterns, passwords
    const secretsRegex = /(AKIA[0-9A-Z]{16})|(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})|(sk-[a-zA-Z0-9]{48})|([A-Za-z0-9_]{1,}password.*)/i;
    
    // Explicitly check for .env file modifications in diff headers
    // Split the string so the scanner doesn't accidentally trip on its own source code when you commit index.js!
    const envAdded = '+++ b/' + '.env';
    const envRemoved = '--- a/' + '.env';
    const hasEnvFile = diff.includes(envAdded) || diff.includes(envRemoved);

    if (hasEnvFile) {
        console.log(chalk.red.bold('🚨 Local Scan Failed: .env file or contents detected in staged changes!'));
        process.exit(1); // Blocks the commit
    }

    if (secretsRegex.test(diff)) {
        console.log(chalk.red.bold('🚨 Local Scan Failed: Potential hardcoded secret detected!'));
        process.exit(1); // Blocks the commit
    }
}

function walkDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (!['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(file)) {
                walkDir(filePath, fileList);
            }
        } else {
            // Only scan code files
            if (/\.(js|ts|jsx|tsx|py|go|java|php|rb|env|json)$/i.test(file)) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

async function runDeepProjectScan(config) {
    const spinner = ora({ text: tealGradient('Running Deep Offline Static Analysis...'), color: 'cyan' }).start();
    const files = walkDir(process.cwd());
    let issuesFound = [];

    const isNextJs = fs.existsSync(path.join(process.cwd(), 'next.config.js')) || fs.existsSync(path.join(process.cwd(), 'next.config.mjs'));
    const isReact = fs.existsSync(path.join(process.cwd(), 'package.json')) && fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8').includes('"react"');
    const isPython = fs.existsSync(path.join(process.cwd(), 'requirements.txt')) || fs.existsSync(path.join(process.cwd(), 'Pipfile'));

    const rules = [
        { name: 'Exposed Stripe Secret', regex: /sk_live_[0-9a-zA-Z]{24}/, type: 'Secret' },
        { name: 'Exposed OpenAI Key', regex: /sk-[a-zA-Z0-9]{48}/, type: 'Secret' },
        { name: 'Exposed AWS Key', regex: /AKIA[0-9A-Z]{16}/, type: 'Secret' },
        { name: 'Hardcoded Password / Secret', regex: /(?:password|secret|token)\s*[:=]\s*['"][^'"]{5,}['"]/i, type: 'Secret' },
        { name: 'Potentially Unprotected Admin Route', regex: /app\.(?:post|put|delete|get)\(['"]\/admin[^'"]*['"]\s*,\s*(?:async\s+)?(?:\([^)]*\)|req)\s*=>/i, type: 'Security' }
    ];

    if (isNextJs) {
        rules.push({ name: 'Exposed NEXT_PUBLIC Secret', regex: /NEXT_PUBLIC_.*(?:SECRET|PASSWORD|KEY|TOKEN)/i, type: 'Secret' });
    }
    if (isReact) {
        rules.push({ name: 'React Component Hardcoded Secret', regex: /const\s+(?:API_KEY|SECRET)\s*=\s*['"][A-Za-z0-9_-]{15,}['"]/i, type: 'Secret' });
    }
    if (isPython) {
        rules.push({ name: 'Django Secret Key Leak', regex: /SECRET_KEY\s*=\s*['"][^'"]+['"]/i, type: 'Secret' });
    }

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const rule of rules) {
                    if (rule.regex.test(line)) {
                        issuesFound.push({ file: path.relative(process.cwd(), file), line: i + 1, issue: rule.name, type: rule.type });
                    }
                }
            }
            
            // File-level heuristic checks
            if (content.includes('await ') && !content.includes('try {') && !content.includes('.catch(')) {
                issuesFound.push({ file: path.relative(process.cwd(), file), line: '?', issue: 'Missing Error Handling (await without try/catch)', type: 'Reliability' });
            }
            if (/(for|while)\s*\(.*\)[\s\S]{0,150}(db\.|prisma\.|mongoose\.)/.test(content)) {
                 issuesFound.push({ file: path.relative(process.cwd(), file), line: '?', issue: 'Database Query inside Loop (Potential Connection Exhaustion)', type: 'Performance/DoS' });
            }
        } catch (e) {
            // Ignore unreadable files
        }
    }

    spinner.stop();

    if (issuesFound.length > 0) {
        console.log(chalk.red.bold(`\n🚨 Deep Scan Completed: Found ${issuesFound.length} Potential Issues!\n`));
        issuesFound.forEach((issue, index) => {
            console.log(chalk.yellow(`${index + 1}. [${issue.type}] `) + chalk.white(`${issue.issue}`));
            console.log(chalk.gray(`   File: ${issue.file}:${issue.line}\n`));
        });
        if (config) {
            console.log(chalk.cyan('Auto-triggering Deep AI Review on flagged files...'));
            const uniqueFiles = [...new Set(issuesFound.map(i => i.file))];
            await executeHybridAIReview(uniqueFiles, config);
        } else {
            console.log(chalk.cyan('Recommendation: Please review the files above and apply necessary fixes.\n'));
        }
    } else {
        console.log(chalk.green('\n✓ Deep Scan Passed. No obvious static vulnerabilities found.\n'));
    }
}

async function executeHybridAIReview(files, config) {
    let combinedContent = '';
    for (const file of files) {
        try {
            const absolutePath = path.resolve(process.cwd(), file);
            const content = fs.readFileSync(absolutePath, 'utf8');
            combinedContent += `\n--- File: ${file} ---\n${content}\n`;
        } catch (e) { }
    }

    if (!combinedContent.trim()) return;

    const spinner = ora({ text: tealGradient('AI is deeply analyzing flagged files...'), color: 'cyan' }).start();
    const prompt = `You are an expert AI code reviewer. The local static scanner flagged the following files for potential vulnerabilities. Please perform a deep architectural review. Specifically look for security flaws, code smells, and performance bottlenecks, and provide fixes for these specific files.
CRITICAL INSTRUCTION: You MUST return a strict JSON response in EXACTLY this format, and absolutely nothing else. Do not use markdown blocks, just raw JSON:
{
  "fixes": [
    {
      "file": "relative/path/to/file",
      "content": "the FULL ENTIRE replaced content of the file with the vulnerabilities fixed"
    }
  ]
}

Files to fix:
${combinedContent}`;

    try {
        let fixContent = '';
        if (config.llmType === 'api' || config.llmType === 'gemini') {
            if (config.apiProvider === 'gemini' || config.llmType === 'gemini') {
                const ai = new GoogleGenAI({ apiKey: config.apiKey });
                const response = await ai.models.generateContent({
                    model: config.modelName || 'gemini-2.5-flash',
                    contents: prompt,
                });
                fixContent = response.text;
            } else if (config.apiProvider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                    body: JSON.stringify({
                        model: config.modelName || 'gpt-4o',
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                if (!response.ok) throw new Error(`OpenAI HTTP error: ${response.status}`);
                const data = await response.json();
                fixContent = data.choices[0].message.content;
            } else if (config.apiProvider === 'anthropic') {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'x-api-key': config.apiKey, 
                        'anthropic-version': '2023-06-01' 
                    },
                    body: JSON.stringify({
                        model: config.modelName || 'claude-3-5-sonnet-latest',
                        max_tokens: 4096,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                if (!response.ok) throw new Error(`Anthropic HTTP error: ${response.status}`);
                const data = await response.json();
                fixContent = data.content[0].text;
            }
        } else {
            const response = await fetch(config.localUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.localModel,
                    prompt: prompt,
                    stream: false
                })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            fixContent = data.response;
        }
        
        spinner.stop();

        let jsonResponse;
        try {
            // Strip any potential markdown blocks like ```json ... ```
            const cleanJson = fixContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
            jsonResponse = JSON.parse(cleanJson);
        } catch (e) {
            console.error(chalk.yellow('⚠️ AI did not return a valid JSON object. Saving raw output instead.'));
            fs.writeFileSync(path.join(process.cwd(), 'oops-deep-fix.txt'), fixContent, 'utf8');
            console.log(chalk.gray(`Saved to oops-deep-fix.txt\n`));
            return;
        }

        if (!jsonResponse || !jsonResponse.fixes || jsonResponse.fixes.length === 0) {
            console.log(chalk.green('✓ AI Review Complete. No immediate auto-fixes required.\n'));
            return;
        }

        const autoApply = await confirm({ message: chalk.bold.magenta(`\n✨ AI generated fixes for ${jsonResponse.fixes.length} files! Do you want Oops to Auto-Heal them now?`) });

        if (autoApply) {
            for (const fix of jsonResponse.fixes) {
                const targetPath = path.resolve(process.cwd(), fix.file);
                if (fs.existsSync(targetPath)) {
                    fs.writeFileSync(targetPath, fix.content, 'utf8');
                    console.log(chalk.green(`✓ Auto-Healed: `) + chalk.white(fix.file));
                } else {
                    console.log(chalk.red(`✗ Could not find file to heal: `) + chalk.white(fix.file));
                }
            }
            console.log(chalk.bold.cyan('\n🚀 Auto-Heal Complete! Your codebase is now secure.\n'));
        } else {
            console.log(chalk.gray('Auto-Heal cancelled. No files were modified.\n'));
        }

    } catch (e) {
        spinner.fail(chalk.red('Failed to generate deep AI fix.'));
        console.error(chalk.red(e.message));
    }
}


async function runApiReview(diff, config) {
    if (!config.apiKey) {
        console.log(chalk.yellow(`⚠️  ${config.apiProvider || 'API'} Key is not set! Run "oops start" to configure it.`));
        process.exit(1);
    }

    const providerName = config.apiProvider ? config.apiProvider.charAt(0).toUpperCase() + config.apiProvider.slice(1) : 'API';
    const spinner = ora({
        text: tealGradient(`Analyzing diff with ${providerName}...`),
        color: 'cyan'
    }).start();

    try {
        const prompt = `Review the following git diff for logical security flaws, code smells, and performance bottlenecks (e.g. SQL injection, O(N^2) loops, exposed internal paths, bad architecture). Be incredibly concise. If it looks secure and performant, just reply "Looks good". If there are issues, list them briefly.\n\n${diff}`;
        let text = '';

        if (config.apiProvider === 'gemini' || config.llmType === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: config.apiKey });
            const response = await ai.models.generateContent({
                model: config.modelName || 'gemini-2.5-flash',
                contents: prompt,
            });
            text = response.text;
        } else if (config.apiProvider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                body: JSON.stringify({
                    model: config.modelName || 'gpt-4o',
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            if (!response.ok) throw new Error(`OpenAI HTTP error: ${response.status}`);
            const data = await response.json();
            text = data.choices[0].message.content;
        } else if (config.apiProvider === 'anthropic') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-api-key': config.apiKey, 
                    'anthropic-version': '2023-06-01' 
                },
                body: JSON.stringify({
                    model: config.modelName || 'claude-3-5-sonnet-latest',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            if (!response.ok) throw new Error(`Anthropic HTTP error: ${response.status}`);
            const data = await response.json();
            text = data.content[0].text;
        }

        spinner.stop();

        if (text.toLowerCase().includes('looks good') && text.length < 50) {
             console.log(chalk.green('✓ AI Review: Passed. Code looks secure.'));
             return { passed: true, feedback: text };
        } else {
             console.log(tealGradient('\nAI Review Feedback:'));
             console.log(chalk.white(text));
             console.log(chalk.yellow('\nPlease review the above feedback before committing.'));
             return { passed: false, feedback: text };
        }

    } catch (error) {
        spinner.fail(chalk.red('AI Review failed.'));
        console.error(chalk.red(error.message));
        process.exit(1);
    }
}

async function runOllamaReview(diff, url, model) {
    const spinner = ora({
        text: tealGradient(`Analyzing diff with local model (${model})...`),
        color: 'cyan'
    }).start();

    try {
        const prompt = `Review the following git diff for logical security flaws, code smells, and performance bottlenecks. Be incredibly concise. If it looks secure and performant, just reply "Looks good". If there are issues, list them briefly.\n\n${diff}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        spinner.stop();

        const text = data.response;
        if (text.toLowerCase().includes('looks good') && text.length < 50) {
             console.log(chalk.green('✓ AI Review: Passed. Code looks secure.'));
             return { passed: true, feedback: text };
        } else {
             console.log(tealGradient('\nAI Review Feedback:'));
             console.log(chalk.white(text));
             console.log(chalk.yellow('\nPlease review the above feedback before committing.'));
             return { passed: false, feedback: text };
        }
    } catch (error) {
        spinner.fail(chalk.red('Local LLM review failed. Is the server running?'));
        console.error(chalk.red(error.message));
        process.exit(1);
    }
}

async function generateFix(diff, feedback, config) {
    const spinner = ora({ text: tealGradient('Generating fix...'), color: 'cyan' }).start();
    const prompt = `You are an expert AI coding assistant. The user has the following git diff which has security or code quality issues:\n\n${diff}\n\nThe issues identified are:\n${feedback}\n\nPlease provide the exact code changes or a brief explanation of how to fix these issues. Provide code snippets to show the corrected implementation.`;

    try {
        let fixContent = '';
        if (config.llmType === 'api' || config.llmType === 'gemini') {
            if (config.apiProvider === 'gemini' || config.llmType === 'gemini') {
                const ai = new GoogleGenAI({ apiKey: config.apiKey });
                const response = await ai.models.generateContent({
                    model: config.modelName || 'gemini-2.5-flash',
                    contents: prompt,
                });
                fixContent = response.text;
            } else if (config.apiProvider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                    body: JSON.stringify({
                        model: config.modelName || 'gpt-4o',
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                if (!response.ok) throw new Error(`OpenAI HTTP error: ${response.status}`);
                const data = await response.json();
                fixContent = data.choices[0].message.content;
            } else if (config.apiProvider === 'anthropic') {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'x-api-key': config.apiKey, 
                        'anthropic-version': '2023-06-01' 
                    },
                    body: JSON.stringify({
                        model: config.modelName || 'claude-3-5-sonnet-latest',
                        max_tokens: 2048,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                if (!response.ok) throw new Error(`Anthropic HTTP error: ${response.status}`);
                const data = await response.json();
                fixContent = data.content[0].text;
            }
        } else {
            const response = await fetch(config.localUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.localModel,
                    prompt: prompt,
                    stream: false
                })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            fixContent = data.response;
        }
        
        spinner.stop();

        // Create a unique filename for the output
        let counter = 1;
        let filename = 'oops-fix.txt';
        while (fs.existsSync(path.join(process.cwd(), filename))) {
            filename = `oops-fix-${counter}.txt`;
            counter++;
        }

        const outPath = path.join(process.cwd(), filename);
        fs.writeFileSync(outPath, fixContent, 'utf8');

        console.log(chalk.green(`\n✓ Suggested fix successfully saved to `) + chalk.cyan.bold(filename));
        console.log(chalk.gray(`You can open this file to review and easily copy the solution.\n`));

    } catch (e) {
        spinner.fail(chalk.red('Failed to generate fix.'));
        console.error(chalk.red(e.message));
    }
}

async function runReview(diff, config) {
    if (config.llmType === 'api' || config.llmType === 'gemini') {
        return await runApiReview(diff, config);
    } else {
        return await runOllamaReview(diff, config.localUrl, config.localModel);
    }
}

async function executeManualReview(config) {
    const diff = getStagedDiff();
    if (!diff.trim()) {
        console.log(chalk.gray('No staged changes found to review. Try running "git add <file>" first.\n'));
        return false;
    }
    const scanSpinner = ora({ text: tealGradient('Running fast local scan...'), color: 'cyan' }).start();
    runLocalScan(diff);
    scanSpinner.succeed(chalk.green('Local scan passed. No exposed secrets found.'));
    
    const result = await runReview(diff, config);
    if (!result.passed) {
        const action = await select({
            message: 'Issues were found. What would you like to do?',
            choices: [
                { name: 'Generate a prompt/solution to fix it', value: 'fix' },
                { name: 'Exit', value: 'exit' }
            ]
        });

        if (action === 'fix') {
            await generateFix(diff, result.feedback, config);
        }
    }
    return true;
}

async function runPreCommitHook() {
    const config = loadConfig();
    const diff = getStagedDiff();
    if (!diff.trim()) {
        return; // Nothing to review
    }
    const scanSpinner = ora({ text: tealGradient('Running fast local scan...'), color: 'cyan' }).start();
    runLocalScan(diff);
    scanSpinner.succeed(chalk.green('Local scan passed. No exposed secrets found.'));

    const result = await runReview(diff, config);
    if (!result.passed) {
        try {
            const action = await select({
                message: 'Issues were found. What would you like to do?',
                choices: [
                    { name: 'Generate a prompt/solution to fix it', value: 'fix' },
                    { name: 'Exit and block commit', value: 'exit' }
                ]
            });

            if (action === 'fix') {
                await generateFix(diff, result.feedback, config);
            }
            process.exit(1); // Always block commit if it failed the review
        } catch (e) {
            // Non-interactive fallback (e.g. if run via standard terminal pre-commit)
            process.exit(1);
        }
    }
}

async function showMainMenu() {
    const config = loadConfig();
    let exit = false;

    while (!exit) {
        let choices = [];

        // If the user has already set up the AI, change the menu options
        if (config.isSetup) {
            choices = [
                { name: `1. Run Manual Code Review (${config.llmType === 'local' ? 'Local LLM' : (config.apiProvider ? config.apiProvider.toUpperCase() : 'API')})`, value: 'review' },
                { name: '2. Run Full Project Scan (Offline + AI Auto-Fix)', value: 'deep_scan' },
                { name: '3. Reconfigure AI Settings', value: 'reconfigure' },
                { name: '4. Check for Updates', value: 'update' },
                { name: '5. Generate CI/CD Pipeline', value: 'ci' },
                { name: '6. /help', value: 'help' },
                { name: '7. Exit', value: 'exit' }
            ];
        } else {
            choices = [
                { name: '1. Setup Local LLM', value: 'local' },
                { name: '2. Setup Cloud AI API (OpenAI, Anthropic, Gemini)', value: 'api' },
                { name: '3. Run Full Project Scan (Offline + AI Auto-Fix)', value: 'deep_scan' },
                { name: '4. Check for Updates', value: 'update' },
                { name: '5. Generate CI/CD Pipeline', value: 'ci' },
                { name: '6. /help', value: 'help' },
                { name: '7. Exit', value: 'exit' }
            ];
        }

        let choice = await select({
            message: 'What would you like to do?',
            choices: choices
        });

        // Handle Reconfigure sub-menu
        if (choice === 'reconfigure') {
            const reconfChoice = await select({
                message: 'Which AI engine do you want to configure?',
                choices: [
                    { name: 'Local LLM', value: 'local' },
                    { name: 'Cloud API (OpenAI/Anthropic/Gemini)', value: 'api' },
                    { name: 'Cancel', value: 'cancel' }
                ]
            });
            if (reconfChoice === 'cancel') continue;
            choice = reconfChoice; // Route to the setup blocks below
        }

        if (choice === 'local') {
            config.llmType = 'local';
            
            const provider = await select({
                message: 'Select your Local LLM Provider:',
                choices: [
                    { name: 'Ollama (Auto-detect)', value: 'ollama' },
                    { name: 'Custom API URL', value: 'custom' }
                ]
            });

            if (provider === 'ollama') {
                config.localUrl = 'http://127.0.0.1:11434/api/generate';
                const spinner = ora({ text: tealGradient('Detecting local Ollama models...'), color: 'cyan' }).start();
                try {
                    const res = await fetch('http://127.0.0.1:11434/api/tags');
                    if (!res.ok) throw new Error('Network response was not ok');
                    const data = await res.json();
                    spinner.stop();
                    
                    if (data.models && data.models.length > 0) {
                        const choices = data.models.map(m => ({ name: m.name, value: m.name }));
                        config.localModel = await select({
                            message: 'Select an installed Ollama model:',
                            choices: choices
                        });
                    } else {
                        console.log(chalk.yellow('⚠️  No models found in Ollama. Please pull a model first (e.g., ollama pull llama3).'));
                        config.localModel = await input({ message: 'Enter local model name manually:', default: 'llama3' });
                    }
                } catch (e) {
                    spinner.stop();
                    console.log(chalk.yellow('⚠️  Could not connect to Ollama automatically. Is it running?'));
                    config.localUrl = await input({ message: 'Enter Ollama API URL:', default: config.localUrl });
                    config.localModel = await input({ message: 'Enter local model name:', default: config.localModel });
                }
            } else {
                config.localUrl = await input({ message: 'Enter custom API URL:', default: config.localUrl });
                config.localModel = await input({ message: 'Enter local model name:', default: config.localModel });
            }

            config.isSetup = true; // Mark as setup
            saveConfig(config);
            console.log(chalk.green('✓ Local LLM configured and saved locally!\n'));

            const runNow = await confirm({ message: 'Do you want to run a code review right now?' });
            if (runNow) {
                const reviewed = await executeManualReview(config);
                if (reviewed) exit = true;
            }
        } else if (choice === 'api') {
            config.llmType = 'api';
            
            const provider = await select({
                message: 'Select your API Provider:',
                choices: [
                    { name: 'OpenAI', value: 'openai' },
                    { name: 'Anthropic', value: 'anthropic' },
                    { name: 'Google Gemini', value: 'gemini' }
                ]
            });
            config.apiProvider = provider;
            
            let defaultModel = '';
            if (provider === 'openai') defaultModel = 'gpt-4o';
            if (provider === 'anthropic') defaultModel = 'claude-3-5-sonnet-latest';
            if (provider === 'gemini') defaultModel = 'gemini-2.5-flash';
            
            config.apiKey = await password({ message: `Enter ${provider} API Key:`, mask: '*' });
            config.modelName = await input({ message: 'Enter Model Name:', default: defaultModel });
            
            config.isSetup = true; // Mark as setup
            saveConfig(config);
            const displayProvider = provider.charAt(0).toUpperCase() + provider.slice(1);
            console.log(chalk.green(`✓ ${displayProvider} API configured and saved locally!\n`));

            const runNow = await confirm({ message: 'Do you want to run a code review right now?' });
            if (runNow) {
                const reviewed = await executeManualReview(config);
                if (reviewed) exit = true;
            }
        } else if (choice === 'review') {
            const reviewed = await executeManualReview(config);
            if (reviewed) exit = true;
        } else if (choice === 'deep_scan') {
            await runDeepProjectScan(config);
        } else if (choice === 'update') {
            updateOops();
        } else if (choice === 'ci') {
            await generateCiCdPipeline();
        } else if (choice === 'help') {
             console.log(tealGradient('\n━━━━━━━━━ Oops Help ━━━━━━━━━'));
             console.log(chalk.white('Oops is an AI Code Review Assistant that prevents you from pushing bad code.'));
             console.log(chalk.white('It intercepts your git commits via a pre-commit hook.\n'));
             console.log(tealGradient('Commands:'));
             console.log(chalk.cyan('oops start'), '   - Open this interactive menu.');
             console.log(chalk.cyan('git commit'), '   - Automatically triggers Oops to scan staged files.\n');
             console.log(tealGradient('Configuration:'));
             console.log(chalk.white('Your settings are saved securely in: ') + chalk.gray(CONFIG_PATH) + '\n');
        } else if (choice === 'exit') {
            exit = true;
            console.log(tealGradient('Goodbye!'));
        }
    }
}

function updateOops() {
    console.log(chalk.cyan('\nChecking for updates from GitHub...'));
    try {
        const isGlobal = __dirname.includes('.oops-cli');
        if (isGlobal) {
            // Safe to reset if it's the global installation folder
            execSync('git fetch', { encoding: 'utf-8', cwd: __dirname });
            execSync('git reset --hard origin/main', { encoding: 'utf-8', cwd: __dirname });
            console.log(chalk.green('✓ Oops updated successfully!\n'));
        } else {
            // For developers working locally, do a normal pull
            try {
                const result = execSync('git pull', { encoding: 'utf-8', cwd: __dirname });
                if (result.includes('Already up to date')) {
                    console.log(chalk.green('✓ Oops is already up to date!\n'));
                } else {
                    console.log(chalk.green('✓ Oops updated successfully!\n'));
                }
            } catch (pullError) {
                console.error(chalk.red('\n🚨 Update failed! You have uncommitted local changes in your oops.ai repository.'));
                console.log(chalk.yellow('Please commit or stash your changes before running update.\n'));
            }
        }
    } catch (e) {
        console.error(chalk.red('\n🚨 Failed to update Oops. Are you sure it was installed via git clone?'));
    }
}

async function generateCiCdPipeline() {
    const platform = await select({
        message: 'Which CI/CD platform do you use?',
        choices: [
            { name: 'GitHub Actions', value: 'github' },
            { name: 'GitLab CI', value: 'gitlab' }
        ]
    });

    if (platform === 'github') {
        const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
        if (!fs.existsSync(workflowsDir)) {
            fs.mkdirSync(workflowsDir, { recursive: true });
        }
        
        const ymlContent = `name: Oops Security Scan

on:
  pull_request:
    branches: [ "main", "master" ]

jobs:
  oops-security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Oops AI
        run: npm install -g https://github.com/omn7/oops.ai.git

      - name: Run Deep Project Scan
        run: oops scan
`;
        
        const targetFile = path.join(workflowsDir, 'oops-security.yml');
        fs.writeFileSync(targetFile, ymlContent, 'utf8');
        
        console.log(chalk.green(`\n✓ CI/CD Pipeline successfully generated at `) + chalk.cyan('.github/workflows/oops-security.yml'));
    } else if (platform === 'gitlab') {
        const ymlContent = `stages:
  - security-scan

oops-security-scan:
  stage: security-scan
  image: node:20
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm install -g https://github.com/omn7/oops.ai.git
    - oops scan
`;
        const targetFile = path.join(process.cwd(), '.gitlab-ci.yml');
        fs.writeFileSync(targetFile, ymlContent, 'utf8');
        console.log(chalk.green(`\n✓ CI/CD Pipeline successfully generated at `) + chalk.cyan('.gitlab-ci.yml'));
    }
    
    console.log(chalk.white(`Whenever someone opens a Pull/Merge Request, Oops will automatically scan the project!\n`));
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === '--pre-commit') {
        await runPreCommitHook();
    } else if (command === 'scan') {
        const config = loadConfig();
        await runDeepProjectScan(config);
    } else if (command === 'update') {
        updateOops();
    } else if (command === 'setup-ci') {
        await generateCiCdPipeline();
    } else if (command === 'start') {
        printHeader();
        await showMainMenu();
    } else {
        console.log(chalk.gray('Usage: oops start'));
        console.log(chalk.gray('Usage: node index.js start'));
    }
}

main().catch(error => {
    if (error.name === 'ExitPromptError') {
        // Handle user pressing Ctrl+C gracefully
        console.log(tealGradient('\nGoodbye!'));
        process.exit(0);
    }
    console.error(chalk.red('🚨 An unexpected error occurred:'), error);
    process.exit(1);
});
