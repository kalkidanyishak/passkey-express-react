import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

// Configure axios to point to your backend
const api = axios.create({
  baseURL: 'http://localhost:3001',
});

function App() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  // Check for token on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      getProfile();
    }
  }, []);

  const handleRegister = async () => {
    try {
      // 1. Get challenge from server
      const challengeResponse = await api.post('/register-challenge', { username });
      const options = challengeResponse.data;

      // 2. Use browser to create credentials (updated for @simplewebauthn/browser v11+)
      const attestation = await startRegistration({ optionsJSON: options });

      // 3. Send credentials to server for verification
      const verificationResponse = await api.post('/register-verify', {
        username,
        response: attestation,
      });

      if (verificationResponse.data.verified) {
        alert('Registration successful!');
      } else {
        alert(`Registration failed: ${verificationResponse.data.error}`);
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert(`Registration failed: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleLogin = async () => {
    try {
      // 1. Get challenge from server
      const challengeResponse = await api.post('/login-challenge', { username });
      const options = challengeResponse.data;

      // 2. Use browser to authenticate (updated for @simplewebauthn/browser v11+)
      const assertion = await startAuthentication({ optionsJSON: options });

      // 3. Send assertion to server for verification
      const verificationResponse = await api.post('/login-verify', {
        username,
        response: assertion,
      });

      if (verificationResponse.data.verified) {
        // 4. Store JWT and update state
        localStorage.setItem('token', verificationResponse.data.token);
        setIsLoggedIn(true);
        getProfile();
        alert('Login successful!');
      } else {
        alert(`Login failed: ${verificationResponse.data.error}`);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert(`Login failed: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setProfileMessage('');
  };

  const getProfile = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await api.get('/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setProfileMessage(response.data.message);
    } catch (error) {
      console.error('Failed to fetch profile', error);
      // If token is invalid/expired, log out the user
      if (error.response && (error.response.status === 403 || error.response.status === 401)) {
        handleLogout();
      }
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Passkey + JWT Demo</h1>
      {!isLoggedIn ? (
        <div>
          <h2>Register or Login</h2>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            style={{ padding: '8px', marginRight: '10px' }}
          />
          <button onClick={handleRegister} style={{ padding: '8px', marginRight: '5px' }}>
            Register Passkey
          </button>
          <button onClick={handleLogin} style={{ padding: '8px' }}>
            Login with Passkey
          </button>
          <p><small>Enter a username, then click Register first.</small></p>
        </div>
      ) : (
        <div>
          <h2>Welcome!</h2>
          <p>{profileMessage}</p>
          <button onClick={handleLogout} style={{ padding: '8px' }}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default App;