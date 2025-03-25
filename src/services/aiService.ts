import axios from 'axios';

const API_URL = 'http://localhost:5002/api';

interface AICompletionRequest {
  prompt: string;
  model?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  language?: string;
  request_type?: 'completion' | 'documentation' | 'explanation';
}

interface AICompletionResponse {
  response: string;
  model: string;
  timestamp: string;
  provider?: string;
}

interface AIError {
  error: string;
  detail?: string;
}

export const AIService = {
  /**
   * Get a completion from AI via our backend API
   * @param request The completion request parameters
   * @returns The response from the AI provider
   */
  async getCompletion(request: AICompletionRequest): Promise<AICompletionResponse> {
    try {
      const response = await axios.post<AICompletionResponse>(
        `${API_URL}/ai/completion`,
        request
      );
      return response.data;
    } catch (error: any) {
      console.error('Error fetching AI completion:', error);
      
      // Check if the error response contains specific error details
      if (error.response && error.response.data) {
        const errorData = error.response.data as AIError;
        
        // Handle quota exceeded or billing errors
        if (errorData.error && (
          errorData.error.includes('quota') || 
          errorData.error.includes('billing') ||
          errorData.error.includes('API key')
        )) {
          throw new Error(`AI API Key Error: ${errorData.error}`);
        }
        
        // Handle proxy configuration errors
        if (errorData.error && errorData.error.includes('proxies')) {
          throw new Error(`AI Configuration Error: Server proxy settings issue. Please contact administrator.`);
        }
        
        // Handle other specific errors
        if (errorData.error) {
          throw new Error(errorData.error);
        }
      }
      
      // Generic error handling
      throw error;
    }
  },

  /**
   * Get a code completion suggestion
   * @param code The code to get a completion for
   * @param language The programming language
   * @returns The code completion
   */
  async getCodeCompletion(code: string, language: string): Promise<string> {
    const systemPrompt = `You are an expert ${language} programmer. 
    Provide code completion that is concise, efficient, and follows best practices.
    Only return code without explanation.`;
    
    try {
      const response = await this.getCompletion({
        prompt: code,
        system_prompt: systemPrompt,
        temperature: 0.3, // Lower temperature for more deterministic code completions
        language: language,
        request_type: 'completion'
      });
      
      // Add provider info if available
      const providerInfo = response.provider ? ` (via ${response.provider})` : '';
      return response.response + (providerInfo ? `\n\n${providerInfo}` : '');
    } catch (error) {
      console.error('Error fetching code completion:', error);
      throw error;
    }
  },

  /**
   * Generate documentation for the given code
   * @param code The code to document
   * @param language The programming language
   * @returns The documentation for the code
   */
  async generateDocumentation(code: string, language: string): Promise<string> {
    const systemPrompt = `You are an expert at writing documentation. 
    Analyze the provided ${language} code and generate clear, comprehensive documentation
    that explains what the code does, any parameters, return values, and important details.`;
    
    try {
      const response = await this.getCompletion({
        prompt: `Generate documentation for the following ${language} code:\n\n${code}`,
        system_prompt: systemPrompt,
        temperature: 0.5,
        language: language,
        request_type: 'documentation'
      });
      
      // Add provider info if available
      const providerInfo = response.provider ? ` (via ${response.provider})` : '';
      return response.response + (providerInfo ? `\n\n${providerInfo}` : '');
    } catch (error) {
      console.error('Error generating documentation:', error);
      throw error;
    }
  },

  /**
   * Explain the given code in plain English
   * @param code The code to explain
   * @param language The programming language
   * @returns An explanation of what the code does
   */
  async explainCode(code: string, language: string): Promise<string> {
    const systemPrompt = `You are a programming teacher who explains code in simple terms.
    Analyze the provided ${language} code and explain what it does in clear, concise language
    that a junior developer would understand. Focus on the purpose and logic, not line-by-line details.`;
    
    try {
      const response = await this.getCompletion({
        prompt: `Explain this ${language} code in simple terms:\n\n${code}`,
        system_prompt: systemPrompt,
        temperature: 0.7,
        language: language,
        request_type: 'explanation'
      });
      
      // Add provider info if available
      const providerInfo = response.provider ? ` (via ${response.provider})` : '';
      return response.response + (providerInfo ? `\n\n${providerInfo}` : '');
    } catch (error) {
      console.error('Error explaining code:', error);
      throw error;
    }
  }
}; 