const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Validate API key before starting
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ ERROR: GEMINI_API_KEY is not set in environment variables!');
  console.error('Please create a .env file in the backend directory with:');
  console.error('GEMINI_API_KEY=your_actual_api_key_here');
  console.error('\nGet your API key from: https://makersuite.google.com/app/apikey');
  process.exit(1);
}

if (process.env.GEMINI_API_KEY.trim() === '' || process.env.GEMINI_API_KEY === 'your_actual_api_key_here') {
  console.error('❌ ERROR: GEMINI_API_KEY is empty or still has placeholder value!');
  console.error('Please update your .env file with a valid Gemini API key.');
  console.error('Get your API key from: https://makersuite.google.com/app/apikey');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration - Try multiple models in order of preference (cheapest/fastest first)
// Based on available models from Gemini API v1beta
const MODEL_OPTIONS = [
  'gemini-2.5-flash',     // Fastest and most cost-effective (stable release June 2025)
  'gemini-2.5-pro',       // More capable if flash unavailable
  'gemini-2.0-flash-exp'  // Experimental version as fallback
];

// Use the first model as default, will try others if it fails
const MODEL_NAME = MODEL_OPTIONS[0];
const TEMPERATURE = 0.7;

/**
 * Helper function to detect brand mentions in text
 * Supports both exact and fuzzy matching
 */
function detectBrandMention(text, brandName) {
  if (!text || !brandName) {
    return { mentioned: false, position: null };
  }

  const textLower = text.toLowerCase();
  const brandLower = brandName.toLowerCase().trim();
  
  // Split text into sentences/segments for position detection
  const segments = text.split(/[.\n]/);
  
  // Try exact match first
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].toLowerCase();
    if (segment.includes(brandLower)) {
      return { mentioned: true, position: i + 1 };
    }
  }
  
  // Try fuzzy matching (case-insensitive, handle common variations)
  // Check for brand name with different spacing or punctuation
  const brandWords = brandLower.split(/\s+/);
  const brandPattern = brandWords.join('[\\s\\-\\_]*');
  const regex = new RegExp(brandPattern, 'i');
  
  for (let i = 0; i < segments.length; i++) {
    if (regex.test(segments[i])) {
      return { mentioned: true, position: i + 1 };
    }
  }
  
  // Check word boundaries for partial matches
  const words = textLower.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z0-9]/g, '');
    const brand = brandLower.replace(/[^a-z0-9]/g, '');
    
    // Fuzzy match: check if brand is contained in word or vice versa
    if (word.length > 3 && brand.length > 3) {
      if (word.includes(brand) || brand.includes(word)) {
        // Find which segment this word belongs to
        let charCount = 0;
        for (let j = 0; j < segments.length; j++) {
          charCount += segments[j].length;
          if (charCount >= text.toLowerCase().indexOf(word)) {
            return { mentioned: true, position: j + 1 };
          }
        }
      }
    }
  }
  
  return { mentioned: false, position: null };
}

/**
 * Canned response for when API fails
 */
function getCannedResponse() {
  return `Here are some popular options in the market:
1. Leading industry solutions
2. Well-established platforms
3. Innovative tools and services
4. Cost-effective alternatives
5. Enterprise-grade solutions

These represent various options available for your needs.`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    model: MODEL_NAME, 
    modelOptions: MODEL_OPTIONS,
    temperature: TEMPERATURE 
  });
});

// Main API endpoint to check brand mention
app.post('/api/check-brand', async (req, res) => {
  try {
    const { prompt, brandName } = req.body;

    // Validation
    if (!prompt || !brandName) {
      return res.status(400).json({
        error: 'Both prompt and brandName are required',
        success: false
      });
    }

    if (prompt.trim().length === 0 || brandName.trim().length === 0) {
      return res.status(400).json({
        error: 'Prompt and brand name cannot be empty',
        success: false
      });
    }

    let geminiResponse;
    let usedCannedResponse = false;
    let modelUsed = MODEL_NAME;

    try {
      // Try different models in order of preference
      let lastError = null;
      let success = false;

      for (const modelName of MODEL_OPTIONS) {
        try {
          // Get Gemini model with proper configuration
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              temperature: TEMPERATURE,
              maxOutputTokens: 2048, // Increased for longer responses
              topP: 0.95,
              topK: 40,
            }
          });

          // Generate content
          const result = await model.generateContent(prompt);
          const response = await result.response;
          
          // Get text from response - properly handle the response structure
          try {
            // Try standard text() method first
            if (typeof response.text === 'function') {
              geminiResponse = response.text();
            }
          } catch (textError) {
            console.log(`Note: response.text() failed: ${textError.message}`);
          }

          // Fallback: extract from candidates if text() failed or returned empty
          if (!geminiResponse && response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
              geminiResponse = candidate.content.parts
                .map(part => part.text || '')
                .join('');
            }
          }
          
          // If still empty, check if it was blocked due to safety
          if (!geminiResponse && response.promptFeedback) {
             console.log('Safety ratings:', response.promptFeedback);
          }

          // If still empty, throw error to try next model
          if (!geminiResponse || geminiResponse.trim().length === 0) {
            throw new Error(`Model ${modelName} returned empty response (length: 0)`);
          }
          
          console.log(`✅ Successfully used model: ${modelName}`);
          console.log(`   Response length: ${geminiResponse.length} characters`);
          modelUsed = modelName;
          success = true;
          break; // Success, exit loop

        } catch (modelError) {
          lastError = modelError;
          console.log(`Model ${modelName} failed, trying next option...`);
          continue; // Try next model
        }
      }

      if (!success) {
        throw lastError || new Error('All model options failed');
      }

    } catch (apiError) {
      console.error('Gemini API Error (all models failed):', apiError.message);
      // Use canned response on API error
      geminiResponse = getCannedResponse();
      usedCannedResponse = true;
    }

    // Detect brand mention
    const detection = detectBrandMention(geminiResponse, brandName);

    // Prepare response
    const responseData = {
      success: true,
      data: {
        prompt: prompt,
        brandName: brandName,
        mentioned: detection.mentioned ? 'Yes' : 'No',
        position: detection.mentioned ? detection.position : null,
        geminiResponse: geminiResponse,
        usedCannedResponse: usedCannedResponse
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('Server Error:', error);
    
    // Even on server error, return a response with canned answer
    const cannedResponse = getCannedResponse();
    const detection = detectBrandMention(cannedResponse, req.body.brandName);
    
    res.json({
      success: true,
      data: {
        prompt: req.body.prompt,
        brandName: req.body.brandName,
        mentioned: detection.mentioned ? 'Yes' : 'No',
        position: detection.mentioned ? detection.position : null,
        geminiResponse: cannedResponse,
        usedCannedResponse: true,
        errorOccurred: true
      }
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Primary Model: ${MODEL_NAME}`);
  console.log(`📋 Model Options: ${MODEL_OPTIONS.join(', ')}`);
  console.log(`🌡️  Temperature: ${TEMPERATURE}`);
  console.log(`🔑 API Key: ${process.env.GEMINI_API_KEY ? 'Set ✓' : 'Missing ✗'}`);
  console.log(`\n💡 Test the API: http://localhost:${PORT}/health`);
  console.log(`💡 Server will try models in order until one works`);
});

