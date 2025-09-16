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
const { PrismaClient } = require('./generated/prisma/client');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ORIGIN }));

const prisma = new PrismaClient();

// --- Relying Party Info ---
const rpName = process.env.RP_NAME;
const rpID = process.env.RP_ID;
const origin = process.env.ORIGIN;


app.post('/register-challenge', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return res.status(400).json({ error: 'Username already taken' });
  }
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: isoUint8Array.fromUTF8String(username),
    userName: username,
    attestationType: 'none',
    // For new user, no excludeCredentials
    excludeCredentials: [],
  });

  await prisma.user.create({
    data: {
      username,
      currentChallenge: options.challenge,
    },
  });
  res.json(options);
});


app.post('/register-verify', async (req, res) => {
  const { username, response } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (verification.verified) {
      
      const { credential } = verification.registrationInfo;
      await prisma.authenticator.create({
        data: {
          credentialID: credential.id, 
          credentialPublicKey: Buffer.from(credential.publicKey), 
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          userId: user.id,
        },
      });
  
      await prisma.user.update({
        where: { id: user.id },
        data: { currentChallenge: null },
      });
      console.log('Registration successful');
      res.json({ verified: true });
    } else {
      res.status(400).json({ verified: false, error: 'Verification failed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/login-challenge', async (req, res) => {
  const { username } = req.body;
  const user = await prisma.user.findUnique({
    where: { username },
    include: { authenticators: true },
  });
  if (!user || user.authenticators.length === 0) {
    return res.status(404).json({ error: 'User not found or no authenticators registered' });
  }
  const options = await generateAuthenticationOptions({
    allowCredentials: user.authenticators.map(auth => ({
      id: auth.credentialID,
      type: 'public-key',
      transports: auth.transports,
    })),
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { currentChallenge: options.challenge },
  });
  res.json(options);
});


app.post('/login-verify', async (req, res) => {
  const { username, response } = req.body;
  const user = await prisma.user.findUnique({
    where: { username },
    include: { authenticators: true },
  });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const authenticator = user.authenticators.find(
    auth => auth.credentialID === response.id
  );
  if (!authenticator) {
    return res.status(400).json({ error: 'Authenticator not recognized' });
  }
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: new Uint8Array(authenticator.credentialPublicKey),
        counter: Number(authenticator.counter),
        transports: authenticator.transports,
      },
    });
    if (verification.verified) {
      // IMPORTANT: Update the authenticator's counter
      await prisma.authenticator.update({
        where: { id: authenticator.id },
        data: { counter: BigInt(verification.authenticationInfo.newCounter) },
      });
    
      await prisma.user.update({
        where: { id: user.id },
        data: { currentChallenge: null },
      });
    
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
  res.json({
    message: `Welcome, ${req.user.username}! This is a protected resource.`,
  });
});

const port = 3001;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});