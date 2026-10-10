export interface RoomInvitation {
  roomId: string;
  inviteToken: string;
}

export function buildInviteUrl(invitation: RoomInvitation): string {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('room', invitation.roomId);
  url.searchParams.set('invite', invitation.inviteToken);
  return url.toString();
}
