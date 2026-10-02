/**
 * Room tags: a QR sticker fixed inside each hostel room. A student scans it to prove they are
 * physically in their room when they check in.
 *
 * A tag looks like:  NR1.<base64url("hostel\nroom")>.<ed25519 signature>
 *
 * Tags are signed with the same university key as passes, so nobody can print a tag for a room
 * themselves. A tag on its own is not enough to check in (it could be photographed); it only
 * counts together with the student's registered phone and the hostel network.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { fromBase64Url, toBase64Url } from "./pass";

const TAG_PREFIX = "NR1";
const encoder = new TextEncoder();

export interface RoomTag {
  hostel: string;
  room: string;
}

export function signRoomTag(hostel: string, room: string, secretKey: Uint8Array): string {
  const message = `${TAG_PREFIX}.${toBase64Url(encoder.encode(`${hostel}\n${room}`))}`;
  return `${message}.${toBase64Url(ed25519.sign(encoder.encode(message), secretKey))}`;
}

/** Returns the room a tag belongs to, or null if it isn't a genuine NightPass tag. */
export function readRoomTag(raw: string, publicKey: Uint8Array): RoomTag | null {
  const parts = raw.trim().split(".");
  if (parts.length !== 3 || parts[0] !== TAG_PREFIX) return null;
  try {
    const signature = fromBase64Url(parts[2]);
    if (signature.length !== 64) return null;
    if (!ed25519.verify(signature, encoder.encode(`${parts[0]}.${parts[1]}`), publicKey)) return null;
    const [hostel, room, ...rest] = new TextDecoder().decode(fromBase64Url(parts[1])).split("\n");
    if (!hostel || !room || rest.length) return null;
    return { hostel, room };
  } catch {
    return null;
  }
}
