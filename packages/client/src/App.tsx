import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { RoomView } from '../../server/src/room.js';
import { PlayerAction } from '@soha/core';
import { Lobby } from './components/Lobby.js';
import { Table } from './components/Table.js';

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('soha_name') || `赌侠${Math.floor(Math.random() * 900 + 100)}`;
  });
  const [playerId, setPlayerId] = useState<string>(() => {
    const existing = localStorage.getItem('soha_pid');
    if (existing) return existing;
    const newId = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('soha_pid', newId);
    return newId;
  });

  const [roomView, setRoomView] = useState<RoomView | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Save nickname changes
  const handleNameChange = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('soha_name', name);
  };

  // Initialize socket
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('room_state', (view: RoomView) => {
      setRoomView(view);
      setIsConnecting(false);
      setErrorMessage('');
    });

    newSocket.on('error_msg', ({ message }: { message: string }) => {
      setErrorMessage(message);
      setIsConnecting(false);
      setTimeout(() => setErrorMessage(''), 4000);
    });

    // Check URL params for ?room=XXXXXX
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoom = urlParams.get('room');
    if (urlRoom && newSocket) {
      newSocket.emit('join_room', {
        roomId: urlRoom,
        playerName,
        playerId,
      });
    }

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleCreateRoom = (ante: number) => {
    if (!socket) return;
    setIsConnecting(true);
    socket.emit(
      'create_room',
      { playerName, ante },
      (res: { success: boolean; roomId: string; playerId: string }) => {
        setIsConnecting(false);
        if (res.success) {
          setPlayerId(res.playerId);
          localStorage.setItem('soha_pid', res.playerId);
          window.history.replaceState(null, '', `?room=${res.roomId}`);
        }
      }
    );
  };

  const handleJoinRoom = (roomId: string) => {
    if (!socket) return;
    setIsConnecting(true);
    socket.emit(
      'join_room',
      { roomId, playerName, playerId },
      (res: { success: boolean; error?: string; roomId?: string; playerId?: string }) => {
        setIsConnecting(false);
        if (!res.success) {
          setErrorMessage(res.error || '加入房间失败');
          setTimeout(() => setErrorMessage(''), 4000);
        } else if (res.roomId) {
          window.history.replaceState(null, '', `?room=${res.roomId}`);
        }
      }
    );
  };

  const handleLeaveRoom = () => {
    setRoomView(null);
    window.history.replaceState(null, '', window.location.pathname);
    if (socket) {
      socket.disconnect();
      socket.connect();
    }
  };

  const handleAction = (action: PlayerAction) => {
    if (!socket) return;
    socket.emit('player_action', action);
  };

  const handleToggleReady = (ready: boolean) => {
    if (!socket) return;
    socket.emit('toggle_ready', { isReady: ready });
  };

  const handleAddBot = () => {
    if (!socket) return;
    socket.emit('add_bot');
  };

  const handleRemoveBot = (botId: string) => {
    if (!socket) return;
    socket.emit('remove_bot', { botId });
  };

  const handleResetChips = () => {
    if (!socket) return;
    socket.emit('reset_chips');
  };

  const handleStartGame = () => {
    if (!socket) return;
    socket.emit('start_game');
  };

  return (
    <>
      <div className="app-content">
        {roomView ? (
          <Table
            roomView={roomView}
            myPlayerId={playerId}
            onAction={handleAction}
            onToggleReady={handleToggleReady}
            onAddBot={handleAddBot}
            onRemoveBot={handleRemoveBot}
            onResetChips={handleResetChips}
            onStartGame={handleStartGame}
            onLeaveRoom={handleLeaveRoom}
          />
        ) : (
          <Lobby
            playerName={playerName}
            onNameChange={handleNameChange}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            isConnecting={isConnecting}
            error={errorMessage}
          />
        )}
      </div>
      <div className="rotate-notice" role="status" aria-live="polite">
        <span className="rotate-notice-icon" aria-hidden="true">↻</span>
        <h1>请将手机横过来</h1>
        <p>横屏后即可进入港式五张梭哈</p>
      </div>
    </>
  );
};
