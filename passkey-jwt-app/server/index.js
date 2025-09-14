require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoUint8Array, isoBase64URL } = require('@simplewebauthn/server/helpers');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ORIGIN })); // Allow requests from our React app

// --- In-Memory "Database" ---
// !!WARNING!!: This is for demonstration purposes only.
// In a real application, you would use a proper database (e.g., PostgreSQL, MongoDB).
const users = {};

// --- Relying Party Info ---
const rpName = process.env.RP_NAME;
const rpID = process.env.RP_ID;
const origin = process.env.ORIGIN;

// 1. REGISTRATION - GENERATE CHALLENGE
app.post('/register-challenge', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (users[username]) {
    return res.status(400).json({ error: 'Username already taken' });
  }
  // Create a new user structure
  users[username] = {
    username,
    authenticators: [],
  };
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: isoUint8Array.fromUTF8String(username), // Convert to Uint8Array
    userName: username,
    attestationType: 'none',
    // Exclude credentials that have already been registered by this user
    excludeCredentials: users[username].authenticators.map(auth => ({
      id: auth.credentialID,
      type: 'public-key',
      transports: auth.transports,
    })),
  });
  // Store the challenge temporarily
  users[username].challenge = options.challenge;
  res.json(options);
});

// 2. REGISTRATION - VERIFY RESPONSE
app.post('/register-verify', async (req, res) => {
  const { username, response } = req.body;
  const user = users[username];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (verification.verified) {
      // Save the new authenticator
      const { credential } = verification.registrationInfo;
      const auth = {
        credentialID: credential.id, // Base64URLString
        credentialPublicKey: credential.publicKey, // Uint8Array
        counter: credential.counter,
        transports: credential.transports ?? [],
      };
      user.authenticators.push(auth);
      // Clean up challenge
      delete user.challenge;
      console.log('Registration successful:', auth);
      res.json({ verified: true });
    } else {
      res.status(400).json({ verified: false, error: 'Verification failed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. LOGIN - GENERATE CHALLENGE
app.post('/login-challenge', async (req, res) => {
  const { username } = req.body;
  const user = users[username];
  if (!user || user.authenticators.length === 0) {
    return res.status(404).json({ error: 'User not found or no authenticators registered' });
  }
  const options = await generateAuthenticationOptions({
    allowCredentials: user.authenticators.map(auth => ({
      id: auth.credentialID, // Base64URLString
      type: 'public-key',
      transports: auth.transports,
    })),
  });
  // Store the challenge temporarily
  user.challenge = options.challenge;
  res.json(options);
});

// 4. LOGIN - VERIFY RESPONSE AND CREATE JWT
app.post('/login-verify', async (req, res) => {
  const { username, response } = req.body;
  const user = users[username];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  // Find the authenticator that was used for this login attempt
  const authenticator = user.authenticators.find(
    auth => auth.credentialID === response.id
  );
  if (!authenticator) {
    return res.status(400).json({ error: 'Authenticator not recognized' });
  }
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credentialID, // Base64URLString
        publicKey: authenticator.credentialPublicKey, // Uint8Array
        counter: authenticator.counter,
        transports: authenticator.transports,
      },
    });
    if (verification.verified) {
      // IMPORTANT: Update the authenticator's counter
      authenticator.counter = verification.authenticationInfo.newCounter;
      // Clean up challenge
      delete user.challenge;
      // Create a JWT
      const token = jwt.sign(
        { username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      res.json({ verified: true, token });
    } else {
      res.status(400).json({ verified: false, error: 'Verification failed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Protected Route ---
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

app.get('/profile', verifyToken, (req, res) => {
  // In a real app, you'd fetch this from the database
  res.json({
    message: `Welcome, ${req.user.username}! This is a protected resource.`,
  });
});

const port = 3001;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});