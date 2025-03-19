const http = require('http');
const url = require('url');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Configuration
const CONFIG = {
  PORT: process.env.PORT || 3000,
  DEFAULT_LIMIT: 20,
  KEYS_FILE: path.join(__dirname, 'api-keys.json')
};

// Load exercises data
let exercises;
try {
  exercises = JSON.parse(fs.readFileSync('./exercise-data/exercises.json', 'utf8'));
  console.log(`Loaded ${exercises.length} exercises`);
} catch (error) {
  console.error('Failed to load exercises data:', error);
  process.exit(1);
}

// API key storage - load from file if exists
let API_KEYS = {};

// Load existing API keys
function loadApiKeys() {
  try {
    if (fs.existsSync(CONFIG.KEYS_FILE)) {
      const keysData = fs.readFileSync(CONFIG.KEYS_FILE, 'utf8');
      API_KEYS = JSON.parse(keysData);
      console.log(`Loaded ${Object.keys(API_KEYS).length} API keys from storage`);
    } else {
      console.log('No API keys file found, starting with empty key store');
      API_KEYS = {};
    }
  } catch (error) {
    console.error('Error loading API keys:', error);
    API_KEYS = {};
  }
}

// Save API keys to file
function saveApiKeys() {
  try {
    fs.writeFileSync(CONFIG.KEYS_FILE, JSON.stringify(API_KEYS, null, 2));
    console.log('API keys saved to file');
  } catch (error) {
    console.error('Error saving API keys:', error);
  }
}

// Initialize keys
loadApiKeys();

// Generate a new API key
const generateApiKey = () => {
  const apiKey = crypto.randomBytes(24).toString('hex');
  API_KEYS[apiKey] = {
    createdAt: Date.now()
  };
  
  // Save keys to disk
  saveApiKeys();
  
  return apiKey;
};

// Validate API key middleware
const validateApiKey = (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const apiKey = parsedUrl.query.apiKey || req.headers['x-api-key'];
  
  // Skip validation for public routes
  if (parsedUrl.pathname === '/docs' || parsedUrl.pathname === '/get-api-key') {
    return true;
  }
  
  if (!apiKey || !API_KEYS[apiKey]) {
    sendResponse(res, { error: 'Invalid or missing API key' }, 401);
    return false;
  }
  
  return true;
};

// Helper functions
const sendResponse = (res, data, statusCode = 200) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
  
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data, null, 2));
};

// Parse request body
const parseBody = async (req) => {
  return new Promise((resolve, reject) => {
    const body = [];
    req.on('data', (chunk) => {
      body.push(chunk);
    });
    
    req.on('end', () => {
      try {
        const parsedBody = Buffer.concat(body).toString();
        const data = parsedBody ? JSON.parse(parsedBody) : {};
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
    
    req.on('error', (error) => {
      reject(error);
    });
  });
};

// Helper function to apply pagination
const paginateResults = (data, limit, offset) => {
  const parsedLimit = parseInt(limit) || CONFIG.DEFAULT_LIMIT;
  const parsedOffset = parseInt(offset) || 0;
  
  return {
    count: data.length,
    next: parsedOffset + parsedLimit < data.length ? 
          `?offset=${parsedOffset + parsedLimit}&limit=${parsedLimit}` : null,
    previous: parsedOffset > 0 ? 
             `?offset=${Math.max(0, parsedOffset - parsedLimit)}&limit=${parsedLimit}` : null,
    results: data.slice(parsedOffset, parsedOffset + parsedLimit)
  };
};

// Helper function to filter exercises based on multiple criteria
const filterExercises = (filters) => {
  return exercises.filter(exercise => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true; // Skip empty filters
      
      switch(key) {
        case 'name':
          return exercise.name.toLowerCase().includes(value.toLowerCase());
        case 'bodyPart':
          return exercise.bodyPart.toLowerCase() === value.toLowerCase();
        case 'equipment':
          return exercise.equipment.toLowerCase() === value.toLowerCase();
        case 'target':
          return exercise.target.toLowerCase() === value.toLowerCase();
        default:
          return true;
      }
    });
  });
};

// Route handlers
const routes = {
  // GET /exercises - List exercises with optional filters
  'GET /exercises': (query) => {
    const filters = {
      name: query.name,
      bodyPart: query.bodyPart,
      equipment: query.equipment,
      target: query.target
    };
    
    const filteredExercises = filterExercises(filters);
    return paginateResults(filteredExercises, query.limit, query.offset);
  },
  
  // GET /exercises/bodyPartList - Get unique body parts
  'GET /exercises/bodyPartList': () => {
    return [...new Set(exercises.map(ex => ex.bodyPart))].sort();
  },
  
  // GET /exercises/equipmentList - Get unique equipment
  'GET /exercises/equipmentList': () => {
    return [...new Set(exercises.map(ex => ex.equipment))].sort();
  },
  
  // GET /exercises/targetList - Get unique target muscles
  'GET /exercises/targetList': () => {
    return [...new Set(exercises.map(ex => ex.target))].sort();
  },
  
  // GET /get-api-key - Generate an API key for anyone
  'GET /get-api-key': () => {
    const apiKey = generateApiKey();
    return { 
      apiKey, 
      message: 'Your API key has been generated. Include this key with each request either as a query parameter (apiKey=key) or in the X-API-Key header.'
    };
  },
  
  // GET /docs - API documentation
  'GET /docs': () => {
    return {
      name: 'Exercise API',
      version: '1.0.0',
      description: 'API for accessing exercise data',
      authentication: {
        description: 'This API requires an API key. Get your free API key at /get-api-key',
        apiKeyLocation: 'Query parameter "apiKey" or request header "X-API-Key"'
      },
      endpoints: [
        { path: '/get-api-key', method: 'GET', description: 'Generate a free API key' },
        { path: '/exercises', method: 'GET', description: 'List exercises with optional filters' },
        { path: '/exercises/bodyPartList', method: 'GET', description: 'Get all unique body parts' },
        { path: '/exercises/equipmentList', method: 'GET', description: 'Get all unique equipment' },
        { path: '/exercises/targetList', method: 'GET', description: 'Get all unique target muscles' },
        { path: '/exercises/bodyPart/:bodyPart', method: 'GET', description: 'Get exercises by body part' },
        { path: '/exercises/equipment/:equipment', method: 'GET', description: 'Get exercises by equipment' },
        { path: '/exercises/target/:target', method: 'GET', description: 'Get exercises by target muscle' },
        { path: '/exercises/exercise/:id', method: 'GET', description: 'Get exercise by ID' },
        { path: '/exercises/name/:name', method: 'GET', description: 'Search exercises by name' },
      ]
    };
  }
};

// Dynamic route handlers
const dynamicRoutes = {
  '/exercises/bodyPart/': (param, query) => {
    const filtered = filterExercises({ bodyPart: param });
    return paginateResults(filtered, query.limit, query.offset);
  },
  
  '/exercises/equipment/': (param, query) => {
    const filtered = filterExercises({ equipment: param });
    return paginateResults(filtered, query.limit, query.offset);
  },
  
  '/exercises/target/': (param, query) => {
    const filtered = filterExercises({ target: param });
    return paginateResults(filtered, query.limit, query.offset);
  },
  
  '/exercises/exercise/': (param) => {
    const exercise = exercises.find(ex => ex.id === param);
    if (!exercise) throw new Error('Exercise not found');
    return exercise;
  },
  
  '/exercises/name/': (param, query) => {
    const filtered = filterExercises({ name: param });
    return paginateResults(filtered, query.limit, query.offset);
  }
};

// Create and start the server
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    sendResponse(res, {});
    return;
  }
  
  try {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    // Log request
    console.log(`${req.method} ${path} ${new Date().toISOString()}`);
    
    // Validate API key
    if (!validateApiKey(req, res)) {
      return;
    }
    
    // Check if route exists in standard routes
    const routeKey = `${req.method} ${path}`;
    if (routes[routeKey]) {
      const result = await routes[routeKey](query, req);
      sendResponse(res, result);
      return;
    }
    
    // Check dynamic routes
    for (const [prefix, handler] of Object.entries(dynamicRoutes)) {
      if (path.startsWith(prefix)) {
        const param = path.slice(prefix.length);
        if (!param) {
          sendResponse(res, { error: 'Parameter required' }, 400);
          return;
        }
        const result = handler(decodeURIComponent(param), query);
        sendResponse(res, result);
        return;
      }
    }
    
    // If no route matches
    sendResponse(res, { error: 'Not found' }, 404);
    
  } catch (error) {
    console.error('Error:', error);
    
    // Don't expose internal errors to clients
    const errorMessage = error.message === 'Unauthorized' ? 
      error.message : 'Internal server error';
    
    sendResponse(res, { error: errorMessage }, 
      error.message === 'Unauthorized' ? 401 : 500);
  }
});

// Start the server
server.listen(CONFIG.PORT, () => {
  console.log(`Server running on port ${CONFIG.PORT}`);
  console.log(`API Documentation available at: http://localhost:${CONFIG.PORT}/docs`);
  console.log(`Get an API key at: http://localhost:${CONFIG.PORT}/get-api-key`);
});