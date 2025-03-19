import os
import httpx
from openai import OpenAI
from dotenv import load_dotenv
import sys

def test_openai_key():
    """Test the OpenAI API key and provide detailed feedback"""
    print("\n=== OpenAI API Key Status Test ===\n")
    
    # Load environment variables
    load_dotenv()
    
    # Get API key from environment or command line
    api_key = os.environ.get("OPENAI_API_KEY")
    if len(sys.argv) > 1:
        api_key = sys.argv[1]
        print(f"Using API key from command line argument")
    
    if not api_key:
        print("❌ ERROR: No API key found")
        print("Please set the OPENAI_API_KEY environment variable or pass it as an argument")
        print("Example: python test_key_status.py sk-your-key-here")
        return
    
    # Mask the API key for privacy in output
    masked_key = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "****"
    print(f"📝 Testing API key: {masked_key}")
    
    # Unset any proxy environment variables
    proxy_vars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']
    original_env = {}
    for var in proxy_vars:
        if var in os.environ:
            original_env[var] = os.environ[var]
            del os.environ[var]
    
    try:
        # Create a client with custom HTTP settings
        http_client = httpx.Client(
            proxies=None,
            follow_redirects=True,
            timeout=httpx.Timeout(timeout=30.0)
        )
        
        # Create OpenAI client with custom HTTP client
        client = OpenAI(
            api_key=api_key,
            http_client=http_client
        )
        
        print("🔄 Sending request to OpenAI API...")
        
        # Create a simple completion
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo", # Using cheaper model for testing
            messages=[
                {"role": "user", "content": "Hello, this is a test message. Reply with OK if you can see this."}
            ],
            max_tokens=10
        )
        
        # Print the response
        print(f"✅ SUCCESS! API key is working properly")
        print(f"Response: {completion.choices[0].message.content}")
        print("\nUsage statistics:")
        print(f"- Prompt tokens: {completion.usage.prompt_tokens}")
        print(f"- Completion tokens: {completion.usage.completion_tokens}")
        print(f"- Total tokens: {completion.usage.total_tokens}")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        
        # Provide more helpful information based on error type
        error_msg = str(e).lower()
        
        if "unauthorized" in error_msg or "invalid" in error_msg:
            print("\n🔑 This appears to be an INVALID API KEY issue:")
            print("- Check that you're using a valid API key")
            print("- Ensure the key was copied correctly without extra spaces")
            print("- Create a new API key at https://platform.openai.com/api-keys")
            
        elif "insufficient_quota" in error_msg or "exceeded" in error_msg:
            print("\n💰 This appears to be a QUOTA/BILLING issue:")
            print("- Your API key has exceeded its quota")
            print("- Check your billing status at https://platform.openai.com/account/billing")
            print("- Add payment method or increase spending limits")
            print("- Create a new API key if needed")
            
        elif "rate" in error_msg and "limit" in error_msg:
            print("\n⏱️ This appears to be a RATE LIMIT issue:")
            print("- You're making too many requests in a short period")
            print("- Implement proper rate limiting in your application")
            print("- Wait a minute and try again")
            
        elif "connect" in error_msg or "timeout" in error_msg or "proxy" in error_msg:
            print("\n🌐 This appears to be a NETWORK issue:")
            print("- Check your internet connection")
            print("- Verify proxy settings if you're using a proxy")
            print("- Ensure your firewall isn't blocking the connection")
        
        return False
        
    finally:
        # Restore original environment variables
        for var, value in original_env.items():
            os.environ[var] = value

if __name__ == "__main__":
    test_openai_key() 