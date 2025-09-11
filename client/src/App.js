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
//test
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
  const [showAllPileCards, setShowAllPileCards] = useState(false);
  const [opponents, setOpponents] = useState({});
  const [removedCards, setRemovedCards] = useState([]);

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

    socket.on("start_game", ({ hands, publicState }) => {
      const me = socket.id;
      setHand(hands[me].hand);
      setFaceDown(hands[me].faceDown);
      setFaceUp(hands[me].faceUp);
      setSelectingOpen(false);
      setMessage("Spiel gestartet.");
      if (publicState) setOpponents(publicState);
    });

    socket.on("your_turn", () => {
      setTurn(true);
      setMessage("Du bist am Zug!");
    });

    socket.on("card_played", ({ cards, userId, pile, hand, faceUp, deckCount, revealed, pickedUp, faceDown, publicState }) => {
      setPile(pile);
      // no-op
      setSelectedPlayCards([]);
      if (userId === socket.id && hand) {
        setHand(hand);
      }
      if (userId === socket.id && faceUp) {
        setFaceUp(faceUp);
      }
      if (userId === socket.id && Array.isArray(faceDown)) {
        setFaceDown(faceDown);
        setSelectedFaceDownIndex(null);
      }
      if (publicState) setOpponents(publicState);
      if (revealed) {
        setMessage(`Du hast eine verdeckte Karte aufgedeckt: ${revealed.value}${revealed.suit}${pickedUp ? ' (ungültig, Stapel aufgenommen!)' : ''}`);
      }
      if (userId !== socket.id && cards && cards.length === 0) {
        setMessage("Stapel wurde aufgenommen!");
      } else if (userId !== socket.id && cards && cards.length > 0) {
        setMessage(`Gegner hat ${cards.map(c => c.value + c.suit).join(", ") } gespielt.`);
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

    socket.on("public_state", (state) => {
      setOpponents(state || {});
    });

    socket.on("discard_update", (cards) => {
      setRemovedCards(cards || []);
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
    // Allow playing 4(s) if the pile is empty, even if it's not your turn
    const isJumpInFour = pile.length === 0 && selectedPlayCards.length > 0 && selectedPlayCards.every(c => c.value === "4");
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

  const requestRemovedCards = () => {
    socket.emit("get_discard", { roomId: room });
  };

  return (
    <div className="App">
      <div className="game-container">
        
        
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
              <h3 className="font-semibold">Verdeckte & Offene Karten</h3>
              <div style={{
                display: 'flex', 
                flexDirection: 'row', 
                gap: '8px', 
                overflowX: 'auto', 
                paddingBottom: '8px', 
                flexWrap: 'nowrap',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '140px',
                width: '100%'
              }}>
                {/* Verdeckte Karten */}
                {faceDown.map((_, index) => (
                  <img 
                    key={`down-${index}`} 
                    src="/cards/Backsite.png" 
                    alt="Verdeckte Karte" 
                    style={{width: 90, height: 120, flexShrink: 0}} 
                  />
                ))}
                
                {/* Offene Karten */}
                {faceUp.map((card, index) => (
                  <img 
                    key={`up-${index}`} 
                    src={cardToImg(card)} 
                    alt={card.value + card.suit} 
                    style={{width: 90, height: 120, flexShrink: 0}} 
                    onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} 
                  />
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="font-semibold">Gegner: Offene & Verdeckte Karten</h3>
              <div style={{ display:'flex', gap: '8px', justifyContent:'center', alignItems:'center', flexWrap:'nowrap' }}>
                {Object.entries(opponents).filter(([pid]) => pid !== socket.id).map(([pid, info]) => (
                  <div key={pid} style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                    {/* Verdeckte Karten als Rückseiten mit Anzahl begrenzt */}
                    <div style={{ display:'flex', gap:'4px', flexWrap:'nowrap' }}>
                      {Array.from({ length: Math.min(info.faceDownCount || 0, 3) }).map((_, i) => (
                        <img key={`opp-down-${i}`} src="/cards/Backsite.png" alt="Verdeckte Karte" style={{ width: 50, height: 70 }} />
                      ))}
                      {info.faceDownCount > 3 && (
                        <span style={{ fontSize: 12, marginLeft: 4 }}>+{info.faceDownCount - 3}</span>
                      )}
                    </div>
                    {/* Offene Karten des Gegners */}
                    <div style={{ display:'flex', gap:'4px', flexWrap:'nowrap' }}>
                      {(info.faceUp || []).slice(0, 5).map((card, i) => (
                        <img key={`opp-up-${i}`} src={cardToImg(card)} alt={card.value + card.suit} style={{ width: 50, height: 70 }} onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} />
                      ))}
                      {(info.faceUp || []).length > 5 && (
                        <span style={{ fontSize: 12, marginLeft: 4 }}>+{(info.faceUp || []).length - 5}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="font-semibold">Aktueller Stapel ({pile.length} Karten)</h3>
              <div className="flex gap-4">
                {/* Linker Stapel - Bisherige Karten */}
                <div className="flex-1">
                  <div className="bg-gray-200 p-4 rounded-lg">
                    {pile.length > 1 ? (
                      <>
                        <div className="text-center mb-2">
                          <div className="text-lg font-bold">{pile[pile.length - 2]?.value || ''}</div>
                          <div className="text-sm text-gray-600">
                            {pile.filter((card, index) => index < pile.length - 1 && card.value === pile[pile.length - 2]?.value).length} Karten
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <img 
                            src={cardToImg(pile[pile.length - 2])} 
                            alt={pile[pile.length - 2]?.value + pile[pile.length - 2]?.suit} 
                            style={{width: 90, height: 120}} 
                            onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=pile[pile.length - 2]?.value+pile[pile.length - 2]?.suit;}} 
                          />
                        </div>
                        <button 
                          onClick={() => setShowAllPileCards(!showAllPileCards)}
                          className="btn btn-primary w-full mt-2"
                        >
                          Schau dir alle Karten an
                        </button>
                        {showAllPileCards && (
                          <div className="mt-3 overflow-x-auto pb-2">
                            <div style={{display: 'flex', flexDirection: 'row', gap: '8px', flexWrap: 'nowrap'}}>
                              {pile.slice(0, -1).map((card, index) => (
                                <img 
                                  key={index} 
                                  src={cardToImg(card)} 
                                  alt={card.value + card.suit} 
                                  style={{width: 90, height: 120, flexShrink: 0}} 
                                  onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} 
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center text-gray-500">
                        <div className="text-lg">Keine Karten</div>
                        <div className="text-sm">im Stapel</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rechter Stapel - Aktuelle Karte */}
                <div className="flex-1">
                  <div className="bg-blue-200 p-4 rounded-lg border-2 border-green-500">
                    {pile.length > 0 ? (
                      <>
                        <div className="text-center mb-2">
                          <div className="text-lg font-bold">{pile[pile.length - 1]?.value || ''}</div>
                          <div className="text-sm text-gray-600">
                            {pile.filter(card => card.value === pile[pile.length - 1]?.value).length} Karten
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <img 
                            src={cardToImg(pile[pile.length - 1])} 
                            alt={pile[pile.length - 1]?.value + pile[pile.length - 1]?.suit} 
                            style={{width: 90, height: 120}} 
                            onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=pile[pile.length - 1]?.value+pile[pile.length - 1]?.suit;}} 
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-gray-500">
                        <div className="text-lg">Stapel</div>
                        <div className="text-sm">ist leer</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-600">Karten im Nachziehstapel: {deckCount}</div>
              <div className="mt-2">
                <button onClick={requestRemovedCards} className="btn btn-secondary">Entfernte Karten anzeigen</button>
                {removedCards && removedCards.length > 0 && (
                  <div className="mt-2" style={{ display:'flex', gap:'6px', flexWrap:'wrap', justifyContent:'center' }}>
                    {removedCards.map((card, idx) => (
                      <img key={`discard-${idx}`} src={cardToImg(card)} alt={card.value + card.suit} style={{ width: 50, height: 70 }} onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="font-semibold">Deine Handkarten</h3>
              <div style={{
                display: 'flex', 
                flexDirection: 'row', 
                gap: '8px', 
                overflowX: 'auto', 
                paddingBottom: '8px', 
                flexWrap: 'nowrap',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '140px',
                width: '100%'
              }}>
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
                        background: 'transparent',
                        border: isSelected ? '2px solid green' : 'none',
                        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                        zIndex: isSelected ? 10 : 1,
                        padding: 0,
                        borderRadius: '6px',
                        transition: 'all 0.15s',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <img src={cardToImg(card)} alt={card.value + card.suit} style={{width: 90, height: 120}} onError={e => {e.target.onerror=null; e.target.style.display='none'; e.target.parentNode.textContent=card.value+card.suit;}} />
                    </button>
                  );
                })}
              </div>
              {hand.length === 0 && faceUp.length === 0 && faceDown.length > 0 && turn && (
                <div className="flex flex-col items-start mt-4">
                  <div style={{display: 'flex', flexDirection: 'row', gap: '8px', marginBottom: '8px', overflowX: 'auto', paddingBottom: '8px', flexWrap: 'nowrap'}}>
                    {faceDown.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedFaceDownIndex(idx)}
                        style={{
                          width: 90,
                          height: 120,
                          background: 'transparent',
                          border: selectedFaceDownIndex === idx ? '2px solid green' : 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          boxShadow: selectedFaceDownIndex === idx ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                          transition: 'all 0.15s',
                          flexShrink: 0,
                          padding: 0,
                        }}
                      >
                        <img 
                          src="/cards/Backsite.png" 
                          alt="Verdeckte Karte" 
                          style={{width: 90, height: 120}} 
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={playFaceDown}
                    className="btn btn-primary"
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
                className="btn btn-success mt-4"
                disabled={selectedOpenCards.length !== 3}
              >
                Offene Karten bestätigen
              </button>
            ) : (
              <div className="flex gap-4 mt-4">
                <button
                  onClick={confirmPlay}
                  className="btn btn-primary"
                  disabled={
                    !(turn || (pile.length === 0 && selectedPlayCards.length > 0 && selectedPlayCards.every(c => c.value === "4"))) ||
                    selectedPlayCards.length === 0
                  }
                >
                  Ausgewählte Karten spielen
                </button>
                <button
                  onClick={pickUpPile}
                  className="btn btn-danger"
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