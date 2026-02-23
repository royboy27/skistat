const crypto = require('crypto');

// Generate a unique invite code like "SKI-ROY-4827"
function generateInviteCode() {
  const words = [
    'ACE', 'ALP', 'ARC', 'ASH', 'AXE', 'BAY', 'BIG', 'BOW', 'CAP', 'COG',
    'CUB', 'DAM', 'DEN', 'DIP', 'DOC', 'ELK', 'ELM', 'ERA', 'EVE', 'FAR',
    'FIG', 'FIN', 'FIR', 'FLY', 'FOG', 'FOX', 'FUR', 'GAP', 'GEM', 'GLO',
    'HAM', 'HEX', 'HOP', 'HUB', 'ICE', 'INK', 'INN', 'IVY', 'JAB', 'JAM',
    'JAW', 'JAY', 'JET', 'JIG', 'JOY', 'KEY', 'KIT', 'LAP', 'LOG', 'LUX',
    'MAP', 'MAX', 'MIX', 'MOB', 'MUD', 'NET', 'NOD', 'NUT', 'OAK', 'OAR',
    'ORB', 'OWL', 'PAD', 'PEA', 'PIN', 'PLY', 'POD', 'POP', 'PRO', 'PUB',
    'RAY', 'RED', 'RIB', 'RIM', 'ROD', 'ROT', 'ROW', 'ROY', 'RUG', 'RUN',
    'SAP', 'SKI', 'SKY', 'SLY', 'SPA', 'SPY', 'SUM', 'SUN', 'TAB', 'TAN',
    'TAP', 'TIN', 'TIP', 'TOP', 'TOW', 'TUG', 'URN', 'VAN', 'VET', 'VOW',
    'WAX', 'WEB', 'WIG', 'WIN', 'WIT', 'YAK', 'YAM', 'YEW', 'ZAP', 'ZEN',
  ];
  
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 4 digits
  return `SKI-${word}-${num}`;
}

// Generate a secure random token
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Sanitize display name
function sanitizeDisplayName(name) {
  if (!name) return 'Skier';
  return name.trim().substring(0, 100).replace(/[<>]/g, '');
}

// Format error response
function errorResponse(res, status, message, details = null) {
  const response = { error: true, message };
  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }
  return res.status(status).json(response);
}

// Success response
function successResponse(res, data, status = 200) {
  return res.status(status).json({ error: false, ...data });
}

module.exports = {
  generateInviteCode,
  generateToken,
  sanitizeDisplayName,
  errorResponse,
  successResponse,
};
