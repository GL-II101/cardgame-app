// ================== server/index.js ==================
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const app = express();
const server = http.createServer(app);

// Use environment variables for configuration
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

console.log("Environment PORT:", process.env.PORT);
console.log("Using PORT:", PORT);
console.log("All environment variables:", Object.keys(process.env));

// Health check endpoint for Railway
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Card Game Server is running' });
});

// Additional health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Card Game Server is running', timestamp: new Date().toISOString() });
});

// Simple ping endpoint
app.get('/ping', (req, res) => {
  console.log('Ping request received');
  res.send('pong');
});

// Additional health check endpoints
app.get('/health', (req, res) => {
  console.log('Health check request received');
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/status', (req, res) => {
  console.log('Status request received');
  res.json({ 
    status: 'OK', 
    port: PORT,
    clientUrl: CLIENT_URL,
    timestamp: new Date().toISOString() 
  });
});

console.log("Server starting with CLIENT_URL:", CLIENT_URL);

const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins temporarily for debugging
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// Database setup
const connectDB = require('./database');
const Score = require('./models/Score');

// Initialize scores
let scores = { Jule: 0, Finn: 0 };

// Load scores from database
async function loadScores() {
  try {
    const scoreDocs = await Score.find({});
    scores = { Jule: 0, Finn: 0 };
    scoreDocs.forEach(doc => {
      scores[doc.playerName] = doc.score;
    });
    console.log('Scores loaded from database:', scores);
  } catch (error) {
    console.error('Error loading scores:', error);
    scores = { Jule: 0, Finn: 0 };
  }
}

// Save scores to database
async function saveScores() {
  try {
    for (const [playerName, score] of Object.entries(scores)) {
      await Score.findOneAndUpdate(
        { playerName },
        { score, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }
    console.log('Scores saved to database');
  } catch (error) {
    console.error('Error saving scores:', error);
  }
}

let rooms = {};
let playerNames = {};

function shuffleDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  let deck = [];
  for (let s of suits) {
    for (let v of values) {
      deck.push({ value: v, suit: s });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  const order = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
    "7": 7, "8": 8, "9": 9, "10": 10,
    J: 11, Q: 12, K: 13, A: 14
  };
  return order[card.value];
}

function isValidPlay(pile, cards) {
  if (pile.length === 0) return true; // Allow any card if pile is empty
  const lastCard = [...pile].reverse().find(c => c.value !== "3");
  const card = cards[0];
  const cv = cardValue(card);

  if (cards.some(c => c.value !== card.value)) return false;

  if (!lastCard || card.value === "2" || card.value === "3" || card.value === "10") {
    return true;
  } else if (lastCard.value === "7") {
    return cv <= cardValue(lastCard);
  } else {
    return cv >= cardValue(lastCard);
  }
}

function removeQuadsAndNotify(roomId, userId) {
  const room = rooms[roomId];
  const playerHand = room.hands[userId];
  let removed = [];
  // Check hand
  let valueCounts = {};
  playerHand.hand.forEach(card => {
    valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
  });
  Object.keys(valueCounts).forEach(val => {
    if (valueCounts[val] === 4) {
      removed.push(val);
      playerHand.hand = playerHand.hand.filter(card => card.value !== val);
    }
  });
  // Check faceUp if hand is empty
  if (playerHand.hand.length === 0 && playerHand.faceUp.length > 0) {
    let faceUpCounts = {};
    playerHand.faceUp.forEach(card => {
      faceUpCounts[card.value] = (faceUpCounts[card.value] || 0) + 1;
    });
    Object.keys(faceUpCounts).forEach(val => {
      if (faceUpCounts[val] === 4) {
        removed.push(val);
        playerHand.faceUp = playerHand.faceUp.filter(card => card.value !== val);
      }
    });
  }
  if (removed.length > 0) {
    io.to(userId).emit("quads_removed", removed);
  }
}

io.on("connection", (socket) => {
  console.log("User connected: " + socket.id);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        ready: [],
        deck: [],
        hands: {},
        pile: [],
        turn: 0,
        discard: [],
        log: []
      };
    }
    
    // Check if room is full (max 2 players)
    if (rooms[roomId].players.length >= 2 && !rooms[roomId].players.includes(socket.id)) {
      socket.emit("room_full", "Raum ist voll (maximal 2 Spieler)");
      return;
    }
    
    if (!rooms[roomId].players.includes(socket.id)) {
      rooms[roomId].players.push(socket.id);
    }
    io.to(roomId).emit("players_update", rooms[roomId].players.length);
  });

  socket.on("ready", (roomId) => {
    const room = rooms[roomId];
    room.ready.push(socket.id);
    if (room.ready.length === 2) {
      // Reset round-specific state
      room.pile = [];
      room.discard = [];
      room.log = [];
      room.deck = shuffleDeck();
      room.openReady = [];
      room.players.forEach((id) => {
        room.hands[id] = {
          hand: room.deck.splice(0, 6),
          faceDown: room.deck.splice(0, 3),
          faceUp: [],
          mode: "prepare"
        };
      });
      room.phase = "prepare";
      io.to(roomId).emit("select_open_cards", room.hands);
    }
  });

  socket.on("set_open_cards", ({ roomId, userId, selected }) => {
    const room = rooms[roomId];
    const playerHand = room.hands[userId];
    if (!playerHand || playerHand.mode !== "prepare") return;

    // Ensure exactly 3 selected cards are from the player's hand
    const selectedCards = playerHand.hand.filter(card =>
      selected.some(sel => sel.value === card.value && sel.suit === card.suit)
    );
    if (selectedCards.length !== 3) {
      io.to(userId).emit("invalid_selection", "Bitte genau 3 Karten wählen");
      return;
    }

    // Move selected cards from hand to faceUp
    playerHand.faceUp = selectedCards;
    playerHand.hand = playerHand.hand.filter(card =>
      !selected.some(sel => sel.value === card.value && sel.suit === card.suit)
    );
    playerHand.mode = "ready";

    room.openReady = room.openReady || [];
    if (!room.openReady.includes(userId)) room.openReady.push(userId);

    io.to(userId).emit("select_open_cards", room.hands);

    // If both players have selected, start the game
    if (room.openReady.length === 2) {
      room.phase = "play";
      room.players.forEach(pid => {
        room.hands[pid].mode = "hand";
      });
      io.to(roomId).emit("start_game", room.hands);
      io.to(room.players[room.turn]).emit("your_turn");
    }
  });

  socket.on("play_card", ({ roomId, cards, userId }) => {
    const room = rooms[roomId];
    if (room.phase !== "play") return;

    const current = room.players[room.turn];
    // Allow any player to play 4s if the pile is empty
    let jumpInWithFour = false;
    if (room.pile.length === 0 && cards.length > 0 && cards.every(c => c.value === "4")) {
      jumpInWithFour = true;
    }
    if (!jumpInWithFour && userId !== current) return;

    const playerHand = room.hands[userId];
    // Debug log
    console.log("play_card called:", { pile: room.pile, pileLength: room.pile.length, cards });
    // Determine which set of cards to play from
    let playable = playerHand.hand;
    let playFrom = "hand";
    if (playerHand.hand.length === 0 && playerHand.faceUp.length > 0) {
      playable = playerHand.faceUp;
      playFrom = "faceUp";
    }
    // Debug before isValidPlay
    console.log("Before isValidPlay", { pile: room.pile, cards });
    const valid = isValidPlay(room.pile, cards);
    console.log("isValidPlay result:", valid);
    if (!valid) {
      io.to(userId).emit("invalid_move");
      return;
    }

    // Remove only the selected cards from the correct set and add to pile
    cards.forEach(c => {
      if (playFrom === "hand") {
        playerHand.hand = playerHand.hand.filter(
          (h) => !(h.value === c.value && h.suit === c.suit)
        );
      } else if (playFrom === "faceUp") {
        playerHand.faceUp = playerHand.faceUp.filter(
          (h) => !(h.value === c.value && h.suit === c.suit)
        );
      }
      room.pile.push(c);
    });

    let tenPlayed = false;
    if (cards[0].value === "10") {
      room.discard = room.pile.splice(0);
      io.to(roomId).emit("pile_cleared");
      tenPlayed = true;
    }

    // After playing cards, check for four-of-a-kind on top of the pile
    let pileClearedByQuads = false;
    if (room.pile.length >= 4) {
      const lastFour = room.pile.slice(-4);
      if (lastFour.every(c => c.value === lastFour[0].value)) {
        room.discard = room.pile.splice(0);
        io.to(roomId).emit("pile_cleared");
        pileClearedByQuads = true;
      }
    }

    // Determine the last relevant card (ignoring 3s)
    const lastRelevant = [...room.pile].reverse().find(c => c.value !== "3");
    if (!tenPlayed && !pileClearedByQuads) {
      if (jumpInWithFour) {
        // Set turn to the player who played the 4(s), then advance as normal
        room.turn = room.players.indexOf(userId);
      }
      if (lastRelevant && lastRelevant.value === "8") {
        room.turn = (room.turn + 2) % 2;
      } else {
        room.turn = (room.turn + 1) % 2;
      }
    }

    // Draw up to 3 cards if still in hand phase
    if (playFrom === "hand") {
      while (playerHand.hand.length < 3 && room.deck.length > 0) {
        playerHand.hand.push(room.deck.pop());
      }
    }

    if (
      playerHand.hand.length === 0 &&
      playerHand.faceUp.length === 0 &&
      playerHand.faceDown.length === 0
    ) {
      io.to(roomId).emit("game_over", userId);
      return;
    }

    io.to(roomId).emit("card_played", {
      cards,
      userId,
      pile: room.pile,
      hand: playerHand.hand,
      faceUp: playerHand.faceUp,
      deckCount: room.deck.length
    });
    // After every play, before emitting your_turn, remove quads and notify
    removeQuadsAndNotify(roomId, room.players[room.turn]);
    io.to(room.players[room.turn]).emit("your_turn");
  });

  socket.on("pickup_pile", ({ roomId, userId }) => {
    const room = rooms[roomId];
    const playerHand = room.hands[userId];
    playerHand.hand.push(...room.pile);
    room.pile = [];
    io.to(roomId).emit("card_played", { cards: [], userId, pile: [], hand: playerHand.hand, deckCount: room.deck.length });
    room.turn = (room.turn + 1) % 2;
    io.to(room.players[room.turn]).emit("your_turn");
  });

  socket.on("play_facedown", ({ roomId, userId, index }) => {
    const room = rooms[roomId];
    if (room.phase !== "play") return;
    const playerHand = room.hands[userId];
    if (playerHand.hand.length === 0 && playerHand.faceUp.length === 0 && playerHand.faceDown.length > 0) {
      // Use the selected index from the client
      if (typeof index !== 'number' || index < 0 || index >= playerHand.faceDown.length) return;
      const card = playerHand.faceDown.splice(index, 1)[0];
      // Try to play it
      if (isValidPlay(room.pile, [card])) {
        room.pile.push(card);
        io.to(roomId).emit("card_played", {
          cards: [card],
          userId,
          pile: room.pile,
          hand: playerHand.hand,
          faceUp: playerHand.faceUp,
          deckCount: room.deck.length,
          revealed: card
        });
        // Check for pile clear (10 or quads)
        let tenPlayed = false;
        if (card.value === "10") {
          room.discard = room.pile.splice(0);
          io.to(roomId).emit("pile_cleared");
          tenPlayed = true;
        }
        let pileClearedByQuads = false;
        if (room.pile.length >= 4) {
          const lastFour = room.pile.slice(-4);
          if (lastFour.every(c => c.value === lastFour[0].value)) {
            room.discard = room.pile.splice(0);
            io.to(roomId).emit("pile_cleared");
            pileClearedByQuads = true;
          }
        }
        // Determine the last relevant card (ignoring 3s)
        const lastRelevant = [...room.pile].reverse().find(c => c.value !== "3");
        if (!tenPlayed && !pileClearedByQuads) {
          if (lastRelevant && lastRelevant.value === "8") {
            room.turn = (room.turn + 2) % 2;
          } else {
            room.turn = (room.turn + 1) % 2;
          }
        }
      } else {
        // Invalid: pick up pile and the card
        playerHand.hand.push(card, ...room.pile);
        room.pile = [];
        io.to(roomId).emit("card_played", {
          cards: [],
          userId,
          pile: [],
          hand: playerHand.hand,
          faceUp: playerHand.faceUp,
          deckCount: room.deck.length,
          revealed: card,
          pickedUp: true
        });
        room.turn = (room.turn + 1) % 2;
      }
      // Remove quads after faceDown play
      removeQuadsAndNotify(roomId, room.players[room.turn]);
      io.to(room.players[room.turn]).emit("your_turn");
    }
  });

  socket.on("select_player", ({ roomId, userId, playerName }) => {
    playerNames[userId] = playerName;
    io.to(roomId).emit("players_update", rooms[roomId]?.players.length || 0);
    io.emit("scores_update", scores);
  });

  socket.on("game_over", (winnerId) => {
    const winnerName = playerNames[winnerId];
    if (winnerName && scores[winnerName] !== undefined) {
      scores[winnerName]++;
      saveScores();
    }
    io.emit("scores_update", scores);
    io.to(Object.keys(rooms)).emit("game_over", { winnerId, winnerName, scores });
  });

  socket.on("disconnect_all", ({ roomId }) => {
    console.log("Disconnecting all players from room: " + roomId);
    const room = rooms[roomId];
    if (room) {
      // Disconnect all players in the room
      room.players.forEach(playerId => {
        io.to(playerId).emit("force_disconnect", "Alle Spieler wurden getrennt");
        io.sockets.sockets.get(playerId)?.disconnect();
      });
      
      // Reset room state
      rooms[roomId] = {
        players: [],
        ready: [],
        deck: [],
        hands: {},
        pile: [],
        turn: 0,
        discard: [],
        log: []
      };
      
      io.to(roomId).emit("players_update", 0);
    }
  });

  socket.on("disconnect_all", ({ roomId }) => {
    console.log("Disconnecting all players from room: " + roomId);
    const room = rooms[roomId];
    if (room) {
      // Disconnect all players in the room
      room.players.forEach(playerId => {
        io.to(playerId).emit("force_disconnect", "Alle Spieler wurden getrennt");
        io.sockets.sockets.get(playerId)?.disconnect();
      });
      
      // Reset room state
      rooms[roomId] = {
        players: [],
        ready: [],
        deck: [],
        hands: {},
        pile: [],
        turn: 0,
        discard: [],
        log: []
      };
      
      io.to(roomId).emit("players_update", 0);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter((id) => id !== socket.id);
      rooms[roomId].ready = rooms[roomId].ready.filter((id) => id !== socket.id);
      // Clean up room if empty
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

// Start server immediately, then connect to database
server.listen(PORT, () => {
  console.log("Server listening on port " + PORT);
  console.log("Health check available at: http://localhost:" + PORT + "/ping");
  console.log("CORS configured to allow all origins");
  
  // Connect to database after server starts
  connectDB().then(() => {
    console.log("Database connected successfully");
    return loadScores();
  }).then(() => {
    console.log("Scores loaded successfully");
  }).catch((error) => {
    console.error("Database connection failed:", error);
    console.log("Server will continue without database connection");
  });
});
