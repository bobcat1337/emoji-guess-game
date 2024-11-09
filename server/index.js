const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const stringSimilarity = require('string-similarity');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Game state
let gameState = {
  host: null,
  guessers: [],
  isGameStarted: false,
  hostReady: false
};

// Add this to your existing server code
const wordLists = {
  countries: [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
    "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
    "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
    "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso",
    "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic",
    "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Congo-Brazzaville)", "Costa Rica",
    "Croatia", "Cuba", "Cyprus", "Czechia (Czech Republic)", "Democratic Republic of the Congo",
    "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
    "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini (fmr. Swaziland)", "Ethiopia", "Fiji",
    "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada",
    "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Holy See", "Honduras", "Hungary",
    "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica",
    "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos",
    "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
    "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
    "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro",
    "Morocco", "Mozambique", "Myanmar (formerly Burma)", "Namibia", "Nauru", "Nepal", "Netherlands",
    "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia",
    "Norway", "Oman", "Pakistan", "Palau", "Palestine State", "Panama", "Papua New Guinea", "Paraguay",
    "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis",
    "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
    "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
    "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka",
    "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste",
    "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine",
    "United Arab Emirates", "United Kingdom", "United States of America", "Uruguay", "Uzbekistan", "Vanuatu",
    "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
  ]
};

// Add these to your game state
let currentWord = '';
let currentEmojis = [];
let scores = {};
let currentRound = 1;
let guessAttempts = {};

// Improved game state management
function updateGameStateWithHost(username) {
  gameState.host = username;
  gameState.guessers = gameState.guessers.filter(name => name !== username);
}

function addGuesser(username) {
  if (!gameState.guessers.includes(username)) {
    gameState.guessers.push(username);
  }
}

// Helper function to normalize strings for comparison
function normalizeString(str) {
  return str.toLowerCase().trim();
}

// Helper function to calculate points
function calculatePoints(attempts) {
  const basePoints = 100;
  const penaltyPerAttempt = 10;
  return Math.max(basePoints - (attempts * penaltyPerAttempt), 10);
}

io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle player login
  socket.on('login', (username) => {
    socket.username = username;
    addGuesser(username);
    updatePlayers();
  });

  // Handle become host request
  socket.on('becomeHost', (username) => {
    if (!gameState.host) {
      updateGameStateWithHost(username);
      updatePlayers();
    }
  });

  // Handle start game request
  socket.on('startGame', () => {
    if (gameState.host && gameState.guessers.length >= 1) {
      gameState.hostReady = false;
      const words = getRandomWords(3);
      socket.emit('wordOptions', words);
      gameState.isGameStarted = true;
      io.emit('gameStarted');
    }
  });

  // Handle select word request
  socket.on('selectWord', (word) => {
    console.log('Host selected word:', word);
    currentWord = word;
    console.log('Current word set to:', currentWord);
    socket.broadcast.emit('gameMessage', 'Host is selecting emojis...');
  });

  // Handle set emojis request
  socket.on('setEmojis', (emojis) => {
    currentEmojis = emojis;
    io.emit('gameState', { emojis: currentEmojis });
  });

  // Handle make guess request
  socket.on('makeGuess', (data) => {
    const { guess } = data;
    console.log('Received guess:', guess, 'Current word:', currentWord);

    // Normalize both strings for comparison
    const normalizedGuess = normalizeString(guess);
    const normalizedWord = normalizeString(currentWord);
    
    const similarity = stringSimilarity.compareTwoStrings(normalizedGuess, normalizedWord);
    console.log('Similarity:', similarity);

    if (normalizedGuess === normalizedWord) {
      // Calculate points (you can adjust the scoring logic)
      const points = calculatePoints(guessAttempts[socket.username] || 0);
      scores[socket.username] = (scores[socket.username] || 0) + points;

      // Reset game state
      currentWord = '';
      currentEmojis = [];
      gameState.isGameStarted = false;
      
      // Emit the correct guess event to all clients
      io.emit('correctGuess', {
        winner: socket.username,
        word: guess,
        newScores: scores
      });

      console.log('Correct guess by:', socket.username);
    } else {
      // Track guess attempts
      guessAttempts[socket.username] = (guessAttempts[socket.username] || 0) + 1;

      // Send feedback based on similarity
      let message;
      if (similarity > 0.75) {
        message = '🔥 Very close!';
      } else if (similarity > 0.6) {
        message = '👍 Getting warmer!';
      } else if (similarity > 0.4) {
        message = '🤔 On the right track...';
      } else if (similarity > 0.2) {
        message = '❄️ Cold...';
      } else {
        message = '🌨️ Very cold!';
      }

      // Send feedback only to the guesser
      socket.emit('guessResponse', { message, similarity });
      console.log('Incorrect guess feedback sent to:', socket.username);
    }
  });

  socket.on('playAgain', () => {
    scores = {};
    currentRound = 1;
    gameState.host = null;
    gameState.guessers = [];
    gameState.isGameStarted = false;
    currentWord = '';
    currentEmojis = [];
    io.emit('resetGame');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.username) {
      if (gameState.host === socket.username) {
        gameState.host = null;
      } else {
        gameState.guessers = gameState.guessers.filter(name => name !== socket.username);
      }
      updatePlayers();
    }
    console.log('User disconnected');
  });

  // Add this handler for new words request
  socket.on('requestNewWords', () => {
    try {
      const words = getRandomWords(3);
      socket.emit('wordOptions', words);
    } catch (error) {
      console.error('Failed to get new words:', error);
      socket.emit('error', 'Failed to generate new words');
    }
  });

  // Add handler for host ready
  socket.on('hostReady', (emojis) => {
    currentEmojis = emojis;
    gameState.hostReady = true;
    io.emit('hostConfirmed', emojis);
  });

  // Helper function to update all clients with current players
  function updatePlayers() {
    io.emit('updatePlayers', {
      host: gameState.host,
      guessers: gameState.guessers
    });
  }

  // Improved getRandomWords function with error handling
  function getRandomWords(count) {
    const allWords = wordLists.countries;
    const words = [];
    try {
      while (words.length < count) {
        const word = allWords[Math.floor(Math.random() * allWords.length)];
        if (!words.includes(word)) {
          words.push(word);
        }
      }
      return words;
    } catch (error) {
      console.error('Error selecting random words:', error);
      throw error; // Rethrow to handle it in the calling context
    }
  }

  // Add this handler for word selection
  socket.on('wordSelected', (word) => {
    currentWord = word;
    console.log('Host selected word:', currentWord);
    socket.broadcast.emit('gameMessage', 'Host is selecting emojis...');
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 