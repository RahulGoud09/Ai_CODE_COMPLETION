from flask import Flask, request, jsonify, Blueprint, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
import os
import time
import json
from functools import wraps
from typing import List, Dict, Optional, Tuple, Any
import logging
import traceback
from datetime import datetime, timedelta
import hashlib
import re
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(filename="app.log"),
    ]
)
logger = logging.getLogger(__name__)

# Mock responses for when API is unavailable
MOCK_RESPONSES = {
    "code_completion": {
        "python": """
def calculate_total(items):
    \"\"\"Calculate the total price of all items.\"\"\"
    total = 0
    for item in items:
        total += item.get('price', 0) * item.get('quantity', 1)
    return total
""",
        "javascript": """
function calculateTotal(items) {
  // Calculate the total price of all items
  let total = 0;
  for (const item of items) {
    total += (item.price || 0) * (item.quantity || 1);
  }
  return total;
}
"""
    },
    "documentation": {
        "python": """
# Code Documentation

## Overview
This code appears to be implementing a function to process data.

## Functions

### `process_data(data)`
Processes the input data and returns a transformed result.

#### Parameters:
- `data` (dict): The input data to process

#### Returns:
- dict: The processed data
"""
    },
    "explanation": {
        "python": """
This code is defining a function that processes input data. Here's what it does:

1. It takes an input parameter 'data'
2. It validates the input to ensure it has the required fields
3. It performs calculations or transformations on the data
4. It returns the processed result

The code follows Python best practices by including docstrings and type hints.
"""
    }
}

# Configure API clients
gemini_api_key = os.environ.get("GEMINI_API_KEY", "AIzaSyDhRisSo7WDaC9v5J2CkDKRv2_X8MmgsZo")

# Configure Gemini
genai.configure(api_key=gemini_api_key)

# Mock database for users (in a real app, you would use a proper database)
USERS_DB = {
    "admin@example.com": {
        "password": generate_password_hash("adminpassword"),
        "role": "admin"
    },
    "user@example.com": {
        "password": generate_password_hash("userpassword"),
        "role": "user"
    }
}

# Simple in-memory cache
cache = {}
CACHE_EXPIRY = 300  # 5 minutes

def create_app(test_config=None):
    """Application factory pattern for Flask app"""
    app = Flask(__name__)
    
    # Configuration
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-key-please-change-in-production"),
        JWT_SECRET_KEY=os.environ.get("JWT_SECRET_KEY", "jwt-secret-key-change-in-production"),
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(hours=1),
    )
    
    if test_config:
        app.config.update(test_config)
    
    # Extensions
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    jwt = JWTManager(app)
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["200 per day", "50 per hour"],
        storage_uri="memory://",
    )
    
    # Middleware
    @app.before_request
    def before_request():
        g.start_time = time.time()
    
    @app.after_request
    def after_request(response):
        if hasattr(g, 'start_time'):
            diff = time.time() - g.start_time
            logger.info(f"Request processed in {diff:.4f} seconds")
        return response
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404
    
    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
    
    # Authentication
    def role_required(role):
        def decorator(fn):
            @wraps(fn)
            @jwt_required()
            def wrapper(*args, **kwargs):
                identity = get_jwt_identity()
                if identity in USERS_DB and USERS_DB[identity]["role"] == role:
                    return fn(*args, **kwargs)
                return jsonify({"error": "Insufficient privileges"}), 403
            return wrapper
        return decorator
    
    # Caching
    def cached(expiry=CACHE_EXPIRY):
        def decorator(fn):
            @wraps(fn)
            def wrapper(*args, **kwargs):
                # Create a cache key based on function name and arguments
                key_parts = [fn.__name__]
                # Add request data for POST/PUT methods
                if request.method in ["POST", "PUT"] and request.is_json:
                    key_parts.append(json.dumps(request.json, sort_keys=True))
                # Add query params for GET
                if request.method == "GET":
                    key_parts.append(json.dumps(dict(request.args), sort_keys=True))
                
                cache_key = hashlib.md5(":".join(key_parts).encode()).hexdigest()
                
                # Check if we have a cached response
                if cache_key in cache:
                    entry = cache[cache_key]
                    if entry["expiry"] > time.time():
                        logger.debug(f"Cache hit for {cache_key}")
                        return entry["data"]
                    else:
                        # Expired, remove from cache
                        del cache[cache_key]
                
                # No cache hit, execute function
                result = fn(*args, **kwargs)
                
                # Cache the result
                cache[cache_key] = {
                    "data": result,
                    "expiry": time.time() + expiry
                }
                
                return result
            return wrapper
        return decorator
    
    # Create API Blueprint
    api = Blueprint("api", __name__, url_prefix="/api")
    
    # Rate limiting by endpoint
    @limiter.limit("5 per minute")
    @api.route('/complete', methods=['POST'])
    @cached(expiry=60)  # Cache completions for 1 minute
    def complete_code():
        data = request.json
        logger.debug(f"Received request with data: {data}")
        
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
        
        code_snippet = data.get('code', '')
        language = data.get('language', 'python')
        context = data.get('context', '')  # Additional context can improve suggestions
        
        if not code_snippet:
            logger.error("No code snippet provided")
            return jsonify({'error': 'No code snippet provided'}), 400
        
        try:
            suggestions = get_advanced_suggestions(code_snippet, language, context)
            logger.debug(f"Generated suggestions: {suggestions}")
            return jsonify({'suggestions': suggestions})
        except Exception as e:
            logger.error(f"Error generating suggestions: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({'error': str(e)}), 500

    @api.route('/languages', methods=['GET'])
    @cached(expiry=3600)  # Cache for an hour
    def get_languages():
        return jsonify({
            'languages': [
                {'id': 'python', 'name': 'Python', 'version': '3.x'},
                {'id': 'javascript', 'name': 'JavaScript', 'version': 'ES6+'},
                {'id': 'typescript', 'name': 'TypeScript', 'version': '4.x'},
                {'id': 'java', 'name': 'Java', 'version': '11+'},
                {'id': 'cpp', 'name': 'C++', 'version': '17+'},
                {'id': 'csharp', 'name': 'C#', 'version': '8+'},
                {'id': 'go', 'name': 'Go', 'version': '1.x'},
                {'id': 'rust', 'name': 'Rust', 'version': '1.x'}
            ]
        })
    
    @api.route('/auth/login', methods=['POST'])
    @limiter.limit("5 per minute")
    def login():
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({"error": "Email and password required"}), 400
        
        if email not in USERS_DB:
            # Use a generic error message to prevent user enumeration
            return jsonify({"error": "Invalid credentials"}), 401
        
        if not check_password_hash(USERS_DB[email]["password"], password):
            return jsonify({"error": "Invalid credentials"}), 401
        
        # Create access token
        access_token = create_access_token(identity=email)
        return jsonify({
            "access_token": access_token,
            "user": {
                "email": email,
                "role": USERS_DB[email]["role"]
            }
        })
    
    @api.route('/admin/stats', methods=['GET'])
    @role_required('admin')
    def get_stats():
        return jsonify({
            "users_count": len(USERS_DB),
            "cache_entries": len(cache),
            "uptime": time.time() - app.start_time if hasattr(app, 'start_time') else 0
        })
    
    @api.route('/health', methods=['GET'])
    def health_check():
        return jsonify({
            "status": "ok",
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0"
        })

    @api.route('/ai/completion', methods=['POST'])
    @limiter.limit("10 per minute")
    def ai_completion():
        data = request.json
        
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
        
        prompt = data.get('prompt', '')
        language = data.get('language', 'python')
        
        if not prompt:
            logger.error("No prompt provided")
            return jsonify({'error': 'No prompt provided'}), 400
        
        try:
            logger.info("Attempting to use Gemini API")
            # Configure the generation model
            generation_config = {
                "temperature": data.get('temperature', 0.7),
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": data.get('max_tokens', 1000),
            }
            
            safety_settings = [
                {
                    "category": "HARM_CATEGORY_HARASSMENT",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    "category": "HARM_CATEGORY_HATE_SPEECH",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                },
            ]
            
            # Create the Gemini model
            gemini_model = genai.GenerativeModel(
                model_name="gemini-1.5-pro",
                generation_config=generation_config,
                safety_settings=safety_settings
            )
            
            # System prompt + user prompt
            system_prompt = data.get('system_prompt', 'You are a helpful assistant.')
            combined_prompt = f"{system_prompt}\n\n{prompt}"
            
            # Generate content with Gemini
            gemini_response = gemini_model.generate_content(combined_prompt)
            
            # Extract and return the response
            response = gemini_response.text
            
            return jsonify({
                'response': response,
                'model': 'gemini-1.5-pro',
                'timestamp': datetime.now().isoformat(),
                'provider': 'gemini'
            })
                
        except Exception as e:
            error_message = str(e)
            logger.error(f"Error with Gemini API: {error_message}")
            logger.error(traceback.format_exc())
            
            # If API fails, use mock response
            # Determine request type
            request_type = "code_completion"
            if "document" in prompt.lower():
                request_type = "documentation"
            elif "explain" in prompt.lower():
                request_type = "explanation"
                
            # Get appropriate mock response
            mock_response = MOCK_RESPONSES.get(request_type, {}).get(
                language.lower(), MOCK_RESPONSES.get(request_type, {}).get("python", "No response available")
            )
            
            return jsonify({
                'response': f"[MOCK RESPONSE - API failed]\n\n{mock_response}",
                'model': 'mock',
                'timestamp': datetime.now().isoformat(),
                'provider': 'mock'
            })

    # Register blueprint
    app.register_blueprint(api)
    
    # Root endpoint
    @app.route('/')
    def index():
        return jsonify({
            'status': 'ok',
            'message': 'AI Code Completion API is running',
            'version': '1.0.0',
            'documentation': '/api/docs',
            'endpoints': [
                '/api/health',
                '/api/complete',
                '/api/languages',
                '/api/auth/login',
                '/api/admin/stats'
            ]
        })
    
    # Store start time
    app.start_time = time.time()
    
    return app

def get_advanced_suggestions(code_snippet: str, language: str, context: str = "") -> List[Dict]:
    """
    Generate advanced code completion suggestions based on patterns, context, and language.
    
    Args:
        code_snippet: The partial code to complete
        language: The programming language
        context: Optional additional context (e.g., file content)
        
    Returns:
        A list of suggestion dictionaries with completion and confidence
    """
    suggestions = []
    
    # Language-specific patterns
    patterns = {
        'python': {
            # Functions
            r'def\s+(\w+)\s*\(': [
                ('self) -> None:\n    """[FUNCTION_NAME] method.\n    \n    Args:\n        self: The class instance\n    """\n    pass', 0.9),
                (') -> None:\n    """[FUNCTION_NAME] function.\n    \n    Returns:\n        None\n    """\n    pass', 0.85)
            ],
            # Classes
            r'class\s+(\w+)': [
                (':\n    """[CLASS_NAME] class for handling business logic.\n    """\n    def __init__(self):\n        """Initialize the [CLASS_NAME]."""\n        pass', 0.9),
                ('(object):\n    """[CLASS_NAME] class extending object."""\n    def __init__(self):\n        super().__init__()\n', 0.85)
            ],
            # If statements
            r'if\s+': [
                ('__name__ == "__main__":\n    main()', 0.9),
                ('condition:\n    # TODO: Implement condition handling\n    pass\nelse:\n    pass', 0.85)
            ],
            # For loops
            r'for\s+': [
                ('i in range(len(items)):\n    item = items[i]\n    # Process item\n    pass', 0.9),
                ('item in items:\n    # Process item\n    pass', 0.85)
            ],
            # Try-except
            r'try\s*:': [
                ('\n    # Risky operation\n    pass\nexcept Exception as e:\n    logger.error(f"Error: {e}")\n    raise', 0.9),
                ('\n    # Risky operation\n    pass\nexcept Exception as e:\n    print(f"Error: {e}")\nfinally:\n    # Cleanup\n    pass', 0.85)
            ],
            # Imports
            r'import\s+': [
                ('os\nimport sys\nimport json\nfrom typing import List, Dict, Optional', 0.8),
                ('numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt', 0.8)
            ],
            # With statement
            r'with\s+': [
                ('open("file.txt", "r") as f:\n    content = f.read()\n    # Process content', 0.9),
                ('contextlib.suppress(Exception):\n    # Code that might raise an exception\n    pass', 0.85)
            ]
        },
        'javascript': {
            # Functions
            r'function\s+(\w+)\s*\(': [
                (') {\n  // Function implementation\n  return null;\n}', 0.9),
                (') {\n  /**\n   * Implementation details\n   */\n  console.log("Function called");\n}', 0.85)
            ],
            # Arrow functions
            r'const\s+(\w+)\s*=\s*\(': [
                (') => {\n  // Function implementation\n  return null;\n};', 0.9),
                (') => {\n  /**\n   * Implementation details\n   */\n  console.log("Function called");\n};', 0.85)
            ],
            # Classes
            r'class\s+(\w+)': [
                (' {\n  constructor() {\n    // Initialize\n  }\n\n  method() {\n    // Method implementation\n  }\n}', 0.9),
                (' extends ParentClass {\n  constructor() {\n    super();\n    // Initialize\n  }\n}', 0.85)
            ]
            # More JavaScript patterns would go here
        }
        # Add patterns for other languages here
    }
    
    # Select patterns based on language
    language_patterns = patterns.get(language.lower(), {})
    
    # Process each pattern for the language
    for pattern_regex, completions in language_patterns.items():
        match = re.search(pattern_regex, code_snippet)
        if match:
            for completion_template, confidence in completions:
                # Extract capture groups
                groups = match.groups()
                completion = completion_template
                
                # Replace placeholders with captured groups if available
                if groups:
                    for i, group in enumerate(groups):
                        if group:
                            # Replace function/class names
                            completion = completion.replace(f'[FUNCTION_NAME]', group)
                            completion = completion.replace(f'[CLASS_NAME]', group)
                
                suggestions.append({
                    'completion': completion,
                    'confidence': confidence,
                    'type': 'pattern_match'
                })
    
    # Analyze recent code context to improve suggestions
    if context:
        # Extract imports to suggest similar patterns
        if language.lower() == 'python':
            import_matches = re.findall(r'import\s+(\w+)', context)
            if import_matches:
                common_follows = {
                    'os': [
                        ('os.path.join(directory, filename)', 0.8),
                        ('os.environ.get("KEY", "default")', 0.75)
                    ],
                    'numpy': [
                        ('np.array([1, 2, 3])', 0.8),
                        ('np.zeros((3, 3))', 0.75)
                    ],
                    'pandas': [
                        ('pd.DataFrame(data)', 0.8),
                        ('pd.read_csv("file.csv")', 0.75)
                    ],
                    # Add more libraries and common patterns
                }
                
                for imp in import_matches:
                    if imp in common_follows:
                        for completion, confidence in common_follows[imp]:
                            suggestions.append({
                                'completion': completion,
                                'confidence': confidence,
                                'type': 'context_based'
                            })
        
        # Detect variable names to provide better suggestions
        variable_matches = re.findall(r'(\w+)\s*=', context)
        if variable_matches and language.lower() == 'python':
            for var in variable_matches[-5:]:  # Consider the 5 most recent variables
                suggestions.append({
                    'completion': f'{var}.',
                    'confidence': 0.7,
                    'type': 'variable_based'
                })
    
    # If no specific pattern matches, provide general suggestions based on language
    if not suggestions:
        general_suggestions = {
            'python': [
                {
                    'completion': '\n# TODO: Implement this function\npass',
                    'confidence': 0.7,
                    'type': 'general'
                },
                {
                    'completion': '\nreturn None',
                    'confidence': 0.6,
                    'type': 'general'
                }
            ],
            'javascript': [
                {
                    'completion': '\n// TODO: Implement this function\nreturn null;',
                    'confidence': 0.7,
                    'type': 'general'
                },
                {
                    'completion': '\nconsole.log("Debug point");',
                    'confidence': 0.6,
                    'type': 'general'
                }
            ],
            # Add more languages
        }
        
        suggestions = general_suggestions.get(language.lower(), [
            {
                'completion': '\n// TODO: Implement',
                'confidence': 0.5,
                'type': 'general'
            }
        ])
    
    # Sort by confidence and return top results
    return sorted(suggestions, key=lambda x: x['confidence'], reverse=True)[:5]

if __name__ == '__main__':
    app = create_app()
    # Change default port from 5000 to 5001 to avoid conflicts with AirPlay on macOS
    port = int(os.environ.get("PORT", 5002))
    
    # Add more debug information
    logger.info("Starting Flask server...")
    logger.info(f"Server will run on port {port}")
    logger.info("Available routes:")
    for rule in app.url_map.iter_rules():
        logger.info(f"  {rule}")
    
    app.run(debug=os.environ.get("FLASK_DEBUG", "true").lower() == "true", 
            host='0.0.0.0', 
            port=port)