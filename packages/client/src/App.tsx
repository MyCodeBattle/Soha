import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { RoomView } from '../../server/src/room.js';
import { PlayerAction } from '@soha/core';
import { Lobby } from './components/Lobby.js';
import { Table } from './components/Table.js';
import type { RoomEntryResult } from '../../server/src/room-registry.js';
import { buildInviteUrl } from './utils/invitation.js';
import { generateRandomNickname } from './utils/nickname.js';

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerName, setPlayerName] = useState<string>(() => {
    const existing = localStorage.getItem('soha_name');
    if (existing) return existing;
    const name = generateRandomNickname();
    localStorage.setItem('soha_name', name);
    return name;
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

  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(() => setErrorMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [errorMessage]);

  const finishRoomEntry = (res: RoomEntryResult) => {
    setIsConnecting(false);
    if (!res.success) {
      setRoomView(null);
      setErrorMessage(res.error);
      return;
    }
    setErrorMessage('');
    setPlayerId(res.playerId);
    localStorage.setItem('soha_pid', res.playerId);
    window.history.replaceState(null, '', buildInviteUrl(res));
  };

  const entryCallback = (err: Error | null, res?: RoomEntryResult) => {
    finishRoomEntry(err || !res
      ? { success: false, error: '连接房间超时，请稍后重试' }
      : res);
  };

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
    });

    // Rejoin the same room instance on initial connection and reconnection.
    newSocket.on('connect', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoom = urlParams.get('room');
      const inviteToken = urlParams.get('invite');
      if (urlRoom === null && inviteToken === null) return;
      if (!urlRoom || !/^[1-9]\d$/.test(urlRoom) || !inviteToken) {
        finishRoomEntry({ success: false, error: '邀请链接无效' });
        return;
      }
      setErrorMessage('');
      setIsConnecting(true);
      newSocket.timeout(10000).emit('join_room', {
        roomId: urlRoom,
        inviteToken,
        playerName: localStorage.getItem('soha_name') || playerName,
        playerId: localStorage.getItem('soha_pid') || playerId,
      }, entryCallback);
    });

    newSocket.on('connect_error', () => {
      setIsConnecting(false);
      setErrorMessage('无法连接服务器，请稍后重试');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleCreateRoom = (ante: number) => {
    if (!socket?.connected) {
      setErrorMessage('尚未连接服务器，请稍后再试');
      return;
    }
    setErrorMessage('');
    setIsConnecting(true);
    socket.timeout(10000).emit(
      'create_room',
      { playerName, ante },
      entryCallback
    );
  };

  const handleJoinRoom = (roomId: string) => {
    if (!socket?.connected) {
      setErrorMessage('尚未连接服务器，请稍后再试');
      return;
    }
    setErrorMessage('');
    setIsConnecting(true);
    socket.timeout(10000).emit(
      'join_room',
      { roomId, playerName, playerId },
      entryCallback
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

  return roomView ? (
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
      onRandomName={() => handleNameChange(generateRandomNickname(playerName))}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      isConnecting={isConnecting}
      error={errorMessage}
    />
  );
};
