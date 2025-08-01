// ================== client/src/App.js ==================
import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import './App.css';

// Use environment variable for socket URL, fallback to localhost for development
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";
console.log("Connecting to socket URL:", SOCKET_URL);
const socket = io(SOCKET_URL);

// Add connection debugging
socket.on("connect", () => {
  console.log("Connected to server with ID:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});

// Helper to sort cards by value and suit
const cardOrder = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13,A:14};
function sortCards(cards) {
  return [...cards].sort((a, b) => {
    if (cardOrder[a.value] !== cardOrder[b.value]) return cardOrder[a.value] - cardOrder[b.value];
    return a.suit.localeCompare(b.suit);
  });
}

// Helper to get image filename for a card
function cardToImg(card) {
  if (!card) return null;
  const suitMap = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  return `/cards/${card.value}_${suitMap[card.suit]}.png`;
}

function App() {
  const [room, setRoom] = useState("room1");
  const [players, setPlayers] = useState(0);
  const [hand, setHand] = useState([]);
  const [faceDown, setFaceDown] = useState([]);
  const [faceUp, setFaceUp] = useState([]);
  const [pile, setPile] = useState([]);
  const [turn, setTurn] = useState(false);
  const [message, setMessage] = useState("");
  const [gameOver, setGameOver] = useState(null);
  const [selectingOpen, setSelectingOpen] = useState(false);
  const [selectedOpenCards, setSelectedOpenCards] = useState([]);
  const [selectedPlayCards, setSelectedPlayCards] = useState([]);
  const [pileCount, setPileCount] = useState(0);
  const [deckCount, setDeckCount] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [scores, setScores] = useState({ Jule: 0, Finn: 0 });
  const [selectedFaceDownIndex, setSelectedFaceDownIndex] = useState(null);

  useEffect(() => {
    socket.emit("join_room", room);

    socket.on("players_update", (count) => {
      setPlayers(count);
    });

    socket.on("scores_update", (newScores) => {
      setScores(newScores);
    });

    socket.on("select_open_cards", (hands) => {
      const me = socket.id;
      setHand(hands[me].hand);
      setFaceDown(hands[me].faceDown);
      setSelectingOpen(true);
      setMessage("Wähle 3 offene Karten aus deiner Hand.");
    });

    socket.on("start_game", (hands) => {
      const me = socket.id;
      setHand(hands[me].hand);
      setFaceDown(hands[me].faceDown);
      setFaceUp(hands[me].faceUp);
      setSelectingOpen(false);
      setMessage("Spiel gestartet. Warte auf den Zug des anderen Spielers");
    });

    socket.on("your_turn", () => {
      setTurn(true);
      setMessage("Du bist am Zug!");
    });

    socket.on("card_played", ({ cards, userId, pile, hand, faceUp, deckCount, revealed, pickedUp }) => {
      setPile(pile);
      setSelectedPlayCards([]);
      if (userId === socket.id && hand) {
        setHand(hand);
      }
      if (userId === socket.id && faceUp) {
        setFaceUp(faceUp);
      }
      if (revealed) {
        setMessage(`Du hast eine verdeckte Karte aufgedeckt: ${revealed.value}${revealed.suit}${pickedUp ? ' (ungültig, Stapel aufgenommen!)' : ''}`);
      }
      if (userId !== socket.id && cards && cards.length === 0) {
        setMessage("Stapel wurde aufgenommen!");
      } else if (userId !== socket.id && cards && cards.length > 0) {
        setMessage(`Gegner hat ${cards.map(c => c.value + c.suit).join(", ")} gespielt.`);
      }
      setDeckCount(deckCount);
    });

    socket.on("pile_cleared", () => {
      setPile([]);
      setMessage("Stapel wurde geleert!");
    });

    socket.on("invalid_move", () => {
      setMessage("Ungültiger Zug!");
      setTurn(true);
    });

    socket.on("invalid_selection", (msg) => {
      setMessage(msg);
    });

    socket.on("game_over", ({ winnerId, winnerName, scores: updatedScores }) => {
      setGameOver(winnerId);
      setScores(updatedScores);
      setMessage(winnerId === socket.id ? "Du hast gewonnen! 🎉" : "Du hast verloren 😢");
    });

    socket.on("quads_removed", (removed) => {
      setMessage(`Vierling${removed.length > 1 ? 'e' : ''} ${removed.join(', ')} wurde${removed.length > 1 ? 'n' : ''} aus dem Spiel entfernt!`);
    });

    socket.on("room_full", (message) => {
      setMessage(message);
    });

    socket.on("force_disconnect", (message) => {
      setMessage(message);
      // Reload the page after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    });
  }, [room]);

  const selectPlayer = (name) => {
    setPlayerName(name);
    socket.emit("select_player", { roomId: room, userId: socket.id, playerName: name });
    socket.emit("ready", room); // Automatically ready after selecting player
  };

  const toggleSelect = (card, type) => {
    if (type === "open") {
      const exists = selectedOpenCards.find(
        (c) => c.value === card.value && c.suit === card.suit
      );
      if (exists) {
        setSelectedOpenCards(selectedOpenCards.filter(
          (c) => !(c.value === card.value && c.suit === card.suit)
        ));
      } else {
        setSelectedOpenCards([...selectedOpenCards, card]);
      }
    } else {
      const exists = selectedPlayCards.find(
        (c) => c.value === card.value && c.suit === card.suit
      );
      if (exists) {
        setSelectedPlayCards(selectedPlayCards.filter(
          (c) => !(c.value === card.value && c.suit === card.suit)
        ));
      } else {
        setSelectedPlayCards([...selectedPlayCards, card]);
      }
    }
  };

  const confirmOpenCards = () => {
    if (selectedOpenCards.length !== 3) {
      setMessage("Du musst genau 3 Karten auswählen.");
      return;
    }
    socket.emit("set_open_cards", {
      roomId: room,
      userId: socket.id,
      selected: selectedOpenCards
    });
  };

  const confirmPlay = () => {
    // Allow playing a 4 if the pile is empty, even if it's not your turn
    const isJumpInFour = pile.length === 0 && selectedPlayCards.length === 1 && selectedPlayCards[0].value === "4";
    if ((!turn && !isJumpInFour) || selectingOpen || selectedPlayCards.length === 0) return;
    const baseCard = selectedPlayCards[0];
    if (selectedPlayCards.some(c => c.value !== baseCard.value)) {
      setMessage("Nur Karten mit gleichem Wert gleichzeitig spielen!");
      return;
    }
    console.log("Playing cards:", selectedPlayCards);
    socket.emit("play_card", { roomId: room, cards: selectedPlayCards, userId: socket.id });
    setTurn(false);
  };

  const pickUpPile = () => {
    socket.emit("pickup_pile", { roomId: room, userId: socket.id });
    setTurn(false);
  };

  const playFaceDown = () => {
    if (selectedFaceDownIndex === null) return;
    socket.emit("play_facedown", { roomId: room, userId: socket.id, index: selectedFaceDownIndex });
    setTurn(false);
    setSelectedFaceDownIndex(null);
  };

  return (
    <div className="App">
      <div className="game-container">
        <div className="score-panel">
          <div className="font-bold">Punktestand</div>
          <div>Jule: {scores.Jule}</div>
          <div>Finn: {scores.Finn}</div>
          <button 
            onClick={() => socket.emit("disconnect_all", { roomId: room })}
            className="btn btn-danger mt-2"
          >
            Alle Spieler trennen
          </button>
        </div>
        
        <h1 className="game-title">Kartenspiel</h1>
        <p className="message">Spieler im Raum: {players}</p>
        
        {!playerName || players < 2 ? (
          <div className="flex flex-col items-center justify-center">
            <h2 className="section-title">Wer bist du?</h2>
            <div className="button-group">
              <button onClick={() => selectPlayer("Jule")} className="btn btn-primary">Jule</button>
              <button onClick={() => selectPlayer("Finn")} className="btn btn-success">Finn</button>
            </div>
            {players < 2 && <p className="message">Warte auf zweiten Spieler ...</p>}
          </div>
        ) : (
          <>
            <h2 className="mt-4 text-lg">Nachrichten: {message}</h2>

            <div className="mt-4">
              <h3 className="font-semibold">Verdeckte Karten</h3>
              <div className="flex gap-2">
                {faceDown.map((_, index) => (
                  <div key={index} className="border p-2 bg-gray-300">🂠</div>
                ))}
              </div>
            </div>
          
            {faceUp.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold">Offene Karten</h3>
                <div className="flex gap-2">
                  {faceUp.map((card, index) => (
                    <div key={index} className="border p-2 bg-yellow-200">
                      <img src={cardToImg(card)} alt={card.value + card.suit} style={{width: 90, height: 120}} onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <h3 className="font-semibold">Aktueller Stapel ({pile.length} Karten)</h3>
              <div className="flex gap-2 flex-row items-end" style={{ alignItems: 'flex-end', width: 'auto', flexWrap: 'nowrap', overflowX: 'auto' }}>
                {pile.map((card, index) => (
                  <div
                    key={index}
                    className="border bg-gray-200"
                    style={{
                      display: 'inline-block',
                      minWidth: 90,
                      maxWidth: 120,
                      textAlign: 'center',
                      padding: '8px',
                      margin: 0,
                      background: index === pile.length - 1 ? '#93c5fd' : '#e5e7eb',
                      border: index === pile.length - 1 ? '2px solid green' : '1px solid #ccc',
                      fontWeight: index === pile.length - 1 ? 'bold' : 'normal',
                      boxShadow: index === pile.length - 1 ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <img src={cardToImg(card)} alt={card.value + card.suit} style={{width: 90, height: 120}} onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} />
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm text-gray-600">Karten im Nachziehstapel: {deckCount}</div>
            </div>

            <div className="mt-4">
              <h3 className="font-semibold">Deine Handkarten</h3>
              <div className="flex gap-2 flex-wrap">
                {sortCards(hand.length > 0 ? hand : faceUp).map((card, index) => {
                  const isSelected = selectingOpen
                    ? selectedOpenCards.find(c => c.value === card.value && c.suit === card.suit)
                    : selectedPlayCards.find(c => c.value === card.value && c.suit === card.suit);
                  return (
                    <button
                      key={index}
                      onClick={() => toggleSelect(card, selectingOpen ? "open" : "play")}
                      disabled={selectingOpen ? false : (
                        hand.length === 0 ? false : hand.indexOf(card) === -1
                      ) || (!turn && !(pile.length === 0 && selectedPlayCards.length > 0 && selectedPlayCards.every(c => c.value === "4")))}
                      style={{
                        position: 'relative',
                        marginTop: isSelected ? '-20px' : '0',
                        background: isSelected ? '#93c5fd' : 'white', // light blue
                        border: isSelected ? '2px solid green' : '1px solid #ccc',
                        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                        zIndex: isSelected ? 10 : 1,
                        padding: '8px',
                        borderRadius: '6px',
                        transition: 'all 0.15s',
                        cursor: 'pointer',
                      }}
                    >
                      <img src={cardToImg(card)} alt={card.value + card.suit} style={{width: 90, height: 120}} onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} />
                    </button>
                  );
                })}
              </div>
              {hand.length === 0 && faceUp.length === 0 && faceDown.length > 0 && turn && (
                <div className="flex flex-col items-start mt-4">
                  <div className="flex gap-2 mb-2">
                    {faceDown.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedFaceDownIndex(idx)}
                        style={{
                          width: 90,
                          height: 120,
                          background: selectedFaceDownIndex === idx ? '#93c5fd' : '#e5e7eb',
                          border: selectedFaceDownIndex === idx ? '2px solid green' : '1px solid #ccc',
                          borderRadius: 6,
                          fontSize: 60,
                          cursor: 'pointer',
                          boxShadow: selectedFaceDownIndex === idx ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        🂠
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={playFaceDown}
                    className="bg-purple-600 text-white p-2 rounded"
                    disabled={selectedFaceDownIndex === null}
                  >
                    Karte aufdecken
                  </button>
                </div>
              )}
            </div>

            {selectingOpen ? (
              <button
                onClick={confirmOpenCards}
                className="mt-4 bg-green-500 text-white p-2 rounded"
                disabled={selectedOpenCards.length !== 3}
              >
                Offene Karten bestätigen
              </button>
            ) : (
              <div className="flex gap-4 mt-4">
                <button
                  onClick={confirmPlay}
                  className="bg-blue-600 text-white p-2 rounded"
                  disabled={
                    !(turn || (pile.length === 0 && selectedPlayCards.length > 0 && selectedPlayCards.every(c => c.value === "4"))) ||
                    selectedPlayCards.length === 0
                  }
                >
                  Ausgewählte Karten spielen
                </button>
                <button
                  onClick={pickUpPile}
                  className="bg-red-600 text-white p-2 rounded"
                  disabled={!turn || pile.length === 0}
                >
                  Stapel aufnehmen
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;