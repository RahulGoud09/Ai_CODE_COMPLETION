import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Box, 
  Container, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  AppBar, 
  Toolbar, 
  Typography, 
  Alert, 
  Snackbar, 
  Button,
  Grid,
  Paper,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
  useTheme
} from '@mui/material';
import {
  Code as CodeIcon,
  Description as DocIcon,
  Help as HelpIcon,
  CleaningServices as CleanIcon,
  Add as AddIcon,
  InsertDriveFile as InsertIcon
} from '@mui/icons-material';
import axios from 'axios';
import * as monaco from 'monaco-editor';
import { AIService } from './services/aiService';
import { styled } from '@mui/material/styles';

// Styled components
const StyledPaper = styled(Paper)(({ theme }) => ({
  borderRadius: theme.spacing(1),
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  transition: 'box-shadow 0.3s ease',
  '&:hover': {
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
}));

const ActionButton = styled(Button)(({ theme }) => ({
  borderRadius: theme.spacing(1),
  textTransform: 'none',
  padding: theme.spacing(1, 2),
  fontWeight: 500,
}));

const EditorWrapper = styled(Box)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.spacing(1),
  overflow: 'hidden',
}));

// Configure axios defaults
axios.defaults.timeout = 10000; // 10 second timeout
axios.defaults.headers.common['Content-Type'] = 'application/json';
axios.defaults.headers.common['Accept'] = 'application/json';

// Extend Window interface to include monaco
declare global {
  interface Window {
    monaco: typeof monaco;
  }
}

// Configure backend URL based on environment
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5002';

// Verify backend connection on component mount
const verifyBackendConnection = async () => {
  try {
    const response = await axios.get(`${BACKEND_URL}/`);
    console.log('Backend connection verified:', response.data);
  } catch (error) {
    console.error('Backend connection failed:', error);
  }
};

function App() {
  const [code, setCode] = useState('# Start typing your code here...');
  const [language, setLanguage] = useState('python');
  const [suggestions, setSuggestions] = useState<Array<{ completion: string; confidence: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState<'complete' | 'document' | 'explain' | 'remove' | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [isConfigError, setIsConfigError] = useState(false);

  // Verify backend connection when component mounts
  useEffect(() => {
    verifyBackendConnection();
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    if (value) {
      setCode(value);
      // Debounce the API call to avoid too many requests
      const timeoutId = setTimeout(() => {
        getSuggestions(value);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  };

  const getSuggestions = async (codeSnippet: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log('Sending request to backend:', { code: codeSnippet, language });
      const response = await axios.post(`${BACKEND_URL}/api/complete`, {
        code: codeSnippet,
        language
      });
      console.log('Received response:', response.data);
      
      if (!response.data.suggestions) {
        throw new Error('Invalid response format from server');
      }

      setSuggestions(response.data.suggestions);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      let errorMessage = 'Failed to fetch code suggestions. Please try again.';
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Cannot connect to the backend server. Please make sure it is running.';
        } else if (error.response) {
          errorMessage = `Server error: ${error.response.data.error || error.response.statusText}`;
        } else if (error.request) {
          errorMessage = 'No response from server. Please check your connection.';
        }
      }
      setError(errorMessage);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (completion: string) => {
    // Insert the suggestion at the current cursor position
    const editor = window.monaco?.editor.getModels()[0];
    if (editor) {
      const position = editor.getPositionAt(code.length);
      editor.pushEditOperations(
        [],
        [
          {
            range: editor.getFullModelRange(),
            text: code + completion,
          },
        ],
        () => null
      );
    }
  };

  // AI functions
  const handleCompleteCode = async () => {
    setAiLoading(true);
    setAiAction('complete');
    setAiResponse(null);
    setError(null);
    setIsQuotaError(false);
    setIsConfigError(false);
    try {
      const completion = await AIService.getCodeCompletion(code, language);
      setAiResponse(completion);
    } catch (error: any) {
      console.error('Error completing code with AI:', error);
      
      // Display a more informative error message if available
      if (error.message && error.message.includes('AI API Key Error')) {
        setError('AI API quota exceeded or billing issue. The API key needs to be updated or billing issues need to be resolved.');
        setIsQuotaError(true);
      } else if (error.message && error.message.includes('Configuration Error')) {
        setError('AI configuration error on the server. The administrator needs to fix proxy settings.');
        setIsConfigError(true);
      } else {
        setError(`Failed to get code completion from AI: ${error.message || 'Please try again later.'}`);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleDocumentCode = async () => {
    setAiLoading(true);
    setAiAction('document');
    setAiResponse(null);
    setError(null);
    setIsQuotaError(false);
    setIsConfigError(false);
    try {
      const documentation = await AIService.generateDocumentation(code, language);
      setAiResponse(documentation);
    } catch (error: any) {
      console.error('Error generating documentation with AI:', error);
      
      // Display a more informative error message if available
      if (error.message && error.message.includes('AI API Key Error')) {
        setError('AI API quota exceeded or billing issue. The API key needs to be updated or billing issues need to be resolved.');
        setIsQuotaError(true);
      } else if (error.message && error.message.includes('Configuration Error')) {
        setError('AI configuration error on the server. The administrator needs to fix proxy settings.');
        setIsConfigError(true);
      } else {
        setError(`Failed to generate documentation with AI: ${error.message || 'Please try again later.'}`);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleExplainCode = async () => {
    setAiLoading(true);
    setAiAction('explain');
    setAiResponse(null);
    setError(null);
    setIsQuotaError(false);
    setIsConfigError(false);
    try {
      const explanation = await AIService.explainCode(code, language);
      setAiResponse(explanation);
    } catch (error: any) {
      console.error('Error explaining code with AI:', error);
      
      // Display a more informative error message if available
      if (error.message && error.message.includes('AI API Key Error')) {
        setError('AI API quota exceeded or billing issue. The API key needs to be updated or billing issues need to be resolved.');
        setIsQuotaError(true);
      } else if (error.message && error.message.includes('Configuration Error')) {
        setError('AI configuration error on the server. The administrator needs to fix proxy settings.');
        setIsConfigError(true);
      } else {
        setError(`Failed to explain code with AI: ${error.message || 'Please try again later.'}`);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleInsertAtCursor = () => {
    if (!aiResponse) return;
    
    const editor = window.monaco?.editor.getModels()[0];
    if (editor) {
      const selection = window.monaco?.editor.getEditors()[0]?.getSelection();
      if (selection) {
        // Replace selected text with AI response
        editor.pushEditOperations(
          [],
          [
            {
              range: selection,
              text: aiResponse,
            },
          ],
          () => null
        );
      } else {
        // Replace entire content with AI response at cursor position
        editor.pushEditOperations(
          [],
          [
            {
              range: editor.getFullModelRange(),
              text: aiResponse,
            },
          ],
          () => null
        );
      }
      // Update the code state
      setCode(aiResponse);
    }
  };

  const handleCleanCode = async () => {
    setAiLoading(true);
    setAiAction('remove');
    setAiResponse(null);
    setError(null);
    setIsQuotaError(false);
    setIsConfigError(false);
    try {
      const editor = window.monaco?.editor.getModels()[0];
      if (editor) {
        const selection = window.monaco?.editor.getEditors()[0]?.getSelection();
        const selectedText = selection ? editor.getValueInRange(selection) : code;
        
        const prompt = `Please help me remove unnecessary code while keeping the core functionality:\n\n${selectedText}`;
        const cleanedCode = await AIService.getCodeCompletion(prompt, language);
        setAiResponse(cleanedCode);
      }
    } catch (error: any) {
      console.error('Error cleaning code:', error);
      handleAIError(error);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIError = (error: any) => {
    if (error.message && error.message.includes('AI API Key Error')) {
      setError('AI API quota exceeded or billing issue. The API key needs to be updated or billing issues need to be resolved.');
      setIsQuotaError(true);
    } else if (error.message && error.message.includes('Configuration Error')) {
      setError('AI configuration error on the server. The administrator needs to fix proxy settings.');
      setIsConfigError(true);
    } else {
      setError(`Failed to process with AI: ${error.message || 'Please try again later.'}`);
    }
  };

  const handleApplyAiResponse = () => {
    if (!aiResponse) return;
    
    // Replace the entire code with AI response
    setCode(aiResponse);
    
    // Update editor content
    const editor = window.monaco?.editor.getModels()[0];
    if (editor) {
      editor.pushEditOperations(
        [],
        [
          {
            range: editor.getFullModelRange(),
            text: aiResponse,
          },
        ],
        () => null
      );
    }
  };

  return (
    <Box sx={{ 
      flexGrow: 1, 
      bgcolor: (theme) => theme.palette.background.default,
      minHeight: '100vh'
    }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'white', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <CodeIcon sx={{ mr: 2, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: 'text.primary', fontWeight: 600 }}>
            AI Code Assistant
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="language-select-label">Language</InputLabel>
            <Select
              labelId="language-select-label"
              value={language}
              label="Language"
              onChange={(e) => setLanguage(e.target.value)}
            >
              <MenuItem value="python">Python</MenuItem>
              <MenuItem value="javascript">JavaScript</MenuItem>
              <MenuItem value="java">Java</MenuItem>
              <MenuItem value="cpp">C++</MenuItem>
            </Select>
          </FormControl>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 3 }}>
        <Grid container spacing={3}>
          {/* Left side - Code Editor */}
          <Grid item xs={12} md={6}>
            <StyledPaper sx={{ height: 'calc(100vh - 160px)' }}>
              <EditorWrapper sx={{ height: '100%' }}>
                <Editor
                  height="100%"
                  defaultLanguage="python"
                  language={language}
                  value={code}
                  onChange={handleEditorChange}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: true,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    folding: true,
                    padding: { top: 10, bottom: 10 },
                  }}
                />
              </EditorWrapper>
            </StyledPaper>
          </Grid>

          {/* Right side - AI Integration and Suggestions */}
          <Grid item xs={12} md={6}>
            <Box sx={{ height: 'calc(100vh - 160px)', overflow: 'auto', px: 1 }}>
              {/* AI Actions */}
              <StyledPaper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  AI Actions
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Tooltip title="Complete code">
                    <ActionButton
                      variant="contained"
                      startIcon={<CodeIcon />}
                      onClick={handleCompleteCode}
                      disabled={aiLoading || !code || isQuotaError || isConfigError}
                    >
                      Complete
                    </ActionButton>
                  </Tooltip>
                  <Tooltip title="Generate documentation">
                    <ActionButton
                      variant="contained"
                      color="secondary"
                      startIcon={<DocIcon />}
                      onClick={handleDocumentCode}
                      disabled={aiLoading || !code || isQuotaError || isConfigError}
                    >
                      Document
                    </ActionButton>
                  </Tooltip>
                  <Tooltip title="Explain code">
                    <ActionButton
                      variant="contained"
                      color="info"
                      startIcon={<HelpIcon />}
                      onClick={handleExplainCode}
                      disabled={aiLoading || !code || isQuotaError || isConfigError}
                    >
                      Explain
                    </ActionButton>
                  </Tooltip>
                  <Tooltip title="Remove unnecessary code">
                    <ActionButton
                      variant="contained"
                      color="warning"
                      startIcon={<CleanIcon />}
                      onClick={handleCleanCode}
                      disabled={aiLoading || !code || isQuotaError || isConfigError}
                    >
                      Clean
                    </ActionButton>
                  </Tooltip>
                </Box>
              </StyledPaper>

              {/* Error Alerts */}
              {isQuotaError && (
                <Alert 
                  severity="error" 
                  variant="outlined"
                  sx={{ mb: 3 }}
                >
                  <Typography variant="subtitle2" fontWeight="bold">AI API Quota Exceeded</Typography>
                  <Typography variant="body2">
                    Please visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> to
                    resolve API key or billing issues.
                  </Typography>
                </Alert>
              )}
              
              {isConfigError && (
                <Alert 
                  severity="error"
                  variant="outlined"
                  sx={{ mb: 3 }}
                >
                  <Typography variant="subtitle2" fontWeight="bold">Configuration Error</Typography>
                  <Typography variant="body2">
                    Contact administrator to resolve AI service connection issues.
                  </Typography>
                </Alert>
              )}

              {/* AI Response */}
              <StyledPaper sx={{ p: 2, mb: 3, position: 'relative', minHeight: '200px' }}>
                {aiLoading ? (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    height: '200px'
                  }}>
                    <CircularProgress size={40} />
                  </Box>
                ) : aiResponse ? (
                  <Box>
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                      {aiAction === 'complete' && 'Code Completion'}
                      {aiAction === 'document' && 'Documentation'}
                      {aiAction === 'explain' && 'Code Explanation'}
                      {aiAction === 'remove' && 'Cleaned Code'}
                    </Typography>
                    <Box sx={{ 
                      whiteSpace: 'pre-wrap', 
                      fontFamily: 'monospace',
                      bgcolor: (theme) => theme.palette.grey[50],
                      p: 2,
                      borderRadius: 1,
                      maxHeight: '300px',
                      overflow: 'auto',
                      border: '1px solid',
                      borderColor: 'divider'
                    }}>
                      {aiResponse}
                    </Box>
                    
                    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                      {(aiAction === 'complete' || aiAction === 'document') && (
                        <>
                          <ActionButton 
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={handleApplyAiResponse}
                          >
                            Append to Editor
                          </ActionButton>
                          <ActionButton 
                            variant="outlined"
                            startIcon={<InsertIcon />}
                            onClick={handleInsertAtCursor}
                          >
                            Insert at Cursor
                          </ActionButton>
                        </>
                      )}
                      {aiAction === 'remove' && (
                        <ActionButton 
                          variant="outlined"
                          startIcon={<InsertIcon />}
                          onClick={handleInsertAtCursor}
                        >
                          Apply Cleaned Code
                        </ActionButton>
                      )}
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '200px',
                    color: 'text.secondary'
                  }}>
                    <Typography variant="body1">
                      Select an AI action above to get started
                    </Typography>
                  </Box>
                )}
              </StyledPaper>

              {/* Quick Suggestions */}
              <StyledPaper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                  Quick Suggestions
                  {loading && <CircularProgress size={20} sx={{ ml: 2 }} />}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {suggestions.map((suggestion, index) => (
                    <Paper 
                      key={index} 
                      variant="outlined"
                      sx={{ 
                        p: 2, 
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        '&:hover': { 
                          bgcolor: (theme) => theme.palette.action.hover,
                          transform: 'translateY(-2px)'
                        }
                      }}
                      onClick={() => handleSuggestionClick(suggestion.completion)}
                    >
                      <Typography sx={{ 
                        fontFamily: 'monospace', 
                        whiteSpace: 'pre-wrap',
                        fontSize: '0.9rem'
                      }}>
                        {suggestion.completion}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Confidence: {(suggestion.confidence * 100).toFixed(1)}%
                      </Typography>
                    </Paper>
                  ))}
                  {suggestions.length === 0 && !loading && (
                    <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 4 }}>
                      Start typing to see code suggestions
                    </Typography>
                  )}
                </Box>
              </StyledPaper>
            </Box>
          </Grid>
        </Grid>
      </Container>

      <Snackbar 
        open={!!error && !isQuotaError && !isConfigError} 
        autoHideDuration={6000} 
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setError(null)} 
          severity="error" 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App;
