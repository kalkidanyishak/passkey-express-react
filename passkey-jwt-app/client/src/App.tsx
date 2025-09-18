// src/App.jsx
import { useState } from 'react';
import { useAuth } from './useAuth'; // Import our new custom hook

function App() {
  // The only state this component manages is the input field value
  const [username, setUsername] = useState('');

  // Consume the auth hook to get state and functions
  const {
    isLoggedIn,
    profileMessage,
    isProfileLoading,
    register,
    isRegistering,
    login,
    isLoggingIn,
    logout,
  } = useAuth();

  const handleRegister = () => {
    if (!username) return alert('Please enter a username');
    register(username);
  };

  const handleLogin = () => {
    if (!username) return alert('Please enter a username');
    login(username);
  };

  const isActionPending = isRegistering || isLoggingIn;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Passkey + JWT Demo (Logic Separated)</h1>
      
      {!isLoggedIn ? (
        <div>
          <h2>Register or Login</h2>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            disabled={isActionPending}
          />
          <br />
          <br />
          <button onClick={handleRegister} disabled={isActionPending}>
            {isRegistering ? 'Registering...' : 'Register Passkey'}
          </button>
          <button onClick={handleLogin} disabled={isActionPending}>
            {isLoggingIn ? 'Logging in...' : 'Login with Passkey'}
          </button>
          <p><small>Enter a username, then click Register first.</small></p>
        </div>
      ) : (
        <div>
          <h2>Welcome!</h2>
          {isProfileLoading ? (
            <p>Loading profile...</p>
          ) : (
            <p>{profileMessage}</p>
          )}
          <button onClick={logout}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default App;