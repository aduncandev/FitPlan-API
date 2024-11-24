const http = require('http');
const url = require('url');
const fs = require('fs');

// Load exercises data
const exercises = JSON.parse(fs.readFileSync('./exercise-data/exercises.json', 'utf8'));

// Helper function to send JSON response
const sendResponse = (res, data, statusCode = 200) => {
    res.writeHead(statusCode, { 
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(data));
};

// Helper function to apply pagination
const paginateResults = (data, limit, offset) => {
    const parsedLimit = parseInt(limit) || 20;
    const parsedOffset = parseInt(offset) || 0;
    return {
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

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;
    const { limit, offset } = query;

    // Only allow GET requests
    if (req.method !== 'GET') {
        sendResponse(res, { error: 'Method not allowed' }, 405);
        return;
    }

    try {
        // Route handling
        if (path === '/exercises') {
            // Extract filter parameters
            const filters = {
                name: query.name,
                bodyPart: query.bodyPart,
                equipment: query.equipment,
                target: query.target
            };

            // Apply filters and pagination
            const filteredExercises = filterExercises(filters);
            const result = paginateResults(filteredExercises, limit, offset);
            sendResponse(res, result);
            return;
        }

        if (path === '/exercises/bodyPartList') {
            const bodyParts = [...new Set(exercises.map(ex => ex.bodyPart))].sort();
            sendResponse(res, bodyParts);
            return;
        }

        if (path === '/exercises/equipmentList') {
            const equipment = [...new Set(exercises.map(ex => ex.equipment))].sort();
            sendResponse(res, equipment);
            return;
        }

        if (path === '/exercises/targetList') {
            const targets = [...new Set(exercises.map(ex => ex.target))].sort();
            sendResponse(res, targets);
            return;
        }

        // Dynamic routes
        const routes = {
            '/exercises/bodyPart/': (param) => {
                const filtered = filterExercises({ bodyPart: param });
                return paginateResults(filtered, limit, offset);
            },
            '/exercises/equipment/': (param) => {
                const filtered = filterExercises({ equipment: param });
                return paginateResults(filtered, limit, offset);
            },
            '/exercises/target/': (param) => {
                const filtered = filterExercises({ target: param });
                return paginateResults(filtered, limit, offset);
            },
            '/exercises/exercise/': (param) => {
                const exercise = exercises.find(ex => ex.id === param);
                if (!exercise) throw new Error('Exercise not found');
                return exercise;
            },
            '/exercises/name/': (param) => {
                const filtered = filterExercises({ name: param });
                return paginateResults(filtered, limit, offset);
            }
        };

        // Check if the path matches any of our dynamic routes
        for (const [route, handler] of Object.entries(routes)) {
            if (path.startsWith(route)) {
                const param = path.slice(route.length);
                if (!param) {
                    sendResponse(res, { error: 'Parameter required' }, 400);
                    return;
                }
                const result = handler(decodeURIComponent(param));
                sendResponse(res, result);
                return;
            }
        }

        // If no route matches
        sendResponse(res, { error: 'Not found' }, 404);

    } catch (error) {
        console.error('Error:', error);
        sendResponse(res, { error: error.message }, 500);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
