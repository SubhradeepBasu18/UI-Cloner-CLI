# UI Cloner CLI

A powerful command-line interface (CLI) tool that reads website frontends and generates clean, maintainable code using AI. This tool helps developers quickly replicate website UIs by automatically generating HTML, CSS, and JavaScript code from existing web pages.

## Video Demo

[![Video Demo](https://img.youtube.com/vi/VIDEO_ID/0.jpg)](https://www.youtube.com/watch?v=VIDEO_ID)

## ✨ Features

- 🕸️ Web scraping capabilities to extract frontend code
- 🤖 AI-powered code generation using Google's Generative AI
- 💅 Automatic code formatting with Prettier
- 📦 Simple setup and easy-to-use CLI interface
- 🔄 Support for modern JavaScript (ES modules)
- 🎨 Generates clean, well-structured code

## 🚀 Installation

1. Make sure you have [Node.js](https://nodejs.org/) (v14 or higher) installed
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/UICreatorCLI.git
   cd UICreatorCLI
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file in the project root and add your Google AI API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

## 🛠️ Usage

1. Run the tool:
   ```bash
   node src/index.js
   ```
2. Enter the URL of the website you want to analyze when prompted
3. The tool will process the website and generate the corresponding code
4. The generated code will be saved in the `output` directory

## 📁 Project Structure

```
UICreatorCLI/
├── src/
│   ├── index.js        # Main entry point
│   ├── scrapper.js     # Web scraping functionality
│   └── prompt.js       # AI prompt templates
├── .env               # Environment variables
├── package.json       # Project configuration
└── README.md          # This file
```

## 🔧 Dependencies

- `axios`: HTTP client for making requests
- `cheerio`: HTML parsing and manipulation
- `dotenv`: Environment variable management
- `prettier`: Code formatting
- `openai`: OpenAI API client (used with Google's AI API)

