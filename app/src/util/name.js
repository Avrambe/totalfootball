// Display the player's last name (final whitespace-separated token). Single-word names pass through.
export const lastName = (n) => { const p = (n || "").split(" "); return p.length > 1 ? p[p.length - 1] : n; };
