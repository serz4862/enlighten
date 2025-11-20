const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration - Using gemini-1.5-flash (least expensive model)
const MODEL_NAME = 'gemini-1.5-flash';
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
  res.json({ status: 'ok', model: MODEL_NAME, temperature: TEMPERATURE });
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

    try {
      // Get Gemini model
      const model = genAI.getGenerativeModel({ 
        model: MODEL_NAME,
        generationConfig: {
          temperature: TEMPERATURE,
          maxOutputTokens: 1024,
        }
      });

      // Generate content
      const result = await model.generateContent(prompt);
      const response = await result.response;
      geminiResponse = response.text();

    } catch (apiError) {
      console.error('Gemini API Error:', apiError.message);
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
  console.log(`Server running on port ${PORT}`);
  console.log(`Model: ${MODEL_NAME}`);
  console.log(`Temperature: ${TEMPERATURE}`);
});

