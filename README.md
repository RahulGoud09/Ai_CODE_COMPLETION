# AI Code Completion

A powerful code completion tool powered by Google's Gemini AI. This application provides intelligent code suggestions, documentation generation, and code explanations.

## Features

- **Code Completion**: Get intelligent code suggestions as you type
- **Documentation Generation**: Automatically generate documentation for your code
- **Code Explanation**: Get clear explanations of your code in plain English
- **Multi-language Support**: Works with multiple programming languages
- **Real-time Suggestions**: Get suggestions as you type
- **Modern UI**: Clean and intuitive user interface

## Tech Stack

- **Frontend**: React, TypeScript, Material-UI, Monaco Editor
- **Backend**: Flask, Python
- **AI**: Google Gemini API
- **Development**: Node.js, npm

## Prerequisites

- Python 3.8+
- Node.js 14+
- npm 6+
- Google Gemini API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/RahulGoud09/Ai_CODE_COMPLETION.git
cd Ai_CODE_COMPLETION
```

2. Set up the backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Set up the frontend:
```bash
cd frontend
npm install
```

4. Create environment files:

Backend (.env):
```
FLASK_ENV=development
FLASK_DEBUG=true
PORT=5002
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here
GEMINI_API_KEY=your-gemini-api-key
```

Frontend (.env):
```
REACT_APP_BACKEND_URL=http://localhost:5002
REACT_APP_AI_ENABLED=true
```

## Running the Application

1. Start the backend server:
```bash
cd backend
python app.py
```

2. Start the frontend development server:
```bash
cd frontend
npm start
```

3. Open your browser and navigate to `http://localhost:5005`

## Usage

1. Select your programming language from the dropdown
2. Start typing your code in the editor
3. Use the buttons to:
   - Complete Code: Get suggestions for completing your code
   - Generate Docs: Generate documentation for your code
   - Explain Code: Get an explanation of your code

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Google Gemini API for providing the AI capabilities
- Monaco Editor for the code editor component
- Material-UI for the UI components

## Development Status

This is currently a work in progress. Future improvements will include:
- Enhanced AI model integration
- More programming language support
- Customizable suggestion settings
- Integration with popular IDEs 

## Troubleshooting

### OpenAI API Quota Exceeded Error

If you see an error message about quota being exceeded:

1. **Check API Key Status**:
   Run the test script to check your API key:
   ```bash
   cd backend
   python test_key_status.py
   ```
   
2. **Get a New API Key**:
   - Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
   - Create a new API key
   - Copy the new key

3. **Update Your API Key**:
   - Open the `.env` file in the project root and `backend/.env`
   - Replace the value for `OPENAI_API_KEY` with your new key
   
4. **Check Billing Status**:
   - Visit [OpenAI Billing](https://platform.openai.com/account/billing)
   - Make sure your account has a valid payment method
   - Check if you have exceeded your usage limits
   
5. **Restart the Backend**:
   ```bash
   cd backend
   python app.py
   ```

### Using the Test Script

The `test_key_status.py` script helps diagnose API key issues:

```bash
# Test using the key from .env file
python test_key_status.py

# Or test a specific key
python test_key_status.py sk-your-key-here
``` 