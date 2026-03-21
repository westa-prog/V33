import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
(window as any).__GOOGLE_CLIENT_ID__ = clientId;

const root = ReactDOM.createRoot(rootElement);

// Always provide context so OAuth hooks never run outside GoogleOAuthProvider.
// If clientId is missing, keep app stable and gate the login action in UI.
const AppTree = (
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId || 'missing-google-client-id'}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);

root.render(AppTree);
