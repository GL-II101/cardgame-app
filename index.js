// ================== server/index.js ==================
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;

let rooms = {};

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

io.on("connection", (socket) => {
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
        log: [],
        phase: "prepare",
        openReady: []
      };
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
      room.deck = shuffleDeck();
      room.players.forEach((id) => {
        room.hands[id] = {
          hand: room.deck.splice(0, 6),
          faceDown: room.deck.splice(0, 3),
          faceUp: [],
          mode: "prepare"
        };
      });
      io.to(roomId).emit("select_open_cards", room.hands);
    }
  });

  socket.on("set_open_cards", ({ roomId, userId, selected }) => {
    const room = rooms[roomId];
    const playerHand = room.hands[userId];
    if (!playerHand || playerHand.mode !== "prepare") return;

    const selectedCards = playerHand.hand.filter(card =>
      selected.some(sel => sel.value === card.value && sel.suit === card.suit)
    );

    if (selectedCards.length !== 3) {
      io.to(userId).emit("invalid_selection", "Bitte genau 3 Karten wählen");
      return;
    }

    playerHand.faceUp = selectedCards;
    playerHand.hand = playerHand.hand.filter(card =>
      !selected.some(sel => sel.value === card.value && sel.suit === card.suit)
    );
    playerHand.mode = "ready";

    room.openReady.push(userId);

    io.to(userId).emit("select_open_cards", room.hands);

    if (room.openReady.length === 2) {
      room.phase = "play";
      room.players.forEach(pid => {
        room.hands[pid].mode = "hand";
      });
      io.to(roomId).emit("start_game", room.hands);
      io.to(room.players[room.turn]).emit("your_turn");
    }
  });

  socket.on("play_card", ({ roomId, card, userId }) => {
    const room = rooms[roomId];
    if (room.phase !== "play") return;

    const current = room.players[room.turn];
    if (userId !== current) return;

    const playerHand = room.hands[userId];
    const selectedCards = playerHand.hand.filter(c => c.value === card.value);

    if (!isValidPlay(room.pile, selectedCards)) {
      io.to(userId).emit("invalid_move");
      return;
    }

    selectedCards.forEach(c => {
      room.pile.push(c);
      playerHand.hand = playerHand.hand.filter(
        (h) => !(h.value === c.value && h.suit === c.suit)
      );
    });

    if (card.value === "10") {
      room.discard = room.pile.splice(0);
      io.to(roomId).emit("pile_cleared");
    }

    if (card.value === "8") {
      room.turn = (room.turn + 2) % 2;
    } else {
      room.turn = (room.turn + 1) % 2;
    }

    while (playerHand.hand.length < 3 && room.deck.length > 0) {
      playerHand.hand.push(room.deck.pop());
    }

    if (
      playerHand.hand.length === 0 &&
      playerHand.faceUp.length === 0 &&
      playerHand.faceDown.length === 0
    ) {
      io.to(roomId).emit("game_over", userId);
      return;
    }

    io.to(roomId).emit("card_played", { card, userId, pile: room.pile });
    io.to(room.players[room.turn]).emit("your_turn");
  });

  socket.on("pickup_pile", ({ roomId, userId }) => {
    const room = rooms[roomId];
    const playerHand = room.hands[userId];
    playerHand.hand.push(...room.pile);
    room.pile = [];
    io.to(roomId).emit("card_played", { card: null, userId, pile: [] });
    room.turn = (room.turn + 1) % 2;
    io.to(room.players[room.turn]).emit("your_turn");
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter((id) => id !== socket.id);
      rooms[roomId].ready = rooms[roomId].ready.filter((id) => id !== socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log("Server listening on http://localhost:" + PORT);
});
